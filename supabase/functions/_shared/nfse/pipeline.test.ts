import { afterEach, describe, expect, it, vi } from "vitest";

import { baseContext, baseEvent } from "./fixtures.ts";
import { applySplitMeta, resolveAuthoritativeSplit, toRow } from "./pipeline.ts";
import type { InvoiceJobDraft } from "./types.ts";

function draft(overrides: Partial<InvoiceJobDraft> = {}): InvoiceJobDraft {
  return {
    organizationId: "org",
    companyId: "co",
    documentType: "nfse",
    pagarmeAccountId: "acc",
    pagarmeChargeId: "ch_1",
    pagarmeRecipientId: "rp_1",
    ambiente: "homologacao",
    status: "queued",
    valorServicos: 100,
    tomadorDocumento: "52998224725",
    tomadorNome: "T",
    tomadorEmail: null,
    tomadorEndereco: null,
    itemListaServico: "17.01",
    codigoTributarioMunicipio: null,
    aliquotaIss: 0.05,
    parametros: null,
    metadata: { sourceEventId: "evt" },
    ...overrides,
  };
}

describe("applySplitMeta", () => {
  it("mantém o status e mescla o metadata quando não há divergência", () => {
    const out = applySplitMeta(draft(), { splitSource: "payables" });
    expect(out.status).toBe("queued");
    expect(out.metadata).toMatchObject({ sourceEventId: "evt", splitSource: "payables" });
  });

  it("força pending_review quando os payables divergem do valor pago", () => {
    const out = applySplitMeta(draft({ status: "queued" }), {
      splitSource: "webhook",
      payablesDivergence: true,
    });
    expect(out.status).toBe("pending_review");
    expect(out.metadata.payablesDivergence).toBe(true);
  });
});

describe("toRow", () => {
  it("mapeia os campos do draft para as colunas do banco", () => {
    const row = toRow(draft());
    expect(row).toMatchObject({
      organization_id: "org",
      company_id: "co",
      document_type: "nfse",
      pagarme_charge_id: "ch_1",
      pagarme_recipient_id: "rp_1",
      status: "queued",
      valor_servicos: 100,
      item_lista_servico: "17.01",
    });
  });
});

describe("resolveAuthoritativeSplit", () => {
  afterEach(() => vi.unstubAllGlobals());

  const account = baseContext().account;

  it("usa o split dos payables quando a soma == valor pago", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ type: "credit", amount: 29900, recipient_id: "rp_x" }] }),
      }),
    );
    const { event, splitMeta } = await resolveAuthoritativeSplit(
      {} as never,
      account,
      baseEvent(),
      "sk_test",
    );
    expect(splitMeta.splitSource).toBe("payables");
    expect(event.split).toEqual([{ recipientId: "rp_x", amount: 29900, type: "flat" }]);
  });

  it("mantém o split de origem e sinaliza divergência quando a soma difere", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ type: "credit", amount: 10000, recipient_id: "rp_x" }] }),
      }),
    );
    const original = baseEvent();
    const { event, splitMeta } = await resolveAuthoritativeSplit(
      {} as never,
      account,
      original,
      "sk_test",
    );
    expect(splitMeta.payablesDivergence).toBe(true);
    expect(event.split).toEqual(original.split); // inalterado
  });

  it("sem secret key -> cai no split do webhook (via RPC nula)", async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: null }) };
    const { splitMeta } = await resolveAuthoritativeSplit(supabase as never, account, baseEvent());
    expect(splitMeta.splitSource).toBe("webhook");
    expect(supabase.rpc).toHaveBeenCalledWith("get_pagarme_account_secret", {
      p_account_id: account.id,
    });
  });
});
