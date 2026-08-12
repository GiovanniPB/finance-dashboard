# pagar.me — Integração Profunda (Financeiro + Dashboard de Vendas)

> **Propósito:** plano de execução para transformar o pagar.me de "fonte de eventos
> fiscais" em **fonte de verdade das vendas e dos recebíveis** do grupo — integrada
> aos lançamentos, ao DRE, ao fluxo de caixa e ao "a receber" — mais um dashboard
> de vendas completo (evolução, receita, churn, MRR, split por empresa).
>
> **Data:** 12/08/2026 · **Status:** Fase 0 concluída; Fases 1–6 pendentes
> **Pré-leitura:** [`pagarme-api-contract.md`](pagarme-api-contract.md) (contrato
> validado na Fase 0 — **leia antes de modelar**) · [`nfse-system.md`](nfse-system.md)
> (esteira atual) · [`../../pagarme.md`](../../pagarme.md) (API v5)

---

## 1. Diagnóstico: o que acontece hoje

### 1.1 O modus operandi real (levantado no banco, não no relato)

A hipótese de trabalho era "existe uma conta `pagar.me` com o saldo a receber e a
gente transfere de lá". **Não é isso que os dados mostram** — e o que existe é pior:

Não há nenhuma `bank_accounts` de pagar.me. O que existe é **um lançamento único
por mês**, direto na conta bancária real:

| description                      | company | amount     | accrual_date | cash_date  | conta    |
| -------------------------------- | ------- | ---------- | ------------ | ---------- | -------- |
| `PLATAFORMA RCO -  pagar-me`     | RCO     | 140.791,73 | 2026-06-30   | 2026-07-31 | C6 RCO   |
| `PLATAFORMA RCO -  pagar-me`     | RCO     | 152.659,77 | 2026-05-10   | 2026-06-10 | C6 RCO   |
| `Plataforma RCO -  Pagar-me`     | Jimmy   | 13.614,30  | 2026-05-30   | 2026-06-30 | BB Jimmy |
| `PLATAFORMA RCO - vindi e pagar` | RCO     | 103.326,20 | 2025-12-31   | 2026-01-10 | C6 RCO   |
| `recebimento de ted - pagar me`  | RCO     | 12.686,58  | 2026-07-31   | 2026-08-10 | C6 RCO   |

Todos em `1.01 Venda de Serviços`, `status='settled'`. Padrão: competência no
último dia do mês M, caixa no dia 10 de M+1. Valores entre R$ 21k e R$ 152k.
Em agosto/2026 começou a se fragmentar em 3 TEDs — o processo manual já está
cedendo.

### 1.2 Os problemas que isso causa

1. **Spike de caixa.** Um mês inteiro de vendas cai num único dia, numa única
   conta. O fluxo de caixa e o gráfico de saldo viram um serrote, e a projeção
   de qualquer dia que não seja "dia 10" é errada.
2. **Nenhuma projeção de recebíveis.** Vendemos em até 12x e os payables do
   pagar.me têm data de liquidação conhecida **no momento da venda**. Hoje esse
   cronograma não existe em lugar nenhum do sistema: o "a receber" ignora
   integralmente a maior fonte de receita do grupo.
3. **Receita líquida disfarçada de bruta.** O valor lançado é o que o pagar.me
   transferiu (líquido de MDR/taxas/antecipação). Logo: `1.01` subestima a receita
   bruta, e a despesa financeira de meio de pagamento **não aparece na DRE**.
   Isso também descasa do fiscal: a NFS-e é emitida sobre o valor **bruto** da
   cobrança (é o que a esteira atual faz).
4. **Estorno e chargeback invisíveis.** Somem dentro do líquido, sem rastro.
5. **Zero granularidade.** Sem cliente, sem produto/plano, sem parcela, sem meio
   de pagamento, sem taxa de aprovação. Impossível analisar venda.
6. **Trabalho manual mensal**, com conciliação no olho.

### 1.3 O ativo que já temos (e que muda o custo desse projeto)

A esteira NFS-e já construiu **quase toda a infraestrutura de ingestão**:

| Peça existente                                                                | Reaproveitamento                                                     |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `pagarme_accounts` (4 contas, segredo no Vault)                               | multi-conta pronta — nada a fazer                                    |
| `pagarme_recipient_map` (recebedor → empresa)                                 | **é o que resolve "de quem é o dinheiro"** no split                  |
| `pagarme-webhook` (valida segredo, idempotente)                               | só precisa passar a rotear mais tipos de evento                      |
| `sales_events` (371 eventos brutos, `charge.paid`)                            | ingest bruto já existe                                               |
| `nfse-backfill` (enumera `/charges`, hidrata, resumível por cursor + pg_cron) | **o motor de backfill histórico já está escrito e provado**          |
| `_shared/nfse/payables.ts` (`GET /payables?charge_id=`)                       | já chamamos o endpoint certo — ver 1.4                               |
| `invoice_jobs` (3.959 jobs, R$ 4,46M, jan–ago/26)                             | prova que o volume e o histórico são acessíveis                      |
| `create_transfer` + `transfer_group_id` + `v_transactions`                    | **já resolve o spike** — ver 1.5                                     |
| `forecast_cashflow_daily`                                                     | já projeta AR pendente por `due_date` — ganha os recebíveis de graça |

### 1.4 A informação que estamos jogando no lixo

`supabase/functions/_shared/nfse/payables.ts` chama `GET /payables?charge_id=` e
**descarta tudo exceto o valor líquido por recebedor**:

```ts
// parsePayables — hoje só agrega amount por recipient
if (p.type === "credit") byRecipient.set(recipientId, cur + amount);
```

O payable do pagar.me carrega, por parcela: `installment`, `payment_date`
(**a data de liquidação prevista, já no momento da venda**), `fee`,
`anticipation_fee`, `fraud_coverage_fee`, `status` (`waiting_funds` | `paid`),
`type` (`credit`/`refund`/`chargeback`), `recipient_id`, `accrual_at` e
`liquidation_arrangement_id`.

**Isso é exatamente o cronograma de recebíveis que falta no "a receber".** Já
estamos fazendo a chamada HTTP e descartando o payload. É o maior ganho
disponível pelo menor esforço do projeto.

> Confirmado contra a API de produção na Fase 0 — ver
> [`pagarme-api-contract.md`](pagarme-api-contract.md). O parser completo já está
> implementado em `_shared/pagarme/payables.ts`.

### 1.5 O spike já tem solução no repositório

O PR de transferências entre contas (`20260730163632`) criou o padrão exato:
duas pernas com `transfer_group_id`, que **entram** no saldo/extrato por conta e
**não entram** na DRE/fluxo/KPIs (recorte nas views `v_transactions`).

O spike de hoje existe por um único motivo: **a TED do pagar.me é lançada como
receita (`1.01`) em vez de transferência.** Modelando o pagar.me como conta e o
saque como transferência, o spike desaparece sem nenhuma lógica nova — a receita
passa a ser reconhecida no dia de cada liquidação, diluída, e a TED vira o que
ela é: dinheiro trocando de bolso.

---

## 2. Arquitetura alvo

```
                    ┌──────────────── pagar.me API v5 ────────────────┐
                    │  webhooks (N tipos)        polling (sync/backfill) │
                    └───────┬────────────────────────────┬─────────────┘
                            ▼                            ▼
                  pagarme-webhook (router)        pagarme-sync (cron)
                  · valida segredo da conta       · /charges + /charges/{id}
                  · grava sales_events            · /payables?charge_id=
                  · dispatch por type             · /subscriptions
                            │                     · settlements/transfers
                            └──────────┬──────────┘
                                       ▼
        ┌────────────────── LEDGER DE VENDAS (novo) ──────────────────┐
        │  pagarme_customers · pagarme_subscriptions · pagarme_charges │
        │  pagarme_receivables (1 linha por parcela × recebedor)       │
        │  pagarme_payouts    · pagarme_sync_runs                     │
        └───────────┬──────────────────────────────┬──────────────────┘
                    │                              │
        ┌───────────▼──────────┐        ┌──────────▼───────────────────┐
        │  DASHBOARD DE VENDAS │        │  PROJEÇÃO → FINANCEIRO       │
        │  GMV, receita, MRR,  │        │  RPC pagarme_project_ledger  │
        │  churn, cohort,      │        │  · AR por dia de liquidação  │
        │  aprovação, split    │        │  · taxa → despesa financeira │
        └──────────────────────┘        │  · estorno → dedução         │
                                        │  · saque → create_transfer   │
                                        └──────────┬───────────────────┘
                                                   ▼
                                    transactions (fonte de verdade única)
                                    → DRE (competência + caixa)
                                    → fluxo de caixa / forecast
                                    → a receber
                                    → conciliação
```

**Princípio de separação:** o ledger de vendas é **espelho do pagar.me**
(imutável do nosso lado, ressincronizável). `transactions` é **projeção
contábil** dele. Nunca o contrário. Assim um re-sync corrige o financeiro sem
perder edição manual, e o dashboard de vendas nunca depende de classificação
contábil.

**Por que não reaproveitar `invoice_jobs`:** fiscal ≠ financeiro. Um charge pode
não gerar nota (empresa sem config fiscal), e uma nota pode ser rejeitada
enquanto o dinheiro entra normalmente. Além disso `invoice_jobs` é
1 linha por (charge × recebedor); recebível é 1 linha por
(charge × recebedor × **parcela**). Tabelas separadas, ligadas por `charge_id`.

---

## 3. Decisões de política contábil

Decididas com o dono do repo em 12/08/2026 (D2, D3, D4). D1 e D5 seguem como
recomendação — confirmar antes do PR 6 (write-back), único que depende delas.

| #      | Decisão                               | Resolução                                                                                                                                            | Status          |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **D1** | Receita bruta ou líquida              | **Bruta** em `1.01` + taxa como despesa financeira em `7.09 Taxas de Meio de Pagamento`. Casa com a NFS-e e revela o custo real de adquirência.      | recomendado     |
| **D2** | Competência de venda em 12x           | **Integral na data do pagamento** (`charge.paid`) — mesmo fato que gera a nota fiscal. Caixa distribuído pelas 12 liquidações. Sem receita diferida. | ✅ **decidido** |
| **D3** | Granularidade dos lançamentos         | **1 lançamento por (empresa × dia de liquidação × grupo de produto)** — ~500 linhas/ano. Detalhe por cliente/parcela fica no ledger de vendas.       | ✅ **decidido** |
| **D4** | Data de corte                         | **01/09/2026.** Histórico anterior fica intacto; a partir do corte, só a esteira automática lança em `1.01` para origem pagar.me.                    | ✅ **decidido** |
| **D5** | Estorno/chargeback de período fechado | **Lançar no período corrente** como dedução de receita (`2.09`), sem reabrir mês fechado.                                                            | recomendado     |

**Consequências de D2 + D3 para o desenho:**

- A venda tem **uma** competência (`accrual_date` = `paid_at` do charge) e **N**
  datas de caixa (`expected_payment_date` de cada payable). Como `transactions`
  já separa `accrual_date` de `cash_date` e a DRE é dual-basis
  (`dre_by_company` devolve `total` e `total_cash`), isso cabe no modelo atual
  **sem nenhuma mudança de schema em `transactions`**.
- Mas um lançamento agregado por dia de liquidação carrega recebíveis de vendas
  com **competências diferentes** (parcela 3 de uma venda de maio e parcela 1 de
  uma venda de agosto liquidam no mesmo dia). Um único `accrual_date` por linha
  não representa as duas.
  **Resolução:** a chave de agregação é
  `(empresa × dia de liquidação × mês de competência × grupo de produto)`.
  Mantém o regime de competência exato, e o volume continua baixo — cada dia de
  liquidação toca poucos meses de competência (limitado a 12 pelo prazo máximo
  de parcelamento).
- `pagarme_receivables.transaction_id` aponta para a linha agregada (N→1), que é
  o que garante idempotência do recompute e o drill-down na UI.

**Consequência de D4:** o corte é **por origem, não por conta** — lançamentos
manuais em `1.01` continuam permitidos depois de 01/09; o que a esteira controla
é apenas o que ela mesma gera. A view de saúde (`v_pagarme_ledger_health`)
acusa mês pós-corte que tenha as duas origens de receita pagar.me.

---

## 4. Fases

Cada fase é um PR com `bun run preflight` verde, migrations testadas com
`db:reset` local, e `src/types/database.ts` regenerado no mesmo PR.

### Fase 0 — Contrato com a API ✅ **CONCLUÍDA** (12/08/2026)

**Resultado completo:** [`pagarme-api-contract.md`](pagarme-api-contract.md).

**Premissa central CONFIRMADA:** `GET /payables?charge_id=` devolve
`payment_date` em payable `waiting_funds`. Venda de 12x paga no dia da sondagem
retornou as 12 parcelas com data de liquidação definida, somando exatamente o
valor da cobrança, com MDR real de 3,53% — e o pagar.me já ajusta a data para
dia útil. O plano B (derivar D+30×n) está descartado.

**Entregue:** `_shared/pagarme/{time,payables,fixtures}.ts` + 30 testes;
`_shared/nfse/payables.ts` refatorado para delegar ao parser base (os 4 testes
fiscais que já existiam seguem verdes = sem regressão na esteira de notas).
Direção de dependência fixada: `_shared/pagarme/` é a camada base do provedor.

**Três achados alteram as fases seguintes** (detalhados no contrato):

1. **Correções de shape** — o campo é `accrual_at` (não `accrual_date`);
   `original_payment_date` **não existe**; `split_id` só vem por
   `/balance/operations`; existe `fraud_coverage_fee`; e
   `liquidation_arrangement_id` (`la_…`) aparece **só quando liquidado** — é um
   marcador de liquidação melhor que o próprio status.
2. **Saques não vêm pela API** — `/transfers` responde **401 por IP não
   autorizado**. Resolvido virando conciliação de extrato (ver Fase 3).
3. **Modelos de receita divergentes** — Jimmy usa assinatura anual (156/182
   eventos), RCO **não usa assinatura nenhuma** (0/173, só pedido parcelado).
   MRR/churn precisa de duas definições (ver Fase 5).

**E o tamanho do problema, medido:** os três recebedores somam
**R$ 2.507.042,25 em `waiting_funds`** — recebíveis contratados, com data
conhecida, hoje invisíveis no DRE, no fluxo e no "a receber".

---

### Fase 1 — Ledger de vendas (schema)

Migrations novas, RLS desde o primeiro dia, seguindo as convenções do projeto
(`snake_case`, `numeric(18,2)`, `metadata jsonb`, triggers de timestamp/audit).

**Tabelas:**

```
pagarme_customers        (pagarme_account_id, pagarme_customer_id) unique
  name, email, document, document_type, first_purchase_at, metadata

pagarme_subscriptions    (pagarme_account_id, pagarme_subscription_id) unique
  pagarme_customer_id, plan_id, plan_name, status, interval, interval_count,
  billing_type, start_at, next_billing_at, canceled_at,
  current_cycle_start, current_cycle_end, mrr numeric(18,2)

pagarme_charges          (pagarme_account_id, pagarme_charge_id) unique
  organization_id, pagarme_order_id, pagarme_invoice_id,
  pagarme_subscription_id, pagarme_plan_id, pagarme_customer_id,
  status, payment_method, installments,
  amount numeric(18,2),            -- BRUTO
  paid_amount, refunded_amount,
  charge_created_at, paid_at,      -- timestamptz UTC (reusar pagarmeTimestamp)
  card_brand, card_last_four, acquirer_name, recurrence_cycle,
  sales_event_id, last_synced_at, metadata

pagarme_receivables      (pagarme_account_id, pagarme_payable_id) unique
  organization_id, pagarme_charge_id, pagarme_recipient_id,
  company_id,                      -- resolvido via pagarme_recipient_map / owner
  type, status, installment,
  amount numeric(18,2), fee, anticipation_fee, fraud_coverage_fee,
  net_amount numeric(18,2) generated always as
    (amount - fee - anticipation_fee - fraud_coverage_fee),
  expected_payment_date date,      -- valor CORRENTE da API
  first_seen_payment_date date,    -- gravado no 1º insert, nunca atualizado
  sale_accrual_at timestamptz,     -- `accrual_at` do payable (a venda)
  settled_on date,                 -- = expected_payment_date quando status='paid'
  liquidation_arrangement_id text, -- `la_…` só quando liquidado
  split_id text,                   -- `sr_…` só via /balance/operations
  gateway_id text,
  transaction_id uuid references transactions(id),   -- write-back (agregado)
  last_synced_at, metadata

pagarme_payouts          (pagarme_account_id, external_ref) unique
  -- NÃO vem da API (ver Fase 3d): nasce da linha do extrato bancário
  pagarme_recipient_id, company_id, amount, status,
  funded_on, bank_account_id, transfer_group_id,
  statement_line_id,               -- origem na conciliação
  metadata

pagarme_sync_runs        -- espelha invoice_backfill_runs, generalizado
  resource ('charges'|'payables'|'subscriptions'|'balance_operations'), janela,
  page_cursor, status, contadores, last_error, attempts
```

**Detalhes que importam:**

- `pagarme_payable_id` como `text`: a API devolve **number** em `/payables` e
  **string** em `/balance/operations` (confirmado) — o parser normaliza para
  string e a coluna acompanha, em vez de escolher um dos dois formatos.
- `first_seen_payment_date` substitui o `original_payment_date` que o plano
  supunha existir: **não existe no payload**. Antecipação = divergência entre
  `expected_payment_date` e `first_seen_payment_date` com `anticipation_fee > 0`.
- `settled_on` deriva de `expected_payment_date` quando `status='paid'` — não há
  campo separado de data efetiva. `liquidation_arrangement_id` é o marcador
  confiável de que liquidou de fato.
- Datas de liquidação vêm como meia-noite BRT em UTC; converter com
  `saoPauloDate()` (já implementado e testado) antes de gravar em coluna `date`.
- `company_id` **vem do recebedor do payable**, não do dono da conta — é assim
  que a RCO (recebedora dentro da conta da Jimmy) recebe o AR correto.
- Índices para as consultas do dashboard e da projeção:
  `(company_id, expected_payment_date) where status='waiting_funds'`,
  `(company_id, paid_at)`, `(pagarme_charge_id)`, `(pagarme_subscription_id)`.
- **Enums em migration separada:** `alter type ... add value` não pode ser usado
  na mesma transação em que é adicionado. Portanto:
  - migration A: `alter type data_module add value 'sales'` +
    `alter type bank_account_type add value 'payment_gateway'`
  - migration B: tabelas/policies que usam os novos valores.
- **RLS** (padrão do modelo de permissões atual):
  ```sql
  -- leitura: escopo por empresa + módulo
  using (public.has_company_access(company_id) and public.can_view_module('sales'))
  -- escrita: admin/editor
  using (public.has_company_write_access(company_id))
  ```
  Tabelas sem `company_id` (`pagarme_customers`, `pagarme_subscriptions`) fazem
  o escopo pela empresa dona da conta, como `invoice_backfill_runs` já faz.
  `pagarme_customers` guarda PII → considerar restringir a `is_financial_user()`.
- Escrita das Edge Functions via **service role** (bypassa RLS), como hoje.

---

### Fase 2 — Ingestão (webhooks + sync + backfill histórico)

**2a. `pagarme-webhook` vira roteador.** Hoje ele só entende `charge.paid` e o
trata como fato fiscal. Passa a: gravar todo evento em `sales_events`
(idempotente, como já faz) e **despachar por `type`**:

| Evento                                                               | Efeito                                                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `charge.paid`                                                        | upsert charge + **fetch payables** + explosão fiscal (hoje) |
| `charge.created` / `charge.payment_failed`                           | upsert charge (taxa de aprovação / funil)                   |
| `charge.refunded` / `charge.chargedback` / `charge.partial_canceled` | re-sync payables → recebíveis negativos                     |
| `invoice.created` / `invoice.paid` / `invoice.payment_failed`        | ciclo de assinatura (churn involuntário)                    |
| `subscription.created` / `subscription.canceled`                     | upsert assinatura (MRR / churn voluntário)                  |
| `customer.created` / `customer.updated`                              | upsert cliente                                              |

> Invariante a preservar: **só `charge.paid` gera nota.** A esteira fiscal não
> pode ser afetada por eventos novos. Cobertura por teste sobre `pipeline.ts`.
> Configurar os eventos novos no painel do pagar.me é passo de operação, não de código.

**2b. `pagarme-sync` (Edge Function nova + pg_cron).** Clona o padrão resumível
do `nfse-backfill` (cursor por página, K páginas por invocação, `net.http_post`
via `nfse_cron_invoke`, backoff, `MAX_ATTEMPTS`):

- **Realização das liquidações (diário) — via `/balance/operations`.** É a via
  primária: a sondagem mostrou que ela devolve o payable liquidado dentro de
  `movement_object` (com `status: paid`, `liquidation_arrangement_id` e o bônus
  do `split_id`), é paginável de verdade e tem limite de 300/min. Parser já
  pronto: `parseBalanceOperationPayables()`.
- **Maturidade por cobrança (diário) — rede de segurança.** O `/payables` global
  tem paginação quebrada (`paging: {}` vazio, confirmado) — só `?charge_id=`
  funciona. Então **não** varremos tudo: re-consultamos apenas charges com
  recebível `waiting_funds` e `expected_payment_date <= hoje + 3` que as
  operações de saldo não cobriram. Cobre antecipação (muda `payment_date` e gera
  `anticipation_fee` — detectada por `first_seen_payment_date`) e estorno.
- **Assinaturas (diário)** — `/subscriptions` paginado. **Só a conta Jimmy tem
  assinaturas** (a RCO devolve vazio); o sync deve tratar conta sem assinatura
  como caso normal, não como erro.
- Respeitar rate limits: `/charges` 200/min (página cap 30 — confirmado),
  `/payables` 700/min, `/subscriptions` 200/min, `/balance/operations` 300/min.

> **Dimensionamento medido:** a conta RCO produção tem **2.076 cobranças pagas**
> (`paging.total`). São ~70 páginas de enumeração + 1 chamada de `/payables` por
> cobrança — dentro do limite de 700/min, ~3 min de chamadas para o backfill
> completo de uma conta.

**2c. Backfill histórico.** Reusar a mecânica do `nfse-backfill` para popular o
ledger desde jan/2026 (já sabemos que o histórico é acessível: 3.959 jobs
vieram dele). Modo `dry_run` primeiro, com preview agregado — igual ao fiscal.
Ganho imediato: o dashboard de vendas nasce com 8 meses de histórico.

---

### Fase 3 — Write-back financeiro (o núcleo)

**3a. Conta gateway.** Uma `bank_accounts` com `account_type='payment_gateway'`
por (conta pagar.me × empresa recebedora) — ex.: `pagar.me — RCO`,
`pagar.me — Jimmy`. É a carteira do gateway: recebe as liquidações, paga as
taxas, e sai por transferência. Config em nova tabela
`pagarme_ledger_settings` (por conta/empresa): conta gateway, conta bancária de
destino padrão dos saques, e as contas do plano para receita / taxa / estorno
(nada hardcoded).

**3b. Contas novas no plano** (via `chart_of_accounts_master` +
`seed_company_chart_of_accounts`, como fez o `9.08`):

| Código | Nome                               | kind                | Seção                |
| ------ | ---------------------------------- | ------------------- | -------------------- |
| `7.09` | Taxas de Meio de Pagamento (MDR)   | `financial_expense` | `financial_result`   |
| `7.10` | Custo de Antecipação de Recebíveis | `financial_expense` | `financial_result`   |
| `2.09` | (-) Estornos e Chargebacks         | `revenue_deduction` | `revenue_deductions` |

**3c. RPC `pagarme_project_ledger(p_company_id, p_from, p_to)`** — idempotente,
projeta o ledger de vendas em `transactions` conforme D1–D3:

| Fato no ledger                     | Lançamento gerado                                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| recebível `credit` `waiting_funds` | `inflow` em `1.01`, **bruto**, `accrual_date` = `paid_at` da venda, `due_date` = `expected_payment_date`, `status='pending'`, `bank_account_id` = conta gateway |
| recebível liquidado (`paid`)       | mesma linha → `cash_date = settled_on`, `status='settled'`                                                                                                      |
| `fee` + `anticipation_fee`         | `outflow` em `7.09`/`7.10`, competência e caixa na liquidação                                                                                                   |
| `refund` / `chargeback`            | `outflow` em `2.09` (dedução), no período corrente (D5)                                                                                                         |
| saque (`pagarme_payouts`)          | **`create_transfer(gateway → banco real)`** — fora da DRE/fluxo, dentro do saldo por conta. Origem = linha do extrato, não a API (ver 3d)                       |

Chave de agregação (D2+D3):
`(empresa × dia de liquidação × mês de competência × grupo de produto)` — preserva
o regime de competência com volume baixo. `pagarme_receivables.transaction_id`
aponta para a linha agregada (N→1), garantindo rastreabilidade e recompute
idempotente. A RPC é reexecutável: recalcula a linha agregada a partir dos
recebíveis vigentes, sem duplicar nem perder ajuste manual (linhas de origem
pagar.me são identificadas e regeneradas; o resto nunca é tocado).

**Efeito automático:** `forecast_cashflow_daily` já soma AR `pending` por
`coalesce(cash_date, due_date, accrual_date)` — **a projeção de recebíveis
aparece no forecast e no "A Receber" sem alterar nenhuma RPC existente**. E como
o saque é transferência, o spike morre.

**3d. Saque = conciliação de extrato, não ingestão de API.** A Fase 0 descobriu
que `/transfers` responde **401 por IP não autorizado** (o pagar.me restringe a
família de endpoints financeiros por allowlist de IP, e o egresso do Edge Runtime
não é fixo — pedir allowlist não é caminho). `withdrawals`/`transfers` por
recebedor vêm vazios, embora o saldo prove R$ 2,4M já transferidos.

**Isso melhora o desenho.** O saque já é observável nos dois lados que
controlamos:

1. **Extrato bancário** — a TED cai na conta real e entra pelo import/conciliação
   que já existe (é a linha `recebimento de ted - pagar me` de hoje). Dela nasce
   `pagarme_payouts` + a perna de `create_transfer`.
2. **`GET /recipients/{id}/balance`** — `waiting_funds_amount` +
   `available_amount` dão o contra-cheque exato, sem depender de endpoint
   restrito.

Menos integração, menos superfície de falha, e reusa maquinário existente.

**3e. Corte e conciliação (D4).** Migration/rotina que, a partir do corte:

- reclassifica os blobs `PLATAFORMA RCO - pagar-me` posteriores ao corte
  (reversão ou reclassificação para transferência), com relatório antes/depois;
- RPC `pagarme_reconcile_month(company, mês)` comparando, para cada mês:
  `Σ recebíveis liquidados − Σ taxas` vs `Σ saques + Δ saldo gateway` vs
  o que o blob legado dizia. Nenhum corte sem esse relatório fechando.

**Teste de conciliação de primeira classe:** `v_pagarme_ledger_health` compara
`Σ pagarme_receivables (status='waiting_funds') por recebedor` com o
`waiting_funds_amount` que a API reporta. Hoje esse número é
**R$ 2.507.042,25** — se a soma não bater, a ingestão tem furo.

**Risco #1 do projeto: duplicidade de receita** (blob legado + esteira nova no
mesmo mês). Mitigação: corte em mês fechado, RPC de conciliação obrigatória, e a
mesma view acusando mês com as duas origens.

---

### Fase 4 — UI de recebíveis e integração ao financeiro

- **`/a-receber`**: linhas de origem pagar.me agrupadas por data de liquidação,
  com drawer de detalhe (venda, cliente, parcela, taxa) lendo o ledger. Filtro
  "origem: pagar.me / manual".
- **`/forecast`**: separar a série "recebíveis pagar.me" das demais entradas
  previstas, para dar leitura de onde vem o caixa futuro.
- **`/accounts`**: conta gateway com extrato próprio (`bank_account_ledger` já
  marca `is_transfer`) — dá para auditar entradas, taxas e saques.
- **`/dre`**: nada a mudar estruturalmente — passa a ter `7.09` e `2.09`
  populados, e a receita bruta correta.
- **Conciliação**: painel com o resultado de `pagarme_reconcile_month` e as
  divergências (payables ≠ valor pago; saque sem recebível correspondente).

---

### Fase 5 — Dashboard de vendas (`/vendas`)

Lê **o ledger**, não `transactions`, e não `sales_events` (que é super-admin por
conter PII). RPCs novas (`security invoker`, conforme a convenção do projeto):

| RPC                                        | Alimenta                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `sales_overview(escopo, from, to)`         | GMV, nº de vendas, ticket médio, receita bruta/líquida, taxas, estornos, taxa de aprovação                   |
| `sales_timeseries(escopo, from, to, grão)` | evolução diária/semanal/mensal (vendas × receita)                                                            |
| `sales_breakdown(dimensão)`                | meio de pagamento, nº de parcelas, plano/produto, empresa (split), bandeira                                  |
| `sales_customers(from, to)`                | novos vs. recorrentes, ticket por coorte, LTV aproximado                                                     |
| `mrr_movement(from, to)`                   | MRR de abertura, novo, expansão, contração, churn, fechamento — **só assinatura**                            |
| `churn_metrics(from, to)`                  | churn de logo e de receita; voluntário (`subscription.canceled`) vs. involuntário (`invoice.payment_failed`) |
| `receivables_schedule(escopo, from, to)`   | curva de recebíveis futuros por data de liquidação                                                           |
| `cohort_retention(coorte_mês)`             | retenção por coorte de entrada                                                                               |

#### As duas empresas têm modelos de receita diferentes

Achado da Fase 0, medido sobre os `sales_events`: a **Jimmy** vende assinatura
anual (156 de 182 eventos com `subscriptionId`, 144 assinaturas distintas); a
**RCO** não usa assinatura nenhuma (0 de 173 — só pedido avulso parcelado), e
`GET /subscriptions` na conta dela devolve vazio.

Consequência: **não existe uma definição única de MRR/churn para o grupo.** A
Fase 5 precisa das duas, e cada métrica tem de dizer a que empresa se aplica:

| Métrica            | Jimmy (assinatura)                               | RCO (contrato parcelado)                                                      |
| ------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Receita recorrente | MRR do objeto `subscription` (`interval`/`plan`) | derivada do **cronograma de recebíveis** — contratualmente firme por 12 meses |
| Churn voluntário   | `subscription.canceled`                          | **não-renovação**: cliente sem venda nova após o fim do parcelamento          |
| Churn involuntário | `invoice.payment_failed` no ciclo                | parcela que vira `refund`/`chargeback`                                        |
| Retenção           | coorte por início de assinatura                  | coorte por 1ª compra, janela = duração do parcelamento                        |

Isso não é limitação da integração — é diferença real de modelo de negócio.
Métrica agregada do grupo só faz sentido em receita (GMV, receita líquida,
recebíveis); MRR/churn ficam segmentados por empresa.

Frontend seguindo a direção "Bento Financeiro" já estabelecida: TanStack Query,
filtros na URL via nuqs, Recharts. Módulo de permissão `sales`; empresa via
`CompanySwitcher`, com visão consolidada.

---

### Fase 6 — Operação

- Alertas de divergência (recebível órfão, saque sem lastro, payables ≠ pago,
  sync travado) na `/nfse`-style ops ou em `/vendas` → aba Saúde.
- Documentação: este plano vira `pagarme-system.md` (referência técnica, no
  padrão do `nfse-system.md`); atualizar `CLAUDE.md` e `NFSE_STATUS.md`.

---

## 5. Riscos e mitigações

| Risco                                                    | Mitigação                                                                                                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~`payment_date` não existir em `waiting_funds`~~        | ✅ **RESOLVIDO na Fase 0** — confirmado em produção; plano B descartado                                                                            |
| ~~Saques indisponíveis (`/transfers` 401 por IP)~~       | ✅ **RESOLVIDO no desenho** — saque vira conciliação de extrato + saldo do recebedor (Fase 3d)                                                     |
| **Receita duplicada no corte**                           | corte em mês fechado + `pagarme_reconcile_month` obrigatório + `v_pagarme_ledger_health`                                                           |
| `/payables` global com paginação quebrada (`paging: {}`) | só `?charge_id=`; realização primária por `/balance/operations` (paginável); sweep por cobrança só como rede de segurança                          |
| Antecipação muda a data de liquidação e cria custo       | `first_seen_payment_date` (imutável) vs. `expected_payment_date` + `anticipation_fee` → conta `7.10`                                               |
| Chargeback meses depois                                  | D5: dedução no período corrente, sem reabrir mês                                                                                                   |
| **MRR/churn não têm definição única no grupo**           | métricas segmentadas por empresa (Fase 5); agregado só em receita/recebíveis                                                                       |
| Rate limit / timeout de Edge Function                    | padrão resumível por cursor já provado no `nfse-backfill`; volume medido (2.076 cobranças ≈ 3 min)                                                 |
| Volume em `transactions`                                 | D3 (agregação diária): ~500 linhas/ano em vez de ~36k                                                                                              |
| PII de cliente (LGPD)                                    | só o mínimo; `pagarme_customers` com RLS restrita; `sales_events` segue super-admin. Payables não têm PII                                          |
| Regressão na esteira fiscal ao mexer no webhook          | ✅ já protegido: `parsePayables` fiscal delega ao parser base e seus testes seguem verdes; roteador com teste de que só `charge.paid` explode nota |

---

## 6. Ordem de execução e ganho por etapa

| PR  | Fase   | Entrega                                                   | Ganho ao final                                                             |
| --- | ------ | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | 0      | contrato da API + parsing completo de payables + fixtures | ✅ **feito** — premissa validada, 3 achados incorporados                   |
| 2   | 1      | schema do ledger + RLS + tipos                            | base pronta                                                                |
| 3   | 2a     | webhook roteador + upsert de charges/clientes             | vendas em tempo real no banco                                              |
| 4   | 2b/c   | `pagarme-sync` + cron + backfill histórico                | **8 meses de histórico de vendas**                                         |
| 5   | 5      | dashboard de vendas (lê o ledger)                         | **visibilidade de vendas — valor visível antes de tocar na contabilidade** |
| 6   | 3a/b/c | conta gateway + contas do plano + projeção                | recebíveis no "a receber" e no forecast; **fim do spike**                  |
| 7   | 3d/e   | conciliação de saque + corte                              | processo manual mensal encerrado                                           |
| 8   | 4      | UI de recebíveis/conciliação/forecast                     | operação completa                                                          |
| 9   | 6      | alertas + docs                                            | sustentável                                                                |

**Nota de sequenciamento:** o dashboard (PR 5) vem **antes** do write-back
contábil (PR 6) de propósito — ele só lê, não tem risco de corromper a DRE, e
entrega valor enquanto as decisões D1–D5 amadurecem com dados reais na mão.
