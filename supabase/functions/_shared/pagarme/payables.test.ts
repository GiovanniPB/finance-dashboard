import { describe, expect, it } from "vitest";

import {
  BALANCE_OPERATION_PAYABLE_RAW,
  PAYABLE_PAID_RAW,
  PAYABLE_WAITING_RAW,
  payablesResponse,
  payablesSchedule,
  payablesSplitSchedule,
} from "./fixtures.ts";
import {
  aggregateGrossByRecipient,
  parseBalanceOperationPayables,
  parsePayable,
  parsePayablesDetailed,
  totalFeesCents,
  totalGrossCents,
} from "./payables.ts";
import { saoPauloDate } from "./time.ts";

describe("parsePayable", () => {
  it("normaliza a parcela não liquidada preservando o cronograma", () => {
    // Arrange
    const raw = PAYABLE_WAITING_RAW;

    // Act
    const payable = parsePayable(raw);

    // Assert
    expect(payable).not.toBeNull();
    expect(payable).toMatchObject({
      id: "9223071765",
      chargeId: "ch_FIXTURE12X0001",
      recipientId: "re_fixtureOwner0001",
      status: "waiting_funds",
      type: "credit",
      installment: 2,
      amountCents: 39700,
      feeCents: 1402,
      anticipationFeeCents: 0,
      fraudCoverageFeeCents: 0,
      netCents: 38298,
      signedAmountCents: 39700,
      paymentDate: "2026-10-14T03:00:00.000Z",
      settlementDate: "2026-10-14",
      accrualAt: "2026-08-12T12:48:38.000Z",
      paymentMethod: "credit_card",
      gatewayId: "4512650340",
      isSettled: false,
    });
    // ainda não liquidado -> sem arranjo de liquidação
    expect(payable?.liquidationArrangementId).toBeNull();
    // split_id só existe via /balance/operations
    expect(payable?.splitId).toBeNull();
  });

  it("marca a parcela liquidada e captura o arranjo de liquidação", () => {
    const payable = parsePayable(PAYABLE_PAID_RAW);

    expect(payable?.isSettled).toBe(true);
    expect(payable?.status).toBe("paid");
    expect(payable?.liquidationArrangementId).toBe("la_fixtureArrangement01");
    expect(payable?.settlementDate).toBe("2026-02-03");
    expect(payable?.netCents).toBe(9326); // 9700 - 374
  });

  it("aceita id/gateway_id como number (/payables) ou string (/balance/operations)", () => {
    const fromPayables = parsePayable({ ...PAYABLE_WAITING_RAW, id: 123, gateway_id: 456 });
    const fromOperations = parsePayable({ ...PAYABLE_WAITING_RAW, id: "123", gateway_id: "456" });

    expect(fromPayables?.id).toBe("123");
    expect(fromPayables?.gatewayId).toBe("456");
    expect(fromOperations?.id).toBe("123");
    expect(fromOperations?.gatewayId).toBe("456");
  });

  it("aceita recebedor aninhado em recipient.id", () => {
    const payable = parsePayable({
      type: "credit",
      amount: 5000,
      recipient: { id: "re_aninhado" },
    });

    expect(payable?.recipientId).toBe("re_aninhado");
  });

  it("dá sinal negativo a estorno e chargeback", () => {
    const refund = parsePayable({ type: "refund", amount: 5000, recipient_id: "re_a" });
    const chargeback = parsePayable({ type: "chargeback", amount: 7000, recipient_id: "re_a" });
    // mesmo se a API já devolver negativo, o sinal não deve dobrar
    const negativeRefund = parsePayable({ type: "refund", amount: -5000, recipient_id: "re_a" });

    expect(refund?.signedAmountCents).toBe(-5000);
    expect(chargeback?.signedAmountCents).toBe(-7000);
    expect(negativeRefund?.signedAmountCents).toBe(-5000);
  });

  it("não presume direção do dinheiro para type desconhecido", () => {
    const payable = parsePayable({ type: "algo_novo", amount: 5000, recipient_id: "re_a" });

    expect(payable?.signedAmountCents).toBe(0);
    expect(payable?.amountCents).toBe(5000); // o bruto ainda é lido
  });

  it("é defensivo com entrada inesperada", () => {
    expect(parsePayable(null)).toBeNull();
    expect(parsePayable("texto")).toBeNull();
    expect(parsePayable([])).toBeNull();

    const vazio = parsePayable({});
    expect(vazio).not.toBeNull();
    expect(vazio).toMatchObject({
      id: null,
      chargeId: null,
      recipientId: null,
      amountCents: 0,
      netCents: 0,
      signedAmountCents: 0,
      paymentDate: null,
      settlementDate: null,
      isSettled: false,
    });
  });

  it("ignora installment inválido e aceita string numérica", () => {
    expect(parsePayable({ installment: 0 })?.installment).toBeNull();
    expect(parsePayable({ installment: "abc" })?.installment).toBeNull();
    expect(parsePayable({ installment: 1.5 })?.installment).toBeNull();
    expect(parsePayable({ installment: "3" })?.installment).toBe(3);
  });
});

describe("parsePayablesDetailed", () => {
  it("lê o envelope { data, paging } e preserva a ordem", () => {
    const response = payablesResponse(payablesSchedule({ installments: 3 }));

    const payables = parsePayablesDetailed(response);

    expect(payables).toHaveLength(3);
    expect(payables.map((p) => p.installment)).toEqual([1, 2, 3]);
  });

  it("aceita array cru além do envelope", () => {
    expect(parsePayablesDetailed([PAYABLE_WAITING_RAW])).toHaveLength(1);
  });

  it("materializa o cronograma completo de uma venda em 12x", () => {
    // Arrange — venda de 12x de R$ 397,00 (o caso real de produção)
    const response = payablesResponse(payablesSchedule({ installments: 12 }));

    // Act
    const payables = parsePayablesDetailed(response);

    // Assert — a soma das parcelas fecha com o valor da cobrança
    expect(payables).toHaveLength(12);
    expect(totalGrossCents(payables)).toBe(476400);
    // toda parcela tem data de liquidação conhecida, mesmo sem ter liquidado
    expect(payables.every((p) => p.settlementDate !== null)).toBe(true);
    expect(payables.every((p) => !p.isSettled)).toBe(true);
    // datas estritamente crescentes
    const datas = payables.map((p) => p.settlementDate ?? "");
    expect([...datas].sort()).toEqual(datas);
  });

  it("separa parcelas liquidadas das pendentes numa venda antiga", () => {
    // Arrange — reproduz o caso real: venda de jan/26 em 12x, 7 já liquidadas
    const response = payablesResponse(
      payablesSchedule({
        installments: 12,
        settledCount: 7,
        amountCents: 9700,
        feeCents: 384,
        firstSettlement: "2026-02-03",
      }),
    );

    // Act
    const payables = parsePayablesDetailed(response);
    const liquidadas = payables.filter((p) => p.isSettled);
    const pendentes = payables.filter((p) => !p.isSettled);

    // Assert
    expect(liquidadas).toHaveLength(7);
    expect(pendentes).toHaveLength(5);
    // só as liquidadas têm arranjo de liquidação
    expect(liquidadas.every((p) => p.liquidationArrangementId !== null)).toBe(true);
    expect(pendentes.every((p) => p.liquidationArrangementId === null)).toBe(true);
    // o que ainda entra em caixa
    expect(totalGrossCents(pendentes)).toBe(48500); // 5 × R$ 97,00
  });

  it("descarta itens irreconhecíveis sem perder os válidos", () => {
    const payables = parsePayablesDetailed({
      data: [PAYABLE_WAITING_RAW, null, "lixo", 42, PAYABLE_PAID_RAW],
    });

    expect(payables).toHaveLength(2);
  });

  it("retorna vazio para resposta inesperada", () => {
    expect(parsePayablesDetailed(null)).toEqual([]);
    expect(parsePayablesDetailed({})).toEqual([]);
    expect(parsePayablesDetailed({ data: "nao-array" })).toEqual([]);
  });
});

describe("split entre recebedores", () => {
  it("agrega 12 parcelas × 2 recebedores fechando com o valor pago", () => {
    // Arrange
    const payables = parsePayablesDetailed(payablesResponse(payablesSplitSchedule()));

    // Act
    const porRecebedor = aggregateGrossByRecipient(payables);

    // Assert
    expect(payables).toHaveLength(24);
    expect(porRecebedor.get("re_fixtureOwner0001")).toBe(123480);
    expect(porRecebedor.get("re_fixturePartner001")).toBe(52920);
    expect(totalGrossCents(payables)).toBe(176400);
  });

  it("atribui o MDR só ao dono da conta (parceiro recebe bruto)", () => {
    const payables = parsePayablesDetailed(payablesResponse(payablesSplitSchedule()));
    const dono = payables.filter((p) => p.recipientId === "re_fixtureOwner0001");
    const parceiro = payables.filter((p) => p.recipientId === "re_fixturePartner001");

    expect(totalFeesCents(dono)).toBeGreaterThan(0);
    expect(totalFeesCents(parceiro)).toBe(0);
    // logo o líquido do parceiro é igual ao bruto
    expect(parceiro.every((p) => p.netCents === p.amountCents)).toBe(true);
  });
});

describe("aggregateGrossByRecipient", () => {
  it("subtrai estorno e chargeback do crédito do recebedor", () => {
    const payables = parsePayablesDetailed({
      data: [
        { type: "credit", amount: 20000, recipient_id: "re_a" },
        { type: "refund", amount: 5000, recipient_id: "re_a" },
        { type: "credit", amount: 10000, recipient_id: "re_b" },
        { type: "chargeback", amount: 10000, recipient_id: "re_b" },
      ],
    });

    const porRecebedor = aggregateGrossByRecipient(payables);

    expect(porRecebedor.get("re_a")).toBe(15000);
    expect(porRecebedor.get("re_b")).toBe(0); // totalmente estornado
  });

  it("ignora payable sem recebedor e de type desconhecido", () => {
    const payables = parsePayablesDetailed({
      data: [
        { type: "credit", amount: 5000, recipient_id: "re_a" },
        { type: "credit", amount: 1000 }, // sem recebedor
        { type: "algo_novo", amount: 9999, recipient_id: "re_b" },
      ],
    });

    const porRecebedor = aggregateGrossByRecipient(payables);

    expect(porRecebedor.get("re_a")).toBe(5000);
    expect(porRecebedor.has("re_b")).toBe(false);
    expect(porRecebedor.size).toBe(1);
  });

  it("preserva a ordem de aparição dos recebedores", () => {
    const payables = parsePayablesDetailed({
      data: [
        { type: "credit", amount: 100, recipient_id: "re_segundo" },
        { type: "credit", amount: 100, recipient_id: "re_primeiro" },
      ],
    });

    expect([...aggregateGrossByRecipient(payables).keys()]).toEqual(["re_segundo", "re_primeiro"]);
  });
});

describe("parseBalanceOperationPayables", () => {
  it("extrai o payable de movement_object com split_id", () => {
    const payables = parseBalanceOperationPayables({
      data: [BALANCE_OPERATION_PAYABLE_RAW],
    });

    expect(payables).toHaveLength(1);
    expect(payables[0]).toMatchObject({
      id: "9153642813",
      chargeId: "ch_FIXTURESPLIT001",
      recipientId: "re_fixturePartner001",
      splitId: "sr_fixtureSplitRule01",
      status: "paid",
      isSettled: true,
      settlementDate: "2026-08-12",
      liquidationArrangementId: "la_fixtureArrangement02",
    });
  });

  it("ignora operações que não são de payable", () => {
    const payables = parseBalanceOperationPayables({
      data: [
        { id: 1, type: "transfer", movement_object: { object: "transfer", amount: 5000 } },
        { id: 2, type: "payable", movement_object: null },
        BALANCE_OPERATION_PAYABLE_RAW,
      ],
    });

    expect(payables).toHaveLength(1);
    expect(payables[0].splitId).toBe("sr_fixtureSplitRule01");
  });
});

describe("saoPauloDate", () => {
  it("lê a meia-noite de Brasília expressa em UTC como o dia correto", () => {
    // convenção observada na API: T03:00:00Z == 00:00 em São Paulo
    expect(saoPauloDate("2026-09-14T03:00:00Z")).toBe("2026-09-14");
    expect(saoPauloDate("2027-01-12T03:00:00Z")).toBe("2027-01-12");
  });

  it("converte para o fuso civil em vez de assumir a data UTC", () => {
    // é aqui que a diferença aparece: 00:00Z ainda é o dia ANTERIOR no Brasil
    expect(saoPauloDate("2026-09-14T00:00:00Z")).toBe("2026-09-13");
    expect(saoPauloDate("2026-09-14T02:59:59Z")).toBe("2026-09-13");
  });

  it("retorna null para valor ausente ou inválido", () => {
    expect(saoPauloDate(null)).toBeNull();
    expect(saoPauloDate("")).toBeNull();
    expect(saoPauloDate("ontem")).toBeNull();
    expect(saoPauloDate(12345)).toBeNull();
  });
});
