# NFS-e (Focus NFe × pagar.me) — Estado da Integração

> **Snapshot:** 17/06/2026 · Atualize ao avançar de fase.
> **Objetivo:** emitir NFS-e municipal (Barueri) a partir das assinaturas do pagar.me,
> com **split** entre empresas do grupo e **múltiplas contas pagar.me**
> (`1 charge.paid → N NFS-e`). Gestão 100% pelo dashboard (sem SQL/Vault manual).
> **Docs:** [`docs/integrations/nfse-pagarme-architecture.md`](docs/integrations/nfse-pagarme-architecture.md) ·
> [`docs/integrations/nfse-implementation-plan.md`](docs/integrations/nfse-implementation-plan.md) · `focusnfe.md` · `pagarme.md`.

---

## 1. Onde estamos (resumo)

| Fase                                     | Descrição                                                          | Estado                             |
| ---------------------------------------- | ------------------------------------------------------------------ | ---------------------------------- |
| **0–2 — Fundação / pipeline / pagar.me** | Schema, RLS, fila por status, explosão do split, `pagarme-webhook` | ✅ mergeado (#27–#29)              |
| **3 — Emissão (Focus homolog.)**         | `nfse-worker` + payload aninhado + RPCs claim/token                | ✅ mergeado (#30)                  |
| **3.5 — Multi-conta pagar.me**           | `pagarme_accounts` + roteamento por conta + segredo por conta      | ✅ mergeado (#33)                  |
| **4a — UI Conexões/Config**              | Área NFS-e: conexões, recebedores, config fiscal (fluxo sem-SQL)   | ✅ mergeado (#34, #35)             |
| **4b — UI Fila de notas**                | `invoice_jobs`: filtros, detalhe, aprovar/reemitir, download       | 🟡 PR #36 aberto                   |
| **5 — Retorno + automação**              | `focus-webhook` + Storage + endereço híbrido; depois `pg_cron`     | 🟡 PR #37 (este) — webhook/Storage |

**Resumo:** a esteira está provada de ponta a ponta até a chamada real ao Focus
homologação. A UI de gestão (conexões, config fiscal, fila de notas) está pronta e
o fluxo de credenciais é 100% pela tela. Esta fase adiciona o **retorno** do Focus
(status → XML/DANFSe → Storage). Falta `pg_cron` (automação), write-back financeiro,
e o go-live de produção.

---

## 2. Decisões registradas

- **Documento:** NFS-e **municipal de Barueri** (provedor EISS, assíncrono).
- **Infra:** **Supabase-nativa** (Edge Functions + Postgres). Focus guarda o A1 e assina.
- **Fila:** por **status** na `invoice_jobs` (`queued` + `FOR UPDATE SKIP LOCKED`).
- **Multi-conta:** cada conta pagar.me é uma `pagarme_accounts` (slug na URL, empresa dona, segredo próprio). Cobrança **com split** → N notas (recebedores da conta); **sem split** → 1 nota da empresa dona.
- **Segredos 100% pela UI:** RPCs `SECURITY DEFINER` (`rotate_account_webhook_secret`, `set_company_focus_token`) autorizam pelo `has_company_access` do usuário e escrevem no Vault. Nada de SQL/Vault manual; o front nunca vê service role nem o segredo (exceto a URL do webhook, revelada 1×).
- **Slug automático** do nome (trigger), estável (não muda em updates).
- **Endereço do tomador: híbrido** — deriva logradouro/numero/bairro de `line_1`; se incompleto, job vai a `pending_review`.
- **Cancelamento:** fora de escopo.

---

## 3. Arquitetura

```
pagar.me ──charge.paid?account=<slug>──►  Edge Function pagarme-webhook
                              │  valida segredo da conta (Vault) · grava sales_events
                              │  explode split → N invoice_jobs (ou 1 da empresa dona)
                              ▼
                           invoice_jobs (status = fila)
                              │  status='queued'
                              ▼
                           Edge Function nfse-worker  (claim SKIP LOCKED)
                              │  payload aninhado + token do Vault
                              ├──POST /v2/nfse──►  Focus NFe (Barueri)
                              ▼
                           status: processing_authorization | rejected
                              ▲
   Focus ──webhook status──►  Edge Function focus-webhook  ✅ construída
                              │  atualiza job · baixa XML/DANFSe → Storage (nfse-files)
                              ▼
                           [pendente] write-back financeiro + pg_cron
```

---

## 4. O que está construído

### Banco (`supabase/migrations/`)

- `nfse_schema` — 6 tabelas + 4 enums + RLS + triggers (`fiscal_company_settings`, `pagarme_recipient_map`, `service_catalog`, `sales_events`, `invoice_jobs`, `focus_events`).
- `nfse_invoice_jobs_unique_plain` — índice único (charge×recipient) p/ upsert idempotente.
- `nfse_worker_rpcs` — `claim_nfse_jobs` (SKIP LOCKED) e `get_focus_token` (Vault, só `service_role`).
- `nfse_pagarme_accounts` — `pagarme_accounts` + `pagarme_account_id` em recipient_map/sales_events/invoice_jobs + RPC `get_pagarme_webhook_secret`.
- `nfse_secret_rpcs` — slug automático (trigger) + `rotate_account_webhook_secret` + `set_company_focus_token`.
- `nfse_storage_bucket` — bucket `nfse-files` (privado) + RLS de leitura por empresa.

### Edge Functions (`supabase/functions/`, Deno)

- **`pagarme-webhook`** — ingest + explosão multi-conta (valida segredo por conta).
- **`nfse-worker`** — drena `queued`, monta payload, emite no Focus.
- **`focus-webhook`** — recebe status do Focus, atualiza o job, baixa XML/DANFSe → Storage.
- **`_shared/nfse/`** — `types`, `document`, `split` (explosão + gate de endereço), `parse`, `payload`, `address` (endereço híbrido), `fixtures`.

### Frontend (`src/features/nfse/`, rota `/nfse`)

- **Conexões pagar.me**: CRUD; URL do webhook gerada e revelada 1× (+ rotacionar); recebedores por conta.
- **Configuração fiscal**: por empresa (ambiente, modo, kill-switch, IM, LC116, ISS%); token do Focus em campo seguro → Vault.
- **Notas**: fila `invoice_jobs` com filtros (status/conexão), detalhe, aprovar/reemitir, baixar XML/DANFSe.

### Testes

- **95 testes** (Vitest), verdes. Split (soma/modos/idempotência/sem-split), parser real, payload, **endereço híbrido**.

---

## 5. Descobertas técnicas (validadas)

1. Split do pagar.me vem em `data.last_transaction.split[]`, recebedor **aninhado** em `split[].recipient.id`.
2. `plan_id` não vem no `charge.paid`; assinatura em `data.invoice.subscriptionId`.
3. Payload do Focus NFS-e é **aninhado** (`prestador`/`tomador`/`servico`) — formato plano dá `requisicao_invalida`.
4. Barueri exige no endereço do tomador: `numero`, `bairro` (+ logradouro/cep/municipio/uf) e `item_lista_servico`.

---

## 6. Empresas e recebedores (dados reais)

| Empresa                            | CNPJ               | Recebedor (na conta da Jimmy)  | Conta própria |
| ---------------------------------- | ------------------ | ------------------------------ | ------------- |
| RCO Tecnologia                     | 55.481.643/0001-96 | `re_cmnz0qnjs1wff0l9tu8zrhyg8` | sim           |
| Jimmy Carvalho Educação Financeira | 37.383.325/0001-00 | `re_cmgv7foko2q4a0l9tyv9if1mo` | sim           |

- IM (sem hífen): RCO `5BF7555`, Jimmy `5AL6736`. Regime: RCO Simples (optante), Jimmy Normal.
- A RCO é recebedora **dentro da conta da Jimmy** e também tem conta própria (notas exclusivas).

---

## 7. Estado do remoto (`vbeevkjenvgvnattzszt`)

- ✅ Migrations aplicadas até `nfse_storage_bucket` (`db push`); bucket `nfse-files` criado.
- ✅ Functions deployadas: `pagarme-webhook`, `nfse-worker`, `focus-webhook` (todas `verify_jwt=false`); `FOCUS_WEBHOOK_SECRET` setado.
- ⛔ **Pendente (pg_cron):** `db push` de `nfse_pgcron` + Vault `nfse_worker_url` e `nfse_worker_secret` (= `NFSE_WORKER_SECRET`); senão os ticks são no-op.
- ⛔ Registrar webhook do Focus por empresa apontando para a `focus-webhook`.
- ⛔ Conexões/config/recebedores e tokens do Focus: a cadastrar pela UI (após deploy do front).

---

## 8. O que falta (roadmap)

1. **UI de revisão de endereço**: completar `numero`/`bairro` quando o híbrido marcar incompleto (hoje fica em `pending_review`).
2. **4c — Webhooks recebidos**: visão de `sales_events`/`focus_events` + relação de split.
3. **Write-back financeiro** _(adiado por decisão)_: nota autorizada → receita na `transactions`.
4. **Produção**: registrar webhooks, tokens de produção, virar `ambiente=producao`, piloto.

> ✅ **`pg_cron`** feito: agenda `nfse-worker` `drain` (1 min) + `reconcile` (5 min); reconciliação reconsulta jobs presos em `processing_authorization`/`submitting`.

---

## 9. Segurança

- Segredos só no **Vault** (token Focus, segredo de webhook por conta). Tabelas guardam só a referência.
- Tokens trocados em chat no desenvolvimento → **gerar novos para produção**.
- Webhooks verificam origem (segredo na URL/header) e são idempotentes (`sales_events`/`focus_events`).
- RLS em tudo; ingest bruto restrito; escrita das functions via service role. Bucket `nfse-files` privado, leitura escopada por empresa.

---

## 10. Como rodar localmente

```sh
bun run db:start && bun run db:reset      # sobe stack + aplica migrations
psql "$LOCAL_DB" -f docs/integrations/sql/nfse-fase2-local-setup.sql   # 2 contas + recebedores + settings
bun run test:run                          # 95 testes
supabase functions serve pagarme-webhook --no-verify-jwt
supabase functions serve nfse-worker --no-verify-jwt
supabase functions serve focus-webhook --no-verify-jwt
bun run dev                               # UI em /nfse
```

---

## 11. Branches / PRs

| PR      | Conteúdo                                              | Estado    |
| ------- | ----------------------------------------------------- | --------- |
| #27–#29 | Fundação · split · `pagarme-webhook` · parser real    | ✅ merged |
| #30     | `nfse-worker` + payload aninhado + RPCs               | ✅ merged |
| #31     | `NFSE_STATUS.md`                                      | ✅ merged |
| #32     | `verify_jwt=false` nas functions de webhook           | ✅ merged |
| #33     | Multi-conta pagar.me                                  | ✅ merged |
| #34     | UI Fase 4a (conexões + config fiscal)                 | ✅ merged |
| #35     | Fluxo de segredos 100% pela UI                        | ✅ merged |
| #36     | UI Fase 4b — fila de notas                            | 🟡 aberto |
| #37     | Fase 5 — `focus-webhook` + Storage + endereço híbrido | 🟡 aberto |
