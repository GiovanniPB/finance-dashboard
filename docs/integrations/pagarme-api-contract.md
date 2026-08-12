# pagar.me API v5 — Contrato Confirmado (Fase 0)

> **O que é:** resultado da sondagem read-only da API de **produção**, feita para
> validar as premissas do [plano de integração profunda](pagarme-sales-plan.md)
> antes de modelar qualquer tabela. Registra o que foi **confirmado**, o que
> **divergiu** da documentação pública, e o que **mudou no plano**.
>
> **Data da sondagem:** 12/08/2026 · **Contas:** `jimmy-carvalho-produ-o`,
> `rco-tecnologia-produ-o` (produção) · **Veredito:** premissa central confirmada,
> 3 achados alteram o plano.

---

## 1. Método (reprodutível)

As chamadas foram feitas **de dentro do Postgres**, via `pg_net`, lendo a secret
key direto do Vault para o header `Authorization`:

```sql
do $$
declare v_key text; v_req bigint;
begin
  select s.decrypted_secret into v_key
  from vault.decrypted_secrets s
  join public.pagarme_accounts pa on pa.api_secret_ref = s.name
  where pa.slug = '<slug da conta>';

  select net.http_get(
    url := 'https://api.pagar.me/core/v5/<recurso>',
    headers := jsonb_build_object(
      'Authorization', 'Basic ' || replace(encode(convert_to(v_key || ':', 'utf8'), 'base64'), E'\n', ''),
      'Accept', 'application/json')
  ) into v_req;
end $$;
-- depois: select content from net._http_response order by id desc limit 1;
```

**Por que assim:** a chave nunca sai do servidor, não precisa de deploy de Edge
Function nem de `.env` local, e todas as chamadas são `GET`. Só consulte
`net._http_response` (o `content`) — a tabela de fila `net.http_request_queue`
guarda os headers da requisição, incluindo o `Authorization`.

Fixtures fiéis (ids pseudonimizados) em
[`supabase/functions/_shared/pagarme/fixtures.ts`](../../supabase/functions/_shared/pagarme/fixtures.ts).

---

## 2. Premissa central: CONFIRMADA ✅

**A pergunta que sustentava o projeto:** `GET /payables?charge_id=` traz
`payment_date` em payable ainda **não liquidado**?

**Sim.** Cobrança de 12x paga no mesmo dia da sondagem devolveu **12 payables**,
todos `waiting_funds`, cada um com sua data de liquidação já definida:

| parcela | valor     | taxa     | liquidação (BRT) | status          |
| ------: | --------- | -------- | ---------------- | --------------- |
|       1 | R$ 397,00 | R$ 13,95 | 14/09/2026       | `waiting_funds` |
|       2 | R$ 397,00 | R$ 14,02 | 14/10/2026       | `waiting_funds` |
|       3 | R$ 397,00 | R$ 14,02 | 11/11/2026       | `waiting_funds` |
|     ... | ...       | ...      | ...              | ...             |
|      12 | R$ 397,00 | R$ 14,02 | 10/08/2027       | `waiting_funds` |

- Σ parcelas = 476.400 centavos = **valor exato da cobrança** (fecha).
- Σ taxas = R$ 168,17 → **MDR real de 3,53%**.
- O pagar.me **já ajusta a data para dia útil** (14, 14, 11, 11, 12, 11, 11, 12,
  11, 9, 9, 10) — não precisamos calcular calendário.

**Consequência:** o cronograma de recebíveis é conhecido no ato da venda. O
plano B (derivar D+30×n) está descartado, e a Fase 3 pode projetar o "a receber"
com data exata.

### 2.1 Prova complementar: venda antiga, meio liquidada

Cobrança de **02/01/2026**, 12x de R$ 97,00 — parcelas 1–7 `paid` (liquidadas de
03/02 a 03/08/2026), **8–12 `waiting_funds`** (01/09 a 29/12/2026).

Uma única venda de janeiro tem **R$ 485,00 ainda a receber**, distribuídos até
dezembro. Hoje isso não existe em nenhum lugar do sistema financeiro.

---

## 3. Shape confirmado do payable

Campos observados em `/payables` (conjunto **completo**, nas duas amostras):

```
id · status · amount · fee · anticipation_fee · fraud_coverage_fee · installment
gateway_id · charge_id · recipient_id · payment_date · type · payment_method
accrual_at · created_at · liquidation_arrangement_id (só quando paid)
```

### Divergências em relação ao que o plano assumia

| Assumido no plano             | Realidade                                                      | Ação                                                        |
| ----------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| `accrual_date`                | é **`accrual_at`**                                             | corrigido no parser e no schema                             |
| `original_payment_date`       | **não existe** no payload                                      | ver 3.1 — detecção de antecipação muda                      |
| `split_id` vem em `/payables` | **não vem**; só em `/balance/operations`                       | coluna nullable, preenchida pela via de operações           |
| —                             | `fraud_coverage_fee` existe (não estava no plano)              | somado às taxas                                             |
| —                             | `liquidation_arrangement_id` (`la_…`) só aparece quando `paid` | **marcador confiável de liquidação** — melhor que só status |
| `id` numérico ou texto?       | **number** em `/payables`, **string** em `/balance/operations` | parser normaliza os dois para string                        |
| `paging` com total            | `/payables` devolve **`paging: {}` vazio**                     | confirma que paginar `/payables` não é viável               |

### 3.1 Antecipação: como detectar sem `original_payment_date`

Sem o campo original no payload, uma antecipação só é perceptível **comparando
com o que já gravamos**. Portanto o schema precisa guardar o valor da primeira
sincronização:

- `expected_payment_date` — sempre o valor corrente da API;
- `first_seen_payment_date` — gravado no primeiro insert, **nunca atualizado**.

Divergência entre os dois + `anticipation_fee > 0` = recebível antecipado. Isso
substitui o `original_payment_date` que o plano previa.

### 3.2 Fuso: `payment_date` é meia-noite de Brasília em UTC

Todas as amostras vêm como `T03:00:00Z` (= 00:00 BRT). Para coluna `date` a
extração correta é a **data civil em São Paulo**, não a data UTC — nesse formato
as duas coincidem, mas a coincidência depende do offset. Implementado em
`saoPauloDate()` com `Intl`, com teste travando a semântica.

---

## 4. Outros endpoints

| Endpoint                           | Resultado                                                                    | Uso no plano                                        |
| ---------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| `GET /charges?status=paid`         | ✅ `size=50` devolve **30** (cap confirmado); `paging` traz `total` e `next` | backfill — 2.076 cobranças pagas na conta RCO       |
| `GET /charges?status=failed`       | ✅ populado                                                                  | **taxa de aprovação** é mensurável                  |
| `GET /charges?status=refunded`     | vazio na conta RCO                                                           | estorno existe no contrato, sem caso real p/ testar |
| `GET /subscriptions`               | ⚠️ **populado na Jimmy, VAZIO na RCO** — ver 5                               | MRR/churn só serve a uma das empresas               |
| `GET /balance/operations`          | ✅ populado; `movement_object` tem o payable **+ `split_id`**                | **feed de realização das liquidações**              |
| `GET /recipients/{id}/balance`     | ✅ `available_amount`, `waiting_funds_amount`, `transferred_amount`          | **conciliação: fecha contra a soma dos recebíveis** |
| `GET /recipients/{id}/withdrawals` | vazio                                                                        | não serve para saques                               |
| `GET /recipients/{id}/transfers`   | vazio                                                                        | não serve para saques                               |
| `GET /transfers`                   | ❌ **401 "IP de origem não autorizado a realizar essa operação"** — ver 6    | inacessível do Supabase                             |

---

## 5. Achado que muda a Fase 5: os modelos de receita são diferentes

Contagem sobre os `sales_events` já ingeridos:

| Conta            | eventos | com assinatura | com pedido | assinaturas distintas |
| ---------------- | ------: | -------------: | ---------: | --------------------: |
| Jimmy (produção) |     182 |        **156** |         26 |                   144 |
| RCO (produção)   |     173 |          **0** |        173 |                     0 |

E `GET /subscriptions` na conta RCO devolve vazio, confirmando: a RCO **não usa
assinaturas do pagar.me**. Vende contrato pago em 12x como _pedido avulso
parcelado_; a Jimmy vende **assinatura anual** (`interval: year`).

**Impacto:** MRR e churn via `/subscriptions` cobrem só a Jimmy. Para a RCO,
"recorrência" é renovação de contrato — que o pagar.me não conhece. A Fase 5
precisa de duas definições:

- **Jimmy:** MRR/churn do objeto assinatura (`subscription.canceled`,
  `invoice.payment_failed`) — o desenho original vale.
- **RCO:** receita recorrente derivada do **cronograma de recebíveis** (que já
  temos, e é contratualmente firme por 12 meses) + churn medido por
  **não-renovação** (cliente sem nova venda após o fim do parcelamento).

Isso não é uma limitação da integração — é uma diferença real de modelo de
negócio, e cada métrica precisa dizer a qual empresa se aplica.

---

## 6. Achado que muda a Fase 3: saques não vêm pela API

`/transfers` responde **401 por IP não autorizado**, e `withdrawals`/`transfers`
por recebedor vêm vazios — embora o saldo prove que **R$ 2,4M já foram
transferidos**. O pagar.me restringe a família de endpoints financeiros por
allowlist de IP (ver blocos publicados em [`pagarme.md`](../../pagarme.md)), e o
IP de egresso do Supabase não está nela.

**Resolução — não precisamos desse endpoint.** O saque já é observável de dois
lados que controlamos:

1. **O extrato bancário**: a TED cai na conta real e entra pelo import/conciliação
   que já existe (é literalmente a linha `recebimento de ted - pagar me` de hoje).
2. **O saldo do recebedor**: `waiting_funds_amount` + `available_amount` dão o
   contra-cheque exato.

Então o saque deixa de ser "ingestão de API" e passa a ser **conciliação**: a
perna de transferência (`create_transfer`) é criada a partir da linha do extrato,
e validada contra o saldo do gateway. Menos integração, menos frágil, e usa
maquinário já existente.

> Alternativa, se algum dia precisarmos do endpoint: pedir allowlist do IP de
> egresso ao pagar.me. Não recomendado — o egresso do Edge Runtime não é fixo.

---

## 7. O tamanho do problema

Saldos reais dos três recebedores mapeados, em 12/08/2026:

| Recebedor           | A receber (`waiting_funds`) |   Disponível |  Já transferido |
| ------------------- | --------------------------: | -----------: | --------------: |
| Jimmy (conta Jimmy) |             R$ 1.422.347,91 |    R$ 883,96 | R$ 1.293.810,00 |
| RCO (conta Jimmy)   |               R$ 795.376,44 |  R$ 1.089,15 |   R$ 246.323,28 |
| RCO (conta RCO)     |               R$ 289.317,90 |  R$ 9.584,52 |   R$ 896.354,14 |
| **TOTAL**           |         **R$ 2.507.042,25** | R$ 11.557,63 | R$ 2.436.487,42 |

**R$ 2,5 milhões de recebíveis contratados**, com data de liquidação conhecida,
hoje invisíveis no DRE, no fluxo de caixa e no "a receber".

`waiting_funds_amount` é também o **melhor teste de conciliação** que temos: a
soma dos nossos `pagarme_receivables` com `status='waiting_funds'` por recebedor
tem que bater com esse número. Vira `v_pagarme_ledger_health`.

---

## 8. Entregáveis da Fase 0

| Arquivo                            | O que é                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `_shared/pagarme/time.ts`          | `pagarmeTimestamp` (movido da camada fiscal) + `saoPauloDate`                                         |
| `_shared/pagarme/payables.ts`      | parser completo: `parsePayable`, `parsePayablesDetailed`, `parseBalanceOperationPayables`, agregações |
| `_shared/pagarme/fixtures.ts`      | shapes reais de produção (ids pseudonimizados) + geradores                                            |
| `_shared/pagarme/payables.test.ts` | 30 testes: shape real, split, liquidação, fuso, defensividade                                         |
| `_shared/nfse/payables.ts`         | refatorado para **delegar** ao parser base (sem mudar contrato)                                       |

**Direção de dependência estabelecida:** `_shared/pagarme/` é a camada base do
provedor; `_shared/nfse/` (fiscal) e o futuro ledger de vendas dependem dela.
O `parsePayables` fiscal virou uma projeção do parser completo — os 4 testes que
já existiam continuam passando, o que prova que não houve regressão na esteira
de notas.

**Preflight:** ✅ typecheck · lint · format · 488 testes.
