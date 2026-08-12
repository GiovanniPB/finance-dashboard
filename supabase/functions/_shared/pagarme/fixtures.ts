/**
 * Fixtures da API do pagar.me — **shape real de produção**, capturado em
 * 12/08/2026 (ver `docs/integrations/pagarme-api-contract.md`).
 *
 * Identificadores foram pseudonimizados (`ch_`, `re_`, `cus_`, `sub_`, `la_`,
 * `sr_`) e a PII do comprador substituída por dados fictícios; valores, datas,
 * tipos e a ORDEM/PRESENÇA dos campos são fiéis ao que a API devolve — é isso
 * que dá valor ao fixture.
 *
 * Detalhes fiéis que os testes dependem:
 *  - `/payables` devolve `id`/`gateway_id` como **number**;
 *  - `movement_object` de `/balance/operations` devolve como **string**, e é o
 *    único lugar onde aparece `split_id`;
 *  - `liquidation_arrangement_id` existe SÓ quando `status: "paid"`;
 *  - o campo de competência é `accrual_at` (não `accrual_date`);
 *  - `payment_date` é meia-noite de Brasília expressa em UTC (`T03:00:00Z`);
 *  - o envelope de `/payables` traz `paging: {}` VAZIO; o de `/charges` traz
 *    `total` e `next`;
 *  - o item da LISTA de `/charges` já inclui `customer`, `paid_at` e
 *    `last_transaction` (com `installments` e `card`) — só falta
 *    `customer.address` e `split`, que são necessidades fiscais;
 *  - a assinatura traz o id em `invoice.subscriptionId` (camelCase, não snake).
 */

/** Parcela ainda não liquidada (o caso central: cronograma futuro conhecido). */
export const PAYABLE_WAITING_RAW = {
  id: 9223071765,
  status: "waiting_funds",
  amount: 39700,
  fee: 1402,
  anticipation_fee: 0,
  fraud_coverage_fee: 0,
  installment: 2,
  gateway_id: 4512650340,
  charge_id: "ch_FIXTURE12X0001",
  recipient_id: "re_fixtureOwner0001",
  payment_date: "2026-10-14T03:00:00Z",
  type: "credit",
  payment_method: "credit_card",
  accrual_at: "2026-08-12T12:48:38Z",
  created_at: "2026-08-12T12:48:38Z",
} as const;

/** Parcela liquidada — ganha `liquidation_arrangement_id`. */
export const PAYABLE_PAID_RAW = {
  id: 8712227742,
  fee: 374,
  type: "credit",
  amount: 9700,
  status: "paid",
  charge_id: "ch_FIXTUREOLD0001",
  accrual_at: "2026-01-02T12:42:19Z",
  created_at: "2026-01-02T12:42:20Z",
  gateway_id: 4231086721,
  installment: 1,
  payment_date: "2026-02-03T03:00:00Z",
  recipient_id: "re_fixtureOwner0001",
  payment_method: "credit_card",
  anticipation_fee: 0,
  fraud_coverage_fee: 0,
  liquidation_arrangement_id: "la_fixtureArrangement01",
} as const;

/**
 * Item de `GET /balance/operations`: a operação embrulha o payable em
 * `movement_object` e devolve os ids como STRING, além de `split_id`.
 */
export const BALANCE_OPERATION_PAYABLE_RAW = {
  id: 18958961232,
  fee: 0,
  type: "payable",
  amount: 7350,
  status: "available",
  created_at: "2026-08-12T03:11:47Z",
  balance_amount: 0,
  movement_object: {
    id: "9153642813",
    fee: 0,
    type: "credit",
    amount: 7350,
    object: "payable",
    status: "paid",
    split_id: "sr_fixtureSplitRule01",
    charge_id: "ch_FIXTURESPLIT001",
    accrual_at: "2026-07-12T19:34:36Z",
    created_at: "2026-07-12T19:34:36Z",
    gateway_id: "4473583253",
    installment: 1,
    payment_date: "2026-08-12T03:00:00Z",
    recipient_id: "re_fixturePartner001",
    payment_method: "credit_card",
    anticipation_fee: 0,
    fraud_coverage_fee: 0,
    liquidation_arrangement_id: "la_fixtureArrangement02",
  },
} as const;

/** Envelope de `/payables` — `paging` vazio, como a API devolve de fato. */
export function payablesResponse(data: unknown[]): { data: unknown[]; paging: unknown } {
  return { data, paging: {} };
}

interface ScheduleOptions {
  chargeId?: string;
  recipientId?: string;
  installments?: number;
  /** Valor bruto de CADA parcela, em centavos. */
  amountCents?: number;
  /** Taxa de cada parcela, em centavos. `0` reproduz o recebedor que não arca com MDR. */
  feeCents?: number;
  /** Quantas primeiras parcelas já liquidaram (as demais ficam `waiting_funds`). */
  settledCount?: number;
  /** Data de liquidação da 1ª parcela (`YYYY-MM-DD`); as seguintes somam ~1 mês. */
  firstSettlement?: string;
  accrualAt?: string;
}

/**
 * Gera um cronograma de N parcelas no shape real, com as `settledCount`
 * primeiras liquidadas. Reproduz o caso de produção observado: venda de jan/26
 * em 12x com 7 parcelas pagas e 5 ainda a receber.
 */
export function payablesSchedule(options: ScheduleOptions = {}): Record<string, unknown>[] {
  const {
    chargeId = "ch_FIXTURE12X0001",
    recipientId = "re_fixtureOwner0001",
    installments = 12,
    amountCents = 39700,
    feeCents = 1402,
    settledCount = 0,
    firstSettlement = "2026-09-14",
    accrualAt = "2026-08-12T12:48:38Z",
  } = options;

  const first = new Date(`${firstSettlement}T03:00:00Z`);

  return Array.from({ length: installments }, (_, index) => {
    const settled = index < settledCount;
    // Aproximação de "um mês depois" suficiente para teste; o pagar.me ajusta
    // para dia útil e a data real vem da API — aqui só precisamos de datas
    // crescentes e distintas.
    const paymentDate = new Date(first);
    paymentDate.setUTCMonth(paymentDate.getUTCMonth() + index);

    const payable: Record<string, unknown> = {
      id: 9223071765 - index,
      status: settled ? "paid" : "waiting_funds",
      amount: amountCents,
      fee: feeCents,
      anticipation_fee: 0,
      fraud_coverage_fee: 0,
      installment: index + 1,
      gateway_id: 4512650340,
      charge_id: chargeId,
      recipient_id: recipientId,
      payment_date: paymentDate.toISOString().replace(".000Z", "Z"),
      type: "credit",
      payment_method: "credit_card",
      accrual_at: accrualAt,
      created_at: accrualAt,
    };
    if (settled) {
      payable.liquidation_arrangement_id = `la_fixtureArrangement${String(index + 1).padStart(2, "0")}`;
    }
    return payable;
  });
}

/**
 * Venda com split entre dois recebedores, reproduzindo o caso real: 12 parcelas
 * × 2 recebedores = 24 payables, e o **dono da conta arca com todo o MDR**
 * enquanto o parceiro recebe bruto (`fee: 0`).
 *
 * Total: 123480 (dono) + 52920 (parceiro) = 176400 = valor pago da cobrança.
 */
export function payablesSplitSchedule(): Record<string, unknown>[] {
  return [
    ...payablesSchedule({
      chargeId: "ch_FIXTURESPLIT001",
      recipientId: "re_fixtureOwner0001",
      installments: 12,
      amountCents: 10290, // 123480 / 12
      feeCents: 439, // ~5274 / 12
      firstSettlement: "2026-09-10",
    }),
    ...payablesSchedule({
      chargeId: "ch_FIXTURESPLIT001",
      recipientId: "re_fixturePartner001",
      installments: 12,
      amountCents: 4410, // 52920 / 12
      feeCents: 0, // parceiro não arca com MDR
      firstSettlement: "2026-09-10",
    }),
  ];
}

// ===========================================================================
// Cobranças (`/charges` e webhook)
// ===========================================================================

/**
 * Item da LISTA `GET /charges` — venda avulsa parcelada (o modelo da RCO).
 * Reproduz a descoberta da Fase 0: a lista já é rica o bastante para o ledger
 * de vendas (tem `customer`, `paid_at` e `last_transaction`).
 */
export const CHARGE_LIST_ITEM_RAW = {
  id: "ch_FIXTUREORDER001",
  code: "a275f662-a2c9-4e3b-9d65-e05883f713c8",
  gateway_id: "4512705447",
  amount: 116400,
  paid_amount: 116400,
  status: "paid",
  currency: "BRL",
  payment_method: "credit_card",
  created_at: "2026-08-12T12:44:10Z",
  updated_at: "2026-08-12T12:44:12Z",
  paid_at: "2026-08-12T12:44:12Z",
  recurrence_cycle: "first",
  customer: {
    id: "cus_FIXTURECUSTOMER1",
    name: "Cliente de Teste",
    email: "cliente.teste@example.com",
    document: "00000000191",
    document_type: "CPF",
    type: "individual",
    delinquent: false,
    created_at: "2026-08-12T12:44:09Z",
    updated_at: "2026-08-12T12:44:09Z",
    phones: {},
  },
  last_transaction: {
    id: "tran_FIXTURETX0001",
    transaction_type: "credit_card",
    status: "captured",
    success: true,
    amount: 116400,
    installments: 12,
    operation_type: "auth_and_capture",
    acquirer_name: "pagarme",
    acquirer_message: "Transação capturada com sucesso",
    acquirer_return_code: "00",
    funding_source: "credit",
    card: {
      id: "card_FIXTURECARD001",
      brand: "Mastercard",
      first_six_digits: "542501",
      last_four_digits: "7793",
      holder_name: "CLIENTE DE TESTE",
      exp_month: 1,
      exp_year: 2030,
      status: "active",
      type: "credit",
    },
    gateway_response: { code: "200" },
  },
  order: {
    id: "or_FIXTUREORDER001",
    code: "PEDIDO-1",
    amount: 116400,
    status: "paid",
    closed: true,
    currency: "BRL",
    customer_id: "cus_FIXTURECUSTOMER1",
    created_at: "2026-08-12T12:44:10Z",
    updated_at: "2026-08-12T12:44:12Z",
  },
  metadata: {},
} as const;

/**
 * Cobrança de ciclo de ASSINATURA (o modelo da Jimmy): sem `order`, com
 * `invoice.subscriptionId`. É de onde sai o vínculo cobrança → assinatura.
 */
export const CHARGE_SUBSCRIPTION_RAW = {
  id: "ch_FIXTURESUB0001",
  code: "9KRIRQBK8O",
  amount: 476400,
  paid_amount: 476400,
  status: "paid",
  currency: "BRL",
  payment_method: "credit_card",
  created_at: "2026-08-12T12:48:37Z",
  updated_at: "2026-08-12T12:48:38Z",
  paid_at: "2026-08-12T12:48:38Z",
  due_at: "2026-08-12T00:00:00Z",
  recurrence_cycle: "first",
  customer: {
    id: "cus_FIXTURECUSTOMER2",
    name: "Assinante de Teste",
    email: "assinante.teste@example.com",
    document: "00000000272",
    document_type: "CPF",
    type: "individual",
  },
  invoice: {
    id: "in_FIXTUREINVOICE1",
    code: "INV-1",
    amount: 476400,
    status: "paid",
    installments: 12,
    payment_method: "credit_card",
    subscriptionId: "sub_FIXTURESUB00001",
    created_at: "2026-08-12T12:48:37Z",
    url: "https://example.invalid/invoice",
    metadata: {},
  },
  last_transaction: {
    id: "tran_FIXTURETX0002",
    transaction_type: "credit_card",
    status: "captured",
    success: true,
    amount: 476400,
    installments: 12,
    operation_type: "auth_and_capture",
    acquirer_name: "pagarme",
    card: {
      id: "card_FIXTURECARD002",
      brand: "Visa",
      last_four_digits: "5580",
      holder_name: "ASSINANTE DE TESTE",
      exp_month: 3,
      exp_year: 2031,
      status: "active",
      type: "credit",
    },
    gateway_response: { code: "200" },
  },
} as const;

/** Cobrança RECUSADA — entra no ledger para a taxa de aprovação. */
export const CHARGE_FAILED_RAW = {
  id: "ch_FIXTUREFAILED01",
  code: "a275f6b6-c0cb-4c2f-9a77-bda502db09f4",
  gateway_id: "4512705447",
  amount: 12700,
  status: "failed",
  currency: "BRL",
  payment_method: "credit_card",
  created_at: "2026-08-12T13:25:27Z",
  updated_at: "2026-08-12T13:25:29Z",
  customer: {
    id: "cus_FIXTURECUSTOMER3",
    name: "Recusado de Teste",
    email: "recusado.teste@example.com",
  },
  last_transaction: {
    id: "tran_FIXTURETX0003",
    transaction_type: "credit_card",
    status: "not_authorized",
    success: false,
    amount: 12700,
    installments: 1,
    acquirer_name: "pagarme",
    acquirer_message: "Transação não autorizada",
    card: { brand: "Elo", last_four_digits: "1111" },
  },
  order: { id: "or_FIXTUREFAILED01", status: "failed" },
} as const;

/** Envelope de `/charges`: `paging` COM total e next (diferente do /payables). */
export function chargesListResponse(
  data: unknown[],
  options: { total?: number; next?: string | null } = {},
): { data: unknown[]; paging: Record<string, unknown> } {
  const { total = data.length, next = null } = options;
  return {
    data,
    paging: next ? { total, next } : { total },
  };
}

// ===========================================================================
// Assinaturas (`/subscriptions`)
// ===========================================================================

/**
 * Assinatura ANUAL paga em 12x — o modelo real da Jimmy. O valor do ciclo
 * (476400) dividido por 12 meses dá exatamente o valor de cada parcela dos
 * payables (39700): os dois lados do sistema fecham.
 */
export const SUBSCRIPTION_RAW = {
  id: "sub_FIXTURESUB00001",
  code: "0KRIRQBK8O",
  start_at: "2026-08-12T00:00:00Z",
  interval: "year",
  interval_count: 1,
  billing_type: "prepaid",
  installments: 12,
  payment_method: "credit_card",
  status: "active",
  currency: "BRL",
  created_at: "2026-08-12T12:48:37Z",
  updated_at: "2026-08-12T12:48:38Z",
  next_billing_at: "2027-08-12T00:00:00Z",
  boleto: {},
  current_cycle: {
    id: "cycle_FIXTURECYCLE01",
    cycle: 1,
    status: "billed",
    start_at: "2026-08-12T00:00:00Z",
    end_at: "2027-08-11T23:59:59Z",
    billing_at: "2026-08-12T00:00:00Z",
  },
  customer: {
    id: "cus_FIXTURECUSTOMER2",
    name: "Assinante de Teste",
    email: "assinante.teste@example.com",
  },
  card: { id: "card_FIXTURECARD002", brand: "Visa", last_four_digits: "5580" },
  plan: {
    id: "plan_FIXTUREPLAN0001",
    name: "Completo Anual",
    description: "Acesso anual completo à plataforma",
    status: "active",
    currency: "BRL",
    interval: "year",
    interval_count: 1,
    billing_type: "prepaid",
    installments: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    payment_methods: ["credit_card"],
    created_at: "2026-05-05T13:15:26Z",
    updated_at: "2026-05-05T13:15:26Z",
  },
  items: [
    {
      id: "si_FIXTUREITEM0001",
      name: "Assinatura Anual OTM",
      description: "Assinatura Anual OTM",
      status: "active",
      quantity: 1,
      pricing_scheme: { price: 476400, scheme_type: "unit" },
      created_at: "2026-08-12T12:48:37Z",
      updated_at: "2026-08-12T12:48:37Z",
    },
  ],
} as const;
