import { describe, expect, it } from "vitest";

import { baseContext, baseEvent, IDS, nfeContext } from "./fixtures.ts";
import { allocateShares, explodeChargePaid, resolveTomador } from "./split.ts";
import type { PagarmeSplit } from "./types.ts";

/** Inline (módulo _shared não depende de src/lib). */
const toCents = (reais: number): number => Math.round(reais * 100);

describe("allocateShares", () => {
  it("divide um split percentual preservando a soma exata", () => {
    const split: PagarmeSplit[] = [
      { recipientId: "a", amount: 60, type: "percentage" },
      { recipientId: "b", amount: 40, type: "percentage" },
    ];
    const shares = allocateShares(29900, split);

    expect(shares).toEqual([17940, 11960]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(29900);
  });

  it("distribui o resto de arredondamento mantendo a soma (split 3x 33,33%)", () => {
    const split: PagarmeSplit[] = [
      { recipientId: "a", amount: 33.34, type: "percentage" },
      { recipientId: "b", amount: 33.33, type: "percentage" },
      { recipientId: "c", amount: 33.33, type: "percentage" },
    ];
    const shares = allocateShares(10000, split);

    expect(shares.reduce((a, b) => a + b, 0)).toBe(10000); // sem perder/inventar centavos
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
  });

  it("suporta split flat (valores absolutos em centavos)", () => {
    const split: PagarmeSplit[] = [
      { recipientId: "a", amount: 20000, type: "flat" },
      { recipientId: "b", amount: 9900, type: "flat" },
    ];
    const shares = allocateShares(29900, split);

    expect(shares).toEqual([20000, 9900]);
  });
});

describe("resolveTomador", () => {
  it("marca como válido quando documento e endereço estão completos", () => {
    const t = resolveTomador(baseEvent().customer);
    expect(t.valid).toBe(true);
    expect(t.warnings).toEqual([]);
  });

  it("acusa documento inválido e endereço incompleto", () => {
    const t = resolveTomador({ name: "X", document: "111", address: null });
    expect(t.valid).toBe(false);
    expect(t.warnings).toContain("tomador_documento_invalido");
    expect(t.warnings).toContain("tomador_endereco_incompleto");
  });

  it("manda para revisão quando falta o IBGE, mesmo com o resto do endereço ok", () => {
    // o ViaCEP não resolveu o CEP: sem `codigo_municipio` Barueri rejeita a nota.
    // Melhor parar aqui do que queimar uma tentativa de emissão.
    const event = baseEvent();
    const t = resolveTomador({
      ...event.customer,
      address: { ...event.customer.address, cep_info: null },
    });

    expect(t.valid).toBe(false);
    expect(t.warnings).toEqual(["tomador_endereco_incompleto"]);
  });

  it("aceita o endereço quando a revisão manual supre o que faltava", () => {
    const event = baseEvent();
    const t = resolveTomador({
      ...event.customer,
      address: {
        ...event.customer.address,
        cep_info: null,
        nfse_override: { codigoMunicipio: "3505708" },
      },
    });

    expect(t.valid).toBe(true);
    expect(t.warnings).toEqual([]);
  });
});

describe("explodeChargePaid", () => {
  it("explode em um job por recebedor, com fatias que somam o total", () => {
    const { jobs, skipped } = explodeChargePaid(baseEvent(), baseContext());

    expect(skipped).toEqual([]);
    expect(jobs).toHaveLength(2);

    const somaCents = jobs.reduce((acc, j) => acc + toCents(j.valorServicos), 0);
    expect(somaCents).toBe(29900); // invariante: soma das fatias = total da cobrança

    const a = jobs.find((j) => j.pagarmeRecipientId === "rp_company_a");
    const b = jobs.find((j) => j.pagarmeRecipientId === "rp_company_b");
    expect(a?.valorServicos).toBe(179.4);
    expect(b?.valorServicos).toBe(119.6);
  });

  it("resolve classificação fiscal por plano e cai no padrão da empresa", () => {
    const { jobs } = explodeChargePaid(baseEvent(), baseContext());
    const a = jobs.find((j) => j.companyId === IDS.COMPANY_A);
    const b = jobs.find((j) => j.companyId === IDS.COMPANY_B);

    expect(a?.itemListaServico).toBe("17.01"); // match por plano
    expect(b?.itemListaServico).toBe("10.02"); // padrão da empresa (sem plano)
  });

  it("define status inicial pelo emission_mode (automatic -> queued, manual -> pending_review)", () => {
    const { jobs } = explodeChargePaid(baseEvent(), baseContext());
    const a = jobs.find((j) => j.companyId === IDS.COMPANY_A);
    const b = jobs.find((j) => j.companyId === IDS.COMPANY_B);

    expect(a?.status).toBe("queued"); // empresa A: automatic
    expect(b?.status).toBe("pending_review"); // empresa B: manual
  });

  it("força revisão manual quando o kill-switch (enabled=false) está ativo", () => {
    const ctx = baseContext();
    ctx.settings[0] = { ...ctx.settings[0], enabled: false };
    const { jobs } = explodeChargePaid(baseEvent(), ctx);
    const a = jobs.find((j) => j.companyId === IDS.COMPANY_A);

    expect(a?.status).toBe("pending_review");
  });

  it("força revisão manual e registra warnings quando o tomador é inválido", () => {
    const event = baseEvent();
    event.customer = { name: "Sem Doc", document: null, address: null };
    const { jobs } = explodeChargePaid(event, baseContext());

    // empresa A é automatic, mas tomador inválido -> não vai para a fila
    const a = jobs.find((j) => j.companyId === IDS.COMPANY_A);
    expect(a?.status).toBe("pending_review");
    expect((a?.metadata as { validationWarnings?: string[] }).validationWarnings).toContain(
      "tomador_documento_invalido",
    );
  });

  it("pula recebedores não mapeados a uma empresa", () => {
    const event = baseEvent();
    event.split = [
      { recipientId: "rp_company_a", amount: 50, type: "percentage" },
      { recipientId: "rp_desconhecido", amount: 50, type: "percentage" },
    ];
    const { jobs, skipped } = explodeChargePaid(event, baseContext());

    expect(jobs).toHaveLength(1);
    expect(skipped).toEqual([{ recipientId: "rp_desconhecido", reason: "recipient_not_mapped" }]);
  });

  it("soma numa nota só as pernas do split que caem na mesma empresa", () => {
    // duas contas de recebimento distintas apontando para a MESMA empresa: a
    // unidade de nota é a empresa, então tem de sair UMA nota com a soma.
    const ctx = baseContext();
    ctx.recipients = [
      ...ctx.recipients,
      { pagarmeRecipientId: "rp_company_a_2", companyId: IDS.COMPANY_A, organizationId: IDS.ORG },
    ];
    const event = baseEvent();
    event.amountCents = 30000;
    event.split = [
      { recipientId: "rp_company_a", amount: 50, type: "percentage" },
      { recipientId: "rp_company_a_2", amount: 30, type: "percentage" },
      { recipientId: "rp_company_b", amount: 20, type: "percentage" },
    ];

    const { jobs } = explodeChargePaid(event, ctx);

    expect(jobs).toHaveLength(2);
    const a = jobs.find((j) => j.companyId === IDS.COMPANY_A);
    expect(a?.valorServicos).toBe(240);
    expect((a?.metadata as { mergedRecipientIds?: string[] }).mergedRecipientIds).toEqual([
      "rp_company_a",
      "rp_company_a_2",
    ]);
    expect(jobs.find((j) => j.companyId === IDS.COMPANY_B)?.valorServicos).toBe(60);
    // o total continua fechando com o valor pago
    expect(jobs.reduce((acc, j) => acc + j.valorServicos, 0)).toBe(300);
  });

  it("é determinístico (mesma entrada -> mesma saída) — suporta idempotência", () => {
    const r1 = explodeChargePaid(baseEvent(), baseContext());
    const r2 = explodeChargePaid(baseEvent(), baseContext());
    expect(r1).toEqual(r2);
  });

  it("carimba a conta de origem (pagarme_account_id) em todos os jobs", () => {
    const { jobs } = explodeChargePaid(baseEvent(), baseContext());
    expect(jobs.every((j) => j.pagarmeAccountId === IDS.ACCOUNT)).toBe(true);
  });

  describe("roteamento multi-documento (NF-e produto × NFS-e serviço)", () => {
    it("carimba o documentType de cada empresa conforme o perfil fiscal", () => {
      const { jobs } = explodeChargePaid(baseEvent(), nfeContext());
      const a = jobs.find((j) => j.companyId === IDS.COMPANY_A);
      const b = jobs.find((j) => j.companyId === IDS.COMPANY_B);

      expect(a?.documentType).toBe("nfe"); // empresa A: produto
      expect(b?.documentType).toBe("nfse"); // empresa B: serviço
    });

    it("congela a classificação de produto (NCM/CST/cBenef) no snapshot da NF-e", () => {
      const { jobs } = explodeChargePaid(baseEvent(), nfeContext());
      const a = jobs.find((j) => j.companyId === IDS.COMPANY_A);
      const params = a?.parametros as Record<string, unknown>;

      expect(params.ncm).toBe("49019900");
      expect(params.cstIcms).toBe("41");
      expect(params.codigoBeneficioFiscal).toBe("SP070130");
      expect(params.pisAliquota).toBe(0.65); // PIS tributado, não zerado
      // colunas NFS-e ficam nulas em job de NF-e
      expect(a?.itemListaServico).toBeNull();
    });

    it("o job NFS-e mantém a forma de serviço no snapshot", () => {
      const { jobs } = explodeChargePaid(baseEvent(), nfeContext());
      const b = jobs.find((j) => j.companyId === IDS.COMPANY_B);
      const params = b?.parametros as Record<string, unknown>;

      expect(params.itemListaServico).toBe("10.02");
      expect(b?.documentType).toBe("nfse");
    });
  });

  describe("cobrança SEM split (conta com merchant único)", () => {
    it("gera um único job para a empresa dona, com o valor integral", () => {
      const event = baseEvent();
      event.split = [];
      const { jobs, skipped } = explodeChargePaid(event, baseContext());

      expect(skipped).toEqual([]);
      expect(jobs).toHaveLength(1);

      const job = jobs[0];
      expect(job.companyId).toBe(IDS.COMPANY_A); // owner_company da conta
      expect(job.organizationId).toBe(IDS.ORG);
      expect(job.pagarmeRecipientId).toBeNull(); // sem recebedor de split
      expect(job.valorServicos).toBe(299); // valor cheio (29900 centavos)
      expect((job.metadata as { noSplit?: boolean }).noSplit).toBe(true);
    });

    it("resolve a classificação fiscal e o status da empresa dona", () => {
      const event = baseEvent();
      event.split = [];
      const { jobs } = explodeChargePaid(event, baseContext());

      // empresa A: plano casa em service_catalog (17.01) e é automatic -> queued
      expect(jobs[0].itemListaServico).toBe("17.01");
      expect(jobs[0].status).toBe("queued");
    });
  });
});
