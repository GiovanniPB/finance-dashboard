/**
 * Fixtures de `/payables` e `/balance/operations` — **shape real de produção**,
 * capturado em 12/08/2026 (ver `docs/integrations/pagarme-api-contract.md`).
 *
 * Identificadores foram pseudonimizados (`ch_`, `re_`, `la_`, `sr_`); valores,
 * datas, tipos e a ORDEM/PRESENÇA dos campos são fiéis ao que a API devolve —
 * é isso que dá valor ao fixture. Payables não contêm PII (sem nome, e-mail ou
 * documento do comprador), então nada precisou ser removido.
 *
 * Detalhes fiéis que os testes dependem:
 *  - `/payables` devolve `id`/`gateway_id` como **number**;
 *  - `movement_object` de `/balance/operations` devolve como **string**, e é o
 *    único lugar onde aparece `split_id`;
 *  - `liquidation_arrangement_id` existe SÓ quando `status: "paid"`;
 *  - o campo de competência é `accrual_at` (não `accrual_date`);
 *  - `payment_date` é meia-noite de Brasília expressa em UTC (`T03:00:00Z`);
 *  - o envelope de `/payables` traz `paging: {}` VAZIO (sem total nem next).
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
