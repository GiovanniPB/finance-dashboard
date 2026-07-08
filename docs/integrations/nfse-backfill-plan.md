# NFS-e — Emissão Retroativa em Lote (Backfill) · Plano de Implementação

> **Propósito:** dar contexto completo e um plano acionável para emitir **notas
> retroativas** (semanas/meses de vendas pagas que ainda não viraram NFS-e) de
> forma **escalável, segura e sem duplicar emissões**, reaproveitando ao máximo a
> esteira NFS-e já existente.
>
> **Pré-leitura obrigatória:** [`nfse-system.md`](nfse-system.md) (arquitetura
> ponta a ponta), [`pagarme.md`](../../pagarme.md) (API v5), [`focusnfe.md`](../../focusnfe.md).
>
> **Status:** proposta (nenhum código escrito). **Não fazer deploy** (Cloudflare/
> Supabase remoto são operados pelo dono do repo).
>
> **Decisões do dono (2026-07-07):** (1) jobs de backfill nascem `pending_review`
> com **bulk-approve** por run; (2) disparo **on-demand pela UI**, com pg_cron
> apenas drenando os runs até completar.

---

## 1. Problema

O sistema NFS-e hoje é **puramente passivo**: só reage a `charge.paid` recebido em
tempo real via `pagarme-webhook`. Vendas pagas **antes** do webhook estar ativo (ou
em janelas em que ele falhou/estava desligado) **não têm nota** e não há mecanismo
para recuperá-las. Precisamos emitir essas notas retroativas **em lote**.

Requisitos do dono: **escalável** (milhares de cobranças), **seguro** (retroativo
tem implicação fiscal — ver §3) e **sem duplicar emissões**.

---

## 2. Achados da análise do código atual

### 2.1 A idempotência de hoje tem duas camadas — e uma **brecha** para backfill

O fluxo passivo (`supabase/functions/pagarme-webhook/index.ts`) é idempotente em
duas camadas:

1. **`sales_events (provider, event_id)`** — webhook repetido é ignorado **antes**
   de explodir em jobs.
2. **`invoice_jobs (pagarme_charge_id, pagarme_recipient_id)`** — índice único,
   `upsert ... ignoreDuplicates`.

**Para backfill, a camada 1 não existe** (lendo da API do pagar.me não há
`event_id` de webhook). Sobra só a camada 2 — e ela tem uma **brecha**: o índice
`uq_invoice_jobs_charge_recipient` é `(charge_id, recipient_id)` com **NULLs
distintos** (comportamento padrão do Postgres; confirmado pelo comentário da
migration `20260602153319_nfse_invoice_jobs_unique_plain.sql`).

Em **cobrança sem split**, `pagarme_recipient_id` é `NULL`. Logo `(ch_123, NULL)`
**não colide** com `(ch_123, NULL)` → dois backfills, ou backfill + webhook,
criariam **notas duplicadas** da empresa dona.

> **Linchpin do plano:** fechar essa brecha com um índice único
> `NULLS NOT DISTINCT` (disponível no PostgreSQL 15+, estamos no 17). Depois disso,
> `(charge, recipient)` vira a **única unidade de idempotência**, por onde webhook,
> backfill run #1 e backfill run #2 escrevem — janelas sobrepostas ficam seguras
> por construção.

### 2.2 O sistema nunca faz chamada de saída ao pagar.me

Toda a integração pagar.me hoje é **entrada** (webhooks). O backfill precisa **ler**
cobranças históricas via `GET /charges`, o que exige a **Secret Key (`sk_…`)** do
pagar.me. Ela **não é armazenada em lugar nenhum** hoje — só o _webhook secret_ por
conta (`get_pagarme_webhook_secret`). Guardar a `sk_` no Vault (por conta) é uma
capacidade nova deste plano.

### 2.3 A lógica pura já cobre 90% do que o backfill precisa

- `_shared/nfse/split.ts` → `explodeChargePaid(event, ctx)` produz os
  `invoice_jobs` (com/sem split, classificação fiscal, endereço híbrido, status
  inicial). **Reusável sem mudança.**
- `_shared/nfse/parse.ts` → `parseChargePaidWebhook(payload)` extrai split/customer/
  address, mas espera o **envelope de webhook** (`{id, type, data}`). Precisamos de
  um parser que receba o **charge cru** da API (`GET /charges` devolve o objeto
  charge direto, dentro de `data[]`).
- `pagarme-webhook` tem `loadContext(...)` (recebedores + settings + services da
  conta) — hoje embutido na function; deve ser **extraído para `_shared`** e
  reusado pelo backfill.

**Consequência de design:** o backfill **não emite nada**. Ele só **cria
`invoice_jobs`**, idênticos aos que o webhook criaria. Emissão, retry/backoff,
webhook do Focus, reconcile e download p/ Storage **já existem e são provados** —
o backfill herda tudo isso de graça.

---

## 3. Nota fiscal: implicação de competência (retroativo)

Uma NFS-e emitida hoje para um serviço pago há 3 meses **sai com data de emissão de
hoje** (competência do mês atual) — a Focus/prefeitura não permite retroagir a data
de autorização. Isso é **decisão fiscal**, não técnica. Por isso os jobs de backfill
nascem **`pending_review`** (barreira humana) e a UI oferece **bulk-approve** por run,
para o operador revisar o lote (preview) antes de disparar milhares de emissões.

---

## 4. Arquitetura da solução

```
┌─ UI /nfse › aba "Emissão retroativa"
│    · operador escolhe conta + janela (created_since/until) → DRY-RUN
│    · preview: nº de jobs por empresa, total R$, quantos cairão em pending_review
│    · confirma → cria linha em invoice_backfill_runs (status='running')
│                         │
│                         ▼
│   pg_cron "nfse-backfill" (1–2 min) ─► Edge Function nfse-backfill (verify_jwt=false)
│     enquanto houver run 'running':
│       · lê sk_ do Vault (get_pagarme_api_key)
│       · GET /charges?status=paid&created_since&created_until&page=<cursor>&size=100
│         (Basic auth "sk:", respeita rate-limit 200/min, K páginas por invocação)
│       · por charge: parseChargeResource → loadContext → explodeChargePaid
│       · upsert invoice_jobs (ignoreDuplicates em (charge,recipient))
│       · atualiza cursor + contadores; sem mais páginas → status='completed'
│                         │
│                         ▼
│              invoice_jobs (status='pending_review', metadata.source='backfill')
│                         │  ← operador faz BULK-APPROVE do run → 'queued'
│                         ▼
│        [ ESTEIRA EXISTENTE, sem mudanças ]
│        drain (pg_cron) → nfse-worker → Focus → focus-webhook / reconcile → Storage
└─
```

**Resumível e escalável:** o run é uma máquina de estado com **cursor de página**.
Cada invocação processa K páginas (respeitando o limite de tempo do Edge) e o cron
re-aciona até `completed`. Sem reprocessar, sem estourar rate-limit, sem segurar
uma conexão longa.

---

## 5. Como a duplicidade fica impossível (resumo)

1. **`NULLS NOT DISTINCT`** → sem-split também é único por charge (fecha a brecha §2.1).
2. **`upsert … ignoreDuplicates`** em `(charge, recipient)` → webhook, backfill e
   re-runs convergem no mesmo constraint.
3. **Cursor resumível** → não reprocessa página já lida.
4. **Charge já emitida pelo fluxo passivo já tem seus jobs** → o upsert do backfill
   vira **no-op**. Overlap "live desde X" × "backfill antes de X" é seguro por
   construção.
5. **Só `status=paid`** na query → refunded/canceled/failed não geram nota.

---

## 6. Plano por fases

### Fase 0 — Validação com fixtures reais (Camada 0, **sem emitir**)

Objetivo: eliminar a incerteza que o próprio `parse.ts` documenta (onde vem o
`split[]` e o `plan_id` em cobrança de **assinatura**; presença de
`customer.address`; `paid_at`/`status`).

**Achados do 1º dry-run (2026-07-07) — cobranças avulsas, cartão, sem split:**

- ✅ `status`, `paid_at`, `amount`, `customer.document` presentes → filtro
  `status=paid` e snapshot do tomador OK. Caminho **avulso (sem split)** validado.
- ⚠️ **A LISTA (`GET /charges`) é magra:** `customer.address` **ausente na lista**,
  mas **presente (`object`) no `GET /charges/{id}`**. `last_transaction.split`
  ausente na lista **e** no detalhe (porque estas cobranças não têm split).
  → **Correção A** (ver Fase 2/3): o backfill precisa **enumerar pela lista +
  hidratar por `GET /charges/{id}`** para obter `customer.address` (e o split).
  Sem isso, todo job cairia em `pending_review` por endereço incompleto.
  _(Fallback possível: `last_transaction.card.billing_address` vem na lista, mas só
  em cartão e diverge do webhook — default seguro = detalhe.)_

**Achados do 2º dry-run (2026-07-07) — cobrança de assinatura COM split, resolve
a Correção B:** `GET /charges/{id}` de uma cobrança real de assinatura confirmou:

- ✅ Split em **`last_transaction.split[]`** (topo `split` ausente) — exatamente o
  1º caminho que `parseSplit` tenta. Recebedor em **`split[].recipient.id`**
  (`re_…`, aninhado); `amount` + `type:"percentage"` (ex.: 85/15). `allocateShares`
  já trata percentage e mantém a soma exata. **Parser não muda.**
- ✅ `customer.address` completo no detalhe (confirma de novo a Correção A).
- ✅ `invoice.subscriptionId` (`sub_…`) presente — casa com `parse.ts`.
- ⚠️ **Não existe `plan_id` na cobrança** (só `subscriptionId`). Decisão do dono:
  **classificar pelo default da empresa** (`fiscal_company_settings` / linha default
  do `service_catalog`), igual ao fluxo passivo de hoje — **sem** lookup
  `subscription→plan`. (Se um dia planos tiverem LC116/ISS distintos, aí sim
  resolver o plano; fora de escopo agora.)

**Regra de emissão confirmada:** só emite nota para recebedores **mapeados** em
`pagarme_recipient_map`; recebedor de terceiro (fora do grupo) → `skipped`. Garantir
que o mapa cobre todas as empresas do grupo que devem emitir.

**Fase 0 concluída.** Fixtures a congelar em `_shared/nfse/fixtures.ts`: avulsa (✔),
com split (✔), endereço incompleto, não-paga. Perfis **avulso e split liberados**.

### Fase 1 — Banco (migrations imutáveis; validar com `bun run db:reset`)

1. **Fechar a brecha de duplicidade** (linchpin): recriar
   `uq_invoice_jobs_charge_recipient` como
   `(pagarme_charge_id, pagarme_recipient_id) NULLS NOT DISTINCT`.
   > ⚠️ Verificar antes que não existam duplicatas de sem-split no remoto
   > (a criação do índice falha se houver). Query de checagem no PR.
2. **`invoice_backfill_runs`** — tabela de controle:
   - `id`, `organization_id`, `pagarme_account_id` (FK), `created_since`,
     `created_until` (timestamptz, **obrigatórios**), `page_cursor int default 1`,
     `page_size int default 100`, `status` (enum: `running` | `completed` |
     `failed` | `cancelled`), `dry_run boolean`, contadores
     (`charges_seen`, `jobs_created`, `jobs_skipped`), `preview jsonb` (agregado do
     dry-run), `last_error text`, timestamps, `created_by`.
   - RLS company-scoped (`has_company_access(owner da conta)`), trigger de timestamp
     e de auditoria (padrão do projeto).
3. **Vault + RPCs para a `sk_` do pagar.me** (espelham o padrão de segredos existente):
   - Coluna `pagarme_api_key_ref text` em `pagarme_accounts`.
   - `set_pagarme_api_key(p_account_id uuid, p_key text)` — `SECURITY DEFINER`,
     `grant` a `authenticated`, autoriza por `has_company_access(owner_company_id)`,
     grava no Vault `pagarme_api_key_<account_id>`. Espelha `set_company_focus_token`.
   - `get_pagarme_api_key(p_account_id uuid)` — `SECURITY DEFINER`, **só
     `service_role`**. Espelha `get_pagarme_webhook_secret`.
4. **Procedência no job:** o backfill grava `metadata.source='backfill'` e
   `metadata.backfill_run_id=<id>` (permite filtro na UI e bulk-approve por run).
5. **Regenerar `src/types/database.ts`** no mesmo PR (`bun run db:types:local`).

### Fase 2 — Lógica pura em `_shared/nfse/` (testada por **Vitest**)

- **`pagarme-api.ts`** (novo): cliente Deno-puro, `Authorization: Basic
base64("sk:")`, com **dois passos** (Correção A):
  - **Enumerar** — `GET /charges?status=paid&created_since&created_until&page&size`
    → devolve ids/status/amount/paid_at (lista magra; parsing de `{data, paging}`).
  - **Hidratar** — `GET /charges/{id}` por cobrança → traz `customer.address` e o
    `split` (dados **ausentes na lista**). É o objeto que alimenta o parser.
  - **Rate-limiter** para ambos (200 req/min cada; a hidratação domina) → espaçar
    chamadas. Funções pequenas e testáveis.
- **`parse.ts`** (refactor sem mudar comportamento): extrair `parseCharge(charge)`
  reutilizável, operando sobre o **objeto de detalhe** (`GET /charges/{id}`).
  `parseChargePaidWebhook` desembrulha o envelope e delega; `parseChargeResource
(charge)` recebe o charge de detalhe e delega. **Zero duplicação** de lógica de
  split/customer/address. _(Caminho exato do `split[]` a fixar na Fase 0/Correção B.)_
- **`context.ts`** (novo): mover o `loadContext(...)` de `pagarme-webhook` para
  `_shared` (recebe um client já criado) e passar o webhook a importá-lo — evita
  divergência entre webhook e backfill.
- **Testes AAA** com as fixtures da Fase 0 (incluindo: sem split → 1 job da dona;
  com split → N jobs; endereço incompleto → `pending_review`; charge não-paga →
  ignorada).

### Fase 3 — Edge Function `nfse-backfill` (`verify_jwt=false`, header `x-worker-secret`)

Wrapper fino sobre o `_shared`. Config em `config.toml`.

- Seleciona o run `running` mais antigo (`FOR UPDATE SKIP LOCKED` via RPC, para
  permitir concorrência segura como o `claim_nfse_jobs`).
- Lê `sk_` do Vault (`get_pagarme_api_key`). Sem chave → marca `failed` com motivo.
- Processa **K páginas** a partir de `page_cursor` (K dimensionado ao limite de
  tempo do Edge **e ao custo da hidratação** — cada charge é 1 chamada extra de
  detalhe; ex.: 1–2 páginas × 100 = 100–200 detalhes/invocação):
  - **Enumerar** `GET /charges` (página) → para cada charge paga: **hidratar**
    `GET /charges/{id}` → `parseChargeResource` → `loadContext` →
    `explodeChargePaid` → acumula linhas. (Cursor avança por página enumerada.)
  - **`dry_run=true`**: **não insere**; agrega `preview` (jobs por empresa, total
    R$, quantos `pending_review` por endereço incompleto) e grava no run.
  - **`dry_run=false`**: `upsert invoice_jobs ... ignoreDuplicates` (mesmo `toRow`
    do webhook), **forçando `status='pending_review'`** (decisão §3) + metadata de
    procedência.
  - Atualiza `page_cursor`, contadores, `updated_at`.
- Sem mais páginas (`paging` esgotado) → `status='completed'`.
- Erro de página → grava `last_error`, mantém `running` para o cron retentar
  (backoff simples); N falhas seguidas → `failed`.

> A esteira de emissão **não muda**. O backfill só popula `invoice_jobs`.

### Fase 4 — Automação (pg_cron + pg_net)

- Agendamento `nfse-backfill` (ex.: `*/1 * * * *` ou `*/2`) que aciona a function
  enquanto houver run `running`. Reusar o padrão `nfse_cron_invoke` (lê URL+segredo
  do Vault; **no-op seguro** sem segredos — ambiente local).

### Fase 5 — UI (`src/features/nfse/`, nova aba "Emissão retroativa")

- **Segredo:** no `ConnectionDrawer`, campo seguro para a `sk_` do pagar.me →
  `set_pagarme_api_key` (mesmo padrão do token do Focus). Nunca exibida de volta.
- **Novo run:** form (conta, `created_since/until` obrigatórios) → botão **Dry-run**
  → aguarda o cron rodar → exibe `preview` → botão **Confirmar emissão** cria o run
  real (`dry_run=false`).
- **Progresso:** lista de runs com status, páginas, `charges_seen`/`jobs_created`/
  `jobs_skipped` (TanStack Query + invalidação, como o resto da feature).
- **Bulk-approve:** ação que move os `pending_review` de um `backfill_run_id` para
  `queued` de uma vez (RPC ou update em lote com `has_company_access`), zerando
  `attempts`. Espelha `approveInvoiceJob`, mas por run.

---

## 7. Contratos novos (resumo)

| Artefato                                      | Tipo          | Papel                               |
| --------------------------------------------- | ------------- | ----------------------------------- |
| `invoice_backfill_runs`                       | tabela        | estado/controle do run (resumível)  |
| `pagarme_accounts.pagarme_api_key_ref`        | coluna        | ref do Vault p/ a `sk_`             |
| `set_pagarme_api_key` / `get_pagarme_api_key` | RPC           | grava (UI) / lê (worker) a `sk_`    |
| índice `NULLS NOT DISTINCT`                   | migration     | idempotência do sem-split           |
| `_shared/nfse/pagarme-api.ts`                 | módulo        | cliente `GET /charges` + rate-limit |
| `_shared/nfse/parse.ts::parseChargeResource`  | função        | charge cru → `ChargePaidEvent`      |
| `_shared/nfse/context.ts::loadContext`        | função        | contexto de explosão (extraído)     |
| `nfse-backfill`                               | Edge Function | drena um run (dry-run/real)         |
| pg_cron `nfse-backfill`                       | agendamento   | finaliza runs `running`             |
| aba "Emissão retroativa"                      | UI            | criar/monitorar run + bulk-approve  |

---

## 8. Segurança & conformidade

- `sk_` do pagar.me **só no Vault**, escrita por RPC `SECURITY DEFINER` autorizada
  por `has_company_access`; leitura só por `service_role` (Edge Function). Nunca no
  front, em coluna ou log. (Mesma disciplina do token do Focus e do webhook secret.)
- RLS em `invoice_backfill_runs`. Janela de datas **obrigatória** (evita "emitir
  tudo" por acidente). Kill-switch fiscal por empresa (`fiscal_company_settings.enabled`)
  continua valendo — empresa desabilitada não emite.
- LGPD: o backfill guarda o **mesmo snapshot mínimo** do tomador que o webhook.
- Rate-limit do pagar.me respeitado (200/min em `/charges`).

## 9. Testes

- **Vitest (primeira linha):** `_shared/nfse/{pagarme-api,parse,context}.test.ts`
  com fixtures da Fase 0 — sem chamar terceiros.
- Casos: paginação/`paging` esgotado; charge não-paga ignorada; sem split → 1 job da
  dona; com split → N jobs somando o total; endereço incompleto → `pending_review`;
  **re-run do mesmo range não cria duplicata** (idempotência); dry-run não insere.
- Alvo de cobertura 80%+ na lógica nova.

## 10. Workflow de entrega (por fase)

1. Branch por fase; `bun run preflight` antes do PR.
2. Migrations testadas com `bun run db:reset` (local, do zero) **antes** de qualquer
   `db:push`. Migrations imutáveis após merge.
3. `db:types:local` no mesmo PR das migrations.
4. **Não fazer deploy** (Edge Functions/secrets/cron/`db:push` no remoto são passos
   do dono). Documentar a ordem de go-live (registrar `sk_` pela UI, secrets/URL do
   worker no Vault, agendamento do cron) ao final.

---

## 11. Riscos & mitigações

| Risco                                                                        | Mitigação                                                                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Caminho do `split[]`/`plan_id` não confirmado** (amostra só tinha avulsas) | **Bloqueante:** obter 1 charge com split + 1 assinatura reais na Fase 0 antes de emitir split |
| Lista magra (`customer.address`/`split` só no detalhe)                       | Correção A: enumerar (lista) + hidratar (`GET /charges/{id}`)                                 |
| Duplicidade em sem-split (brecha de NULL)                                    | Índice `NULLS NOT DISTINCT` (Fase 1, linchpin)                                                |
| Duplicatas pré-existentes impedem criar o índice                             | Query de checagem + limpeza no PR da Fase 1                                                   |
| Limite de tempo do Edge com milhares de charges                              | Cursor resumível + K páginas/invocação + cron                                                 |
| Emissão retroativa em massa sem revisão                                      | Jobs nascem `pending_review`; dry-run + bulk-approve                                          |
| `sk_` vazar                                                                  | Só no Vault; leitura só service_role; nunca no front/log                                      |

---

## 12. Fora de escopo (por ora)

- Cancelamento de NFS-e emitida (enum já prevê; UI não faz).
- Write-back financeiro (`invoice_jobs.transaction_id`) — pendência herdada.
- Fonte alternativa (`/orders`, `/payables`) — `/charges` cobre o caso (o domínio
  do split vive em `charge.last_transaction`).
