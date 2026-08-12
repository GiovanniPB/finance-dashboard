import { describe, expect, it } from "vitest";

import { parseChargeRecord } from "./charges.ts";
import {
  CHARGE_LIST_ITEM_RAW,
  payablesResponse,
  payablesSchedule,
  payablesSplitSchedule,
  SUBSCRIPTION_RAW,
} from "./fixtures.ts";
import {
  buildCompanyResolver,
  chargeRow,
  customerRow,
  receivableRows,
  refundedAmountFromPayables,
  subscriptionRow,
  type LedgerAccount,
} from "./ledger.ts";
import { centsToReais, centsToReaisOrNull } from "./money.ts";
import { parsePayablesDetailed } from "./payables.ts";
import { parseSubscriptionRecord } from "./subscriptions.ts";

const ACCOUNT: LedgerAccount = {
  id: "11111111-1111-1111-1111-111111111111",
  organizationId: "22222222-2222-2222-2222-222222222222",
  ownerCompanyId: "33333333-3333-3333-3333-333333333333",
};

const PARTNER_COMPANY = "44444444-4444-4444-4444-444444444444";

describe("centsToReais", () => {
  it("converte centavos em string decimal exata", () => {
    expect(centsToReais(1490)).toBe("14.90");
    expect(centsToReais(39700)).toBe("397.00");
    expect(centsToReais(476400)).toBe("4764.00");
    expect(centsToReais(1)).toBe("0.01");
    expect(centsToReais(0)).toBe("0.00");
  });

  it("não produz representação binária de float", () => {
    // 0.1 + 0.2 em float dá 0.30000000000000004; string decimal não tem isso
    expect(centsToReais(30)).toBe("0.30");
    expect(centsToReais(2999999)).toBe("29999.99");
  });

  it("trata ausente como zero e distingue do null explícito", () => {
    expect(centsToReais(undefined)).toBe("0.00");
    expect(centsToReais(null)).toBe("0.00");
    expect(centsToReaisOrNull(undefined)).toBeNull();
    expect(centsToReaisOrNull(0)).toBe("0.00");
  });
});

describe("buildCompanyResolver", () => {
  it("cobrança SEM split vai para a empresa dona da conta", () => {
    const resolve = buildCompanyResolver(ACCOUNT, new Map());

    expect(resolve(null)).toBe(ACCOUNT.ownerCompanyId);
  });

  it("recebedor mapeado vai para a empresa dele, não para a dona", () => {
    // é este caso que resolve a RCO recebedora DENTRO da conta da Jimmy
    const resolve = buildCompanyResolver(
      ACCOUNT,
      new Map([["re_fixturePartner001", PARTNER_COMPANY]]),
    );

    expect(resolve("re_fixturePartner001")).toBe(PARTNER_COMPANY);
  });

  it("recebedor NÃO mapeado devolve null (nunca chuta a empresa dona)", () => {
    const resolve = buildCompanyResolver(ACCOUNT, new Map());

    expect(resolve("re_desconhecido")).toBeNull();
  });
});

describe("chargeRow", () => {
  it("monta a linha da venda com dinheiro em reais", () => {
    const charge = parseChargeRecord(CHARGE_LIST_ITEM_RAW)!;

    const row = chargeRow(charge, ACCOUNT);

    expect(row).toMatchObject({
      organization_id: ACCOUNT.organizationId,
      pagarme_account_id: ACCOUNT.id,
      pagarme_charge_id: "ch_FIXTUREORDER001",
      pagarme_order_id: "or_FIXTUREORDER001",
      pagarme_customer_id: "cus_FIXTURECUSTOMER1",
      status: "paid",
      installments: 12,
      amount: "1164.00", // 116400 centavos
      paid_amount: "1164.00",
      card_brand: "Mastercard",
      acquirer_name: "pagarme",
    });
  });

  it("não escreve refunded_amount (vem da agregação dos payables)", () => {
    const charge = parseChargeRecord(CHARGE_LIST_ITEM_RAW)!;

    expect(chargeRow(charge, ACCOUNT)).not.toHaveProperty("refunded_amount");
  });

  it("carimba sales_event_id só quando veio de webhook", () => {
    const charge = parseChargeRecord(CHARGE_LIST_ITEM_RAW)!;

    expect(chargeRow(charge, ACCOUNT)).not.toHaveProperty("sales_event_id");
    expect(chargeRow(charge, ACCOUNT, "evt-uuid")).toMatchObject({
      sales_event_id: "evt-uuid",
    });
  });
});

describe("customerRow", () => {
  it("monta a linha do comprador", () => {
    const charge = parseChargeRecord(CHARGE_LIST_ITEM_RAW)!;

    const row = customerRow(charge.customer!, ACCOUNT, charge.paidAt);

    expect(row).toMatchObject({
      pagarme_customer_id: "cus_FIXTURECUSTOMER1",
      name: "Cliente de Teste",
      document_type: "CPF",
      first_purchase_at: "2026-08-12T12:44:12.000Z",
    });
  });

  it("descarta comprador sem id (não há chave de idempotência)", () => {
    expect(
      customerRow(
        {
          customerId: null,
          name: "X",
          email: null,
          document: null,
          documentType: null,
          createdAt: null,
        },
        ACCOUNT,
      ),
    ).toBeNull();
  });
});

describe("subscriptionRow", () => {
  it("monta a linha da assinatura com MRR", () => {
    const sub = parseSubscriptionRecord(SUBSCRIPTION_RAW)!;

    expect(subscriptionRow(sub, ACCOUNT)).toMatchObject({
      pagarme_subscription_id: "sub_FIXTURESUB00001",
      plan_name: "Completo Anual",
      status: "active",
      interval: "year",
      interval_count: 1,
      mrr: "397.00",
    });
  });
});

/** O recebedor que as fixtures usam como "dono da conta", já mapeado. */
const OWNER_MAP = new Map([["re_fixtureOwner0001", ACCOUNT.ownerCompanyId]]);

describe("receivableRows", () => {
  it("materializa as 12 parcelas com data de liquidação", () => {
    const payables = parsePayablesDetailed(payablesResponse(payablesSchedule()));
    const resolve = buildCompanyResolver(ACCOUNT, OWNER_MAP);

    const { rows, unmappedRecipients } = receivableRows(payables, ACCOUNT, resolve);

    expect(rows).toHaveLength(12);
    expect(unmappedRecipients).toEqual([]);
    expect(rows[0]).toMatchObject({
      pagarme_payable_id: "9223071765",
      pagarme_charge_id: "ch_FIXTURE12X0001",
      company_id: ACCOUNT.ownerCompanyId,
      type: "credit",
      status: "waiting_funds",
      installment: 1,
      amount: "397.00",
      fee: "14.02",
      expected_payment_date: "2026-09-14",
    });
  });

  it("NÃO envia colunas geradas nem o campo congelado pelo trigger", () => {
    const payables = parsePayablesDetailed(payablesResponse(payablesSchedule({ installments: 1 })));
    const { rows } = receivableRows(payables, ACCOUNT, buildCompanyResolver(ACCOUNT, OWNER_MAP));

    expect(rows[0]).not.toHaveProperty("net_amount"); // gerada
    expect(rows[0]).not.toHaveProperty("settled_on"); // gerada
    expect(rows[0]).not.toHaveProperty("first_seen_payment_date"); // trigger
  });

  it("atribui cada fatia do split à empresa do recebedor", () => {
    const payables = parsePayablesDetailed(payablesResponse(payablesSplitSchedule()));
    const resolve = buildCompanyResolver(
      ACCOUNT,
      new Map([
        ["re_fixtureOwner0001", ACCOUNT.ownerCompanyId],
        ["re_fixturePartner001", PARTNER_COMPANY],
      ]),
    );

    const { rows } = receivableRows(payables, ACCOUNT, resolve);
    const dono = rows.filter((r) => r.company_id === ACCOUNT.ownerCompanyId);
    const parceiro = rows.filter((r) => r.company_id === PARTNER_COMPANY);

    expect(rows).toHaveLength(24);
    expect(dono).toHaveLength(12);
    expect(parceiro).toHaveLength(12);
    // o parceiro recebe bruto (não arca com MDR)
    expect(parceiro.every((r) => r.fee === "0.00")).toBe(true);
    expect(dono.every((r) => r.fee !== "0.00")).toBe(true);
  });

  it("descarta e REPORTA recebedor não mapeado em vez de creditar a empresa errada", () => {
    const payables = parsePayablesDetailed(payablesResponse(payablesSplitSchedule()));
    // só o dono está mapeado; o parceiro não
    const resolve = buildCompanyResolver(
      ACCOUNT,
      new Map([["re_fixtureOwner0001", ACCOUNT.ownerCompanyId]]),
    );

    const { rows, unmappedRecipients } = receivableRows(payables, ACCOUNT, resolve);

    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.company_id === ACCOUNT.ownerCompanyId)).toBe(true);
    expect(unmappedRecipients).toEqual(["re_fixturePartner001"]);
  });

  it("ignora payable sem id (sem chave de idempotência)", () => {
    // sem recipient_id o resolver manda para a empresa dona — mesmo assim a
    // linha é descartada, porque sem `id` não há como fazer upsert idempotente
    const payables = parsePayablesDetailed({
      data: [{ type: "credit", amount: 1000, recipient_id: null }],
    });
    const { rows } = receivableRows(payables, ACCOUNT, buildCompanyResolver(ACCOUNT, new Map()));

    expect(rows).toEqual([]);
  });

  it("cobrança sem split cai na empresa dona da conta", () => {
    const payables = parsePayablesDetailed({
      data: [{ id: 77, type: "credit", amount: 1000, payment_date: "2026-09-14T03:00:00Z" }],
    });
    const { rows, unmappedRecipients } = receivableRows(
      payables,
      ACCOUNT,
      buildCompanyResolver(ACCOUNT, new Map()),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      company_id: ACCOUNT.ownerCompanyId,
      pagarme_recipient_id: null,
      expected_payment_date: "2026-09-14",
    });
    expect(unmappedRecipients).toEqual([]);
  });
});

describe("refundedAmountFromPayables", () => {
  it("soma estornos e chargebacks em reais", () => {
    const payables = parsePayablesDetailed({
      data: [
        { id: 1, type: "credit", amount: 20000, recipient_id: "re_a" },
        { id: 2, type: "refund", amount: 5000, recipient_id: "re_a" },
        { id: 3, type: "chargeback", amount: 2500, recipient_id: "re_a" },
      ],
    });

    expect(refundedAmountFromPayables(payables)).toBe("75.00");
  });

  it("venda sem estorno devolve zero", () => {
    const payables = parsePayablesDetailed(payablesResponse(payablesSchedule()));

    expect(refundedAmountFromPayables(payables)).toBe("0.00");
  });
});
