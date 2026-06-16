# NFS-e (Focus NFe × pagar.me) — Estado da Integração

> **Snapshot:** 16/06/2026 · Atualize ao avançar de fase.
> **Objetivo:** emitir NFS-e municipal (Barueri) automaticamente a partir das
> assinaturas do pagar.me, com **split** entre empresas do grupo
> (`1 charge.paid → N NFS-e`, uma por empresa-recebedora).
> **Docs de referência:** [`docs/integrations/nfse-pagarme-architecture.md`](docs/integrations/nfse-pagarme-architecture.md) ·
> [`docs/integrations/nfse-implementation-plan.md`](docs/integrations/nfse-implementation-plan.md) · `focusnfe.md` · `pagarme.md`.

---

## 1. Onde estamos (resumo)

| Fase                                | Descrição                                                                | Estado                                                          |
| ----------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **0 — Fundação**                    | Migrations no git, schema NFS-e, RLS, fila por status                    | ✅ **mergeado** (PR #27, #28)                                   |
| **1 — Pipeline interno**            | Explosão do split + Edge Function `pagarme-webhook` (ingest idempotente) | ✅ **mergeado** (PR #28)                                        |
| **2 — pagar.me**                    | Parser confirmado contra payload **real** + e2e do split                 | ✅ **mergeado** (PR #29)                                        |
| **3 — Emissão (Focus homologação)** | `nfse-worker` + payload + RPCs                                           | 🟡 **infra pronta** (PR #30, aberto) — falta emissão autorizada |
| **4 — UI no dashboard**             | Fila de revisão, aprovar/reemitir, download                              | ⬜ não iniciado                                                 |
| **5 — Produção**                    | Tokens prod, `ambiente=producao`, piloto                                 | ⬜ não iniciado                                                 |

**Resumo de uma linha:** a esteira está provada de ponta a ponta até a chamada
real ao Focus homologação (auth + estrutura + tratamento de erro OK). Faltam **2
insumos** para a primeira nota **autorizada**: classificação fiscal (LC116/ISS) e
enriquecimento do endereço do tomador.

---

## 2. Decisões registradas

- **Documento:** NFS-e **municipal de Barueri** (provedor EISS, assíncrono). Não Nacional.
- **Infra:** **Supabase-nativa** (Edge Functions + Postgres). O Focus guarda o certificado A1 e assina — nunca assinamos localmente.
- **Fila:** baseada em **status** na `invoice_jobs` (`status='queued'` + `FOR UPDATE SKIP LOCKED`). Sem pgmq.
- **Modos de emissão:** `manual` (revisão) e `automatic` — mesma esteira, flag por empresa (`emission_mode`) + kill-switch (`enabled`).
- **Cancelamento:** fora de escopo nesta fase.
- **Começar em homologação**, validar em camadas.

---

## 3. Arquitetura (resumo)

```
pagar.me  ──charge.paid──►  Edge Function pagarme-webhook
                              │  grava sales_events (idempotente)
                              │  explode split → N invoice_jobs (1 por empresa)
                              ▼
                           invoice_jobs (status = fila)
                              │  status='queued'
                              ▼
                           Edge Function nfse-worker  (claim SKIP LOCKED)
                              │  monta payload + token do Vault
                              ├──POST /v2/nfse──►  Focus NFe (homologação Barueri)
                              ▼
                           status: processing_authorization | rejected
                              ▲
   Focus ──webhook status──►  Edge Function focus-webhook  [A CONSTRUIR]
                              │  baixa XML/DANFSe → Storage → write-back transaction
```

---

## 4. O que está construído

### Banco (migrations — fonte da verdade em `supabase/migrations/`)

- `…_nfse_schema.sql` — 6 tabelas + 4 enums + RLS + triggers:
  - `fiscal_company_settings` (1:1 empresa: ambiente, emission_mode, enabled, inscrição municipal, LC116, ISS, `focus_token_ref`→Vault, optante_simples)
  - `pagarme_recipient_map` (recebedor `re_/rp_` → empresa)
  - `service_catalog` (classificação fiscal por empresa/plano)
  - `sales_events` (ingest pagar.me, idempotente por `event_id`)
  - `invoice_jobs` (unidade de trabalho = 1 NFS-e; estado, `focus_ref` único, fatia do valor, snapshot do tomador, resultado Focus)
  - `focus_events` (ingest Focus, idempotente)
- `…_nfse_invoice_jobs_unique_plain.sql` — índice único pleno (charge×recipient) p/ upsert idempotente.
- `…_nfse_worker_rpcs.sql` — RPCs `claim_nfse_jobs` (SKIP LOCKED) e `get_focus_token` (Vault, só `service_role`).

### Edge Functions (`supabase/functions/`, Deno)

- **`pagarme-webhook`** — recebe webhook, grava `sales_events`, explode o split em `invoice_jobs` (idempotente). ✅ e2e validado.
- **`nfse-worker`** — drena `queued`, monta payload, emite no Focus. ✅ infra validada (rejeição controlada).
- **`_shared/nfse/`** (código puro, testado por Vitest + usado pelas functions):
  - `types.ts`, `document.ts` (CPF/CNPJ), `split.ts` (explosão), `parse.ts` (webhook bruto → normalizado), `payload.ts` (corpo da NFS-e), `fixtures.ts`.

### Testes

- **87 testes** (Vitest), verdes. Cobrem: explosão de split (invariante de soma, modos, idempotência), parser do webhook real, montador de payload.

---

## 5. Descobertas técnicas (validadas contra dados/serviços reais)

1. **Split do pagar.me** vem em `data.last_transaction.split[]`, com recebedor **aninhado** em `split[].recipient.id` (`re_…`) — não `recipient_id`. (Bug pego no payload real.)
2. **`plan_id` não vem** no `charge.paid`; a assinatura está em `data.invoice.subscriptionId` (`sub_…`).
3. **Payload do Focus NFS-e é aninhado** (`prestador`/`tomador`/`servico`) — o formato plano da doc §11.1 retorna `requisicao_invalida`.
4. **Campos obrigatórios em Barueri** (revelados pela rejeição real): `item_lista_servico`, e no endereço do tomador `numero`, `bairro`, `codigo_municipio` (IBGE).

---

## 6. Validações já feitas

- ✅ Explosão do split com fixtures + payload real → 2 jobs, soma = total, idempotente.
- ✅ `pagarme-webhook` e2e local: `charge.paid` real → 2 `invoice_jobs` (RCO `queued` / Jimmy `pending_review`), R$882 cada; 2ª chamada → `duplicate_ignored`.
- ✅ Idempotência no banco (constraints `sales_events`/`invoice_jobs`).
- ✅ `nfse-worker` e2e contra **Focus homologação real**: claim → token do Vault → `POST /v2/nfse` → auth OK, estrutura aceita, rejeição tratada (`rejected` + `mensagem_sefaz`).
- ✅ `db reset` aplica todas as migrations do zero; `preflight` 87/87.

---

## 7. Empresas e recebedores (dados reais)

| Empresa                            | CNPJ               | Recebedor pagar.me             | Focus (homolog.)                                  |
| ---------------------------------- | ------------------ | ------------------------------ | ------------------------------------------------- |
| RCO Tecnologia                     | 55.481.643/0001-96 | `re_cmnz0qnjs1wff0l9tu8zrhyg8` | cadastrada + certificado + token no Vault (local) |
| Jimmy Carvalho Educação Financeira | 37.383.325/0001-00 | `re_cmgv7foko2q4a0l9tyv9if1mo` | cadastrada + certificado + token no Vault (local) |

- Inscrição municipal (sem hífen): RCO `5BF7555`, Jimmy `5AL6736`.
- Regime: RCO Simples Nacional (optante), Jimmy Regime Normal.
- Plano de teste: `plan_XEyOkvmcYiN0Z0K6`.

---

## 8. O que falta (roadmap restante)

### Bloqueios para a 1ª nota autorizada

1. **Classificação fiscal por empresa**: `item_lista_servico` (LC116), código tributário municipal, alíquota ISS. _(usuário providenciando)_
2. **Endereço do tomador estruturado**: `numero`, `bairro`, `codigo_municipio` (IBGE). pagar.me só dá `line_1`/cidade.
   - Abordagem recomendada: **híbrido** — derivar do pagar.me; se incompleto, job vai a `pending_review` para completar antes de emitir.

### Depois disso

3. **`focus-webhook`** (Edge Function): recebe status do Focus → atualiza job (`authorized`/`rejected`) → baixa XML/DANFSe → Storage → write-back na `transaction` + `audit_log`.
4. **`pg_cron`**: agenda o `nfse-worker` + reconciliação (poll `GET /v2/nfse/{ref}` para jobs presos).
5. **Fase 4 — UI**: fila de revisão, aprovar/rejeitar, reemitir, download XML/PDF, toggle de modo.
6. **Produção**: `db push` das migrations ao remoto, deploy das functions, registrar webhooks (pagar.me → `pagarme-webhook`, Focus → `focus-webhook`), tokens de produção no Vault, virar `ambiente=producao`.

---

## 9. Pendências de infra (ainda NÃO feitas no remoto)

- ⛔ Migrations NFS-e **não aplicadas no remoto** (`bun run db:push` pendente, após merge dos PRs).
- ⛔ Edge Functions **não deployadas** (`supabase functions deploy`).
- ⛔ Webhooks não registrados no pagar.me nem no Focus.
- ⛔ Tokens do Focus só no **Vault local** (em produção: Vault do remoto + tokens de produção).

---

## 10. Segurança

- Segredos (tokens Focus, `secret_key` pagar.me) **só no Vault** — nunca no repo. Tabelas guardam apenas `focus_token_ref`.
- Tokens de homologação foram trocados em chat durante o desenvolvimento → **gerar tokens novos para produção** (não reaproveitar).
- Webhooks verificam origem (segredo na URL/header) e são idempotentes.
- RLS em todas as tabelas; ingest bruto (`sales_events`/`focus_events`) restrito a super admin; escrita pelas functions via service role.

---

## 11. Como rodar localmente

```sh
bun run db:start          # sobe a stack local (Docker)
bun run db:reset          # aplica todas as migrations do zero
# setup de teste da esteira (recebedores → empresas + settings):
psql "$LOCAL_DB" -f docs/integrations/sql/nfse-fase2-local-setup.sql
#   (no local, mapear RCO pelo id do seed '…0013'; cnpj do seed é nulo)
# tokens do Focus no Vault local: vault.create_secret(...) + focus_token_ref

# testar functions:
supabase functions serve pagarme-webhook --no-verify-jwt   # ingest
supabase functions serve nfse-worker --no-verify-jwt       # emissão
bun run test:run          # 87 testes
```

---

## 12. Branches / PRs

| PR  | Conteúdo                                         | Estado              |
| --- | ------------------------------------------------ | ------------------- |
| #27 | Fundação NFS-e + adoção de migrations no git     | ✅ merged           |
| #28 | Camada 0 — explosão do split + `pagarme-webhook` | ✅ merged           |
| #29 | Fase 2 — parser confirmado contra payload real   | ✅ merged           |
| #30 | Infra do `nfse-worker` (payload aninhado + RPCs) | 🟡 aberto, CI verde |
