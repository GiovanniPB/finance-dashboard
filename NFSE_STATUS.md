# Nota Fiscal (Focus NFe × pagar.me) — Estado da Integração

> **Snapshot:** 17/06/2026 · Atualize ao avançar de fase.
> **Objetivo:** emitir **nota fiscal** a partir das assinaturas do pagar.me, com
> **split** entre empresas do grupo e **múltiplas contas pagar.me**
> (`1 charge.paid → N notas`). Motor **configurável multi-documento**: cada empresa
> declara seu tipo (**NF-e** produto / **NFS-e** serviço) e o sistema roteia para o
> builder + endpoint Focus certo. Gestão 100% pelo dashboard (sem SQL/Vault manual).
> **Referência técnica completa:** [`docs/integrations/nfse-system.md`](docs/integrations/nfse-system.md) (handoff — leia primeiro).
> **Docs:** [`docs/integrations/nfse-pagarme-architecture.md`](docs/integrations/nfse-pagarme-architecture.md) ·
> [`docs/integrations/nfse-implementation-plan.md`](docs/integrations/nfse-implementation-plan.md) · `focusnfe.md` · `pagarme.md`.

---

## 1. Onde estamos (resumo)

| Fase                                     | Descrição                                                          | Estado                                          |
| ---------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| **0–2 — Fundação / pipeline / pagar.me** | Schema, RLS, fila por status, explosão do split, `pagarme-webhook` | ✅ mergeado (#27–#29)                           |
| **3 — Emissão (Focus homolog.)**         | `nfse-worker` + payload aninhado + RPCs claim/token                | ✅ mergeado (#30)                               |
| **3.5 — Multi-conta pagar.me**           | `pagarme_accounts` + roteamento por conta + segredo por conta      | ✅ mergeado (#33)                               |
| **4a — UI Conexões/Config**              | Área NFS-e: conexões, recebedores, config fiscal (fluxo sem-SQL)   | ✅ mergeado (#34, #35)                          |
| **4b — UI Fila de notas**                | `invoice_jobs`: filtros, detalhe, aprovar/reemitir, download       | ✅ mergeado (#36)                               |
| **4c — UI Webhooks recebidos**           | log de `sales_events`/`focus_events` (debug)                       | ✅ mergeado (#39)                               |
| **5 — Retorno + automação**              | `focus-webhook` + Storage + endereço híbrido + `pg_cron`           | ✅ mergeado (#37, #38)                          |
| **Motor fiscal multi-documento**         | NF-e + NFS-e configurável, ViaCEP/IBGE, split via `/payables`      | 🟢 branch `feat/nfse-motor-fiscal-configuravel` |

**Resumo:** a esteira está provada de ponta a ponta (ingest → fila → emissão →
retorno por webhook/reconcile → XML/DANFSe no Storage), com automação por `pg_cron`
e gestão 100% pela UI. O **motor fiscal configurável** (branch atual) generaliza a
esteira: além da NFS-e (Barueri), passa a emitir **NF-e de produto** (Jimmy, com
imunidade de ICMS) roteando por tipo de documento; corrige a tributação (códigos do
Simples de Barueri na NFS-e; CST 41 + cBenef + PIS/COFINS tributados na NF-e); adota
o **split autoritativo via `/payables`** e o **endereço enriquecido por ViaCEP**
(IBGE). Falta write-back financeiro e o go-live de produção.

---

## 2. Decisões registradas

- **Motor multi-documento (configurável):** o tipo de documento (`fiscal_document_type`: `nfse` | `nfe`, extensível) é **config por empresa**, não hardcoded. `explodeChargePaid` e o `nfse-worker` roteiam para o builder + endpoint Focus do tipo (`/v2/nfse` ou `/v2/nfe`). Regras fiscais vêm de config (parâmetros congelados no job em `parametros` jsonb).
- **Documentos suportados:** **NFS-e** municipal de Barueri (EISS, assíncrono) e **NF-e** modelo 55 (produto/livro com imunidade de ICMS). A imunidade é só do ICMS (CST 41 + cBenef) — **PIS/COFINS são tributados** (nunca zerar).
- **Split autoritativo via `/payables`:** quando a conta tem secret key (Vault), a fatia de cada recebedor vem de `GET /payables?charge_id=` (crédito − estorno/chargeback) com validação `soma == valor pago`; divergência → revisão manual. Fallback gracioso para o `split[]` do webhook.
- **Endereço híbrido + ViaCEP:** o webhook enriquece o endereço do tomador via ViaCEP (bairro/município/UF + **IBGE**); o número segue de `line_1`. Incompleto → `pending_review`.
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
                              │  split via /payables (validado) · ViaCEP (IBGE)
                              │  explode → N invoice_jobs por tipo (document_type + snapshot)
                              ▼
                           invoice_jobs (status = fila)
                              │  status='queued'
                              ▼
                           Edge Function nfse-worker  (claim SKIP LOCKED) — DISPATCHER
                              │  monta payload do tipo + token do Vault
                              ├──POST /v2/nfse──►  Focus (Barueri)   [NFS-e serviço]
                              ├──POST /v2/nfe ──►  Focus (SEFAZ-SP)  [NF-e produto]
                              ▼
                           status: processing_authorization | rejected
                              ▲
   Focus ──webhook status──►  Edge Function focus-webhook
                              │  atualiza job · baixa XML/DANFSe(DANFE) → Storage (nfse-files)
                              ▲
   pg_cron (drain 1min / reconcile 5min) ──► nfse-worker (GET no endpoint do tipo)
                              ▼
                           [pendente] write-back financeiro
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
- `nfse_pgcron` — `nfse_cron_invoke` + agendamentos `drain` (1 min) e `reconcile` (5 min).
- `nfse_motor_fiscal_multidoc` — enum `fiscal_document_type` + colunas aditivas (tipo, emitente NF-e, Simples Barueri, classificação de produto, snapshot `parametros`) em `fiscal_company_settings`/`service_catalog`/`invoice_jobs`.
- `nfse_pagarme_api_secret` — `api_secret_ref` + RPCs `set/get_pagarme_account_secret` (split via `/payables`).

### Edge Functions (`supabase/functions/`, Deno)

- **`pagarme-webhook`** — ingest + explosão multi-conta + multi-documento; split via `/payables`, enriquecimento ViaCEP, snapshot fiscal por tipo.
- **`nfse-worker`** — **dispatcher**: drena `queued`, monta NF-e/NFS-e conforme o tipo e emite no endpoint correto; reconcile por tipo.
- **`focus-webhook`** — recebe status do Focus, atualiza o job, baixa XML/DANFSe(DANFE) → Storage.
- **`_shared/nfse/`** — `types`, `document`, `split` (roteia por tipo), `parse`, `parametros` (snapshot fiscal), `payload` (NFS-e), `payloadNfe` (NF-e), `builder` (registry endpoint), `cep` (ViaCEP), `payables` (split autoritativo), `address` (híbrido), `focus`, `fixtures`.

### Frontend (`src/features/nfse/`, rota `/nfse`)

- **Conexões pagar.me**: CRUD; URL do webhook gerada e revelada 1× (+ rotacionar); **secret key da API** (split via payables) em campo seguro → Vault; recebedores por conta.
- **Configuração fiscal** (document-type-aware): por empresa, escolhe **tipo de documento** e mostra os campos do tipo — NFS-e (IM, LC116, ISS, Simples Barueri, discriminação) ou NF-e (emitente IE/regime/série/endereço + produto NCM/CFOP/CST/cBenef/PIS/COFINS); token do Focus em campo seguro → Vault.
- **Notas**: fila `invoice_jobs` com filtros, detalhe **por tipo** (LC116/ISS × NCM/CFOP/CST/PIS-COFINS), origem do split (payables/webhook), aprovar/reemitir, baixar XML/DANFSe.
- **Webhooks**: log de debug de `sales_events`/`focus_events` (só admin).

### Testes

- **131 testes** (Vitest), verdes. Split + roteamento por tipo, parser real, payload NFS-e (Simples Barueri) e **NF-e** (CFOP/CST/cBenef/PIS-COFINS), `parametros`, `builder`, `cep` (ViaCEP), `payables`, endereço híbrido.

---

## 5. Descobertas técnicas (validadas)

1. Split do pagar.me vem em `data.last_transaction.split[]`, recebedor **aninhado** em `split[].recipient.id`.
2. `plan_id` não vem no `charge.paid`; assinatura em `data.invoice.subscriptionId`.
3. Payload do Focus NFS-e é **aninhado** (`prestador`/`tomador`/`servico`) — formato plano dá `requisicao_invalida`; o da NF-e é **plano** (`*_emitente`/`*_destinatario` + `items[]`).
4. Barueri exige no endereço do tomador: `numero`, `bairro` (+ logradouro/cep/municipio/uf) e `item_lista_servico`.
5. **NFS-e Barueri (Simples):** exige `codigo_opcao_simples_nacional=3` (ME/EPP) + `regime_tributario_simples_nacional=1`; código de serviço 2026 = `080201220` (o antigo `080214211` saiu de uso).
6. **NF-e (produto/livro):** imunidade é só do ICMS (CST 41) e SP exige `cBenef` (`SP070130`); **PIS/COFINS são tributados** (0,65% / 3%) e a **base de cálculo tem de ir explícita** (`pis_base_calculo`/`cofins_base_calculo`) — sem ela a nota é autorizada com vBC e valores zerados; CFOP `5101` interno / `6107` interestadual.
   **Numeração não é nossa:** série e próximo número vivem no painel do Focus (Empresa → Documentos fiscais), por ambiente. O `serie` do perfil fiscal só acompanha o que está lá — a faixa é definida pela contabilidade (produção: série `2` a partir do nº 1).
7. **Split:** o `/payables?charge_id=` é a fonte confiável da fatia (crédito − estorno/chargeback); o `/payables` global é quebrado p/ paginação.

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
- ⛔ **Motor fiscal multi-documento (branch atual):** `db push` das migrations `nfse_motor_fiscal_multidoc` + `nfse_pagarme_api_secret`, redeploy de `pagarme-webhook`/`nfse-worker`, e cadastro pela UI da secret key do pagar.me (split via payables) + emitente/produto da NF-e.

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
bun run db:start && bun run db:reset      # sobe stack + migrations + seed.sql (config real do grupo)
bun run test:run                          # 131 testes
supabase functions serve pagarme-webhook --no-verify-jwt
supabase functions serve nfse-worker --no-verify-jwt
supabase functions serve focus-webhook --no-verify-jwt
bun run dev                               # UI em /nfse
```

> O `supabase/seed.sql` já cria a config fiscal real (Jimmy NF-e + RCO NFS-e),
> a conta pagar.me e os recebedores — **sem segredos** (token Focus / secret key /
> webhook são cadastrados pela UI → Vault).

---

## 11. Branches / PRs

| PR      | Conteúdo                                                 | Estado                                                      |
| ------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| #27–#29 | Fundação · split · `pagarme-webhook` · parser real       | ✅ merged                                                   |
| #30     | `nfse-worker` + payload aninhado + RPCs                  | ✅ merged                                                   |
| #31     | `NFSE_STATUS.md`                                         | ✅ merged                                                   |
| #32     | `verify_jwt=false` nas functions de webhook              | ✅ merged                                                   |
| #33     | Multi-conta pagar.me                                     | ✅ merged                                                   |
| #34     | UI Fase 4a (conexões + config fiscal)                    | ✅ merged                                                   |
| #35     | Fluxo de segredos 100% pela UI                           | ✅ merged                                                   |
| #36     | UI Fase 4b — fila de notas                               | ✅ merged                                                   |
| #37     | Fase 5 — `focus-webhook` + Storage + endereço híbrido    | ✅ merged                                                   |
| #38     | pg_cron (drain + reconcile)                              | ✅ merged                                                   |
| #39     | UI Fase 4c — webhooks recebidos                          | ✅ merged                                                   |
| —       | Motor fiscal configurável multi-documento (NF-e + NFS-e) | 🟢 branch `feat/nfse-motor-fiscal-configuravel` (PR aberto) |
