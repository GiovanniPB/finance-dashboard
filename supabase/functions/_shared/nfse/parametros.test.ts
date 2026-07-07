import { describe, expect, it } from "vitest";

import {
  NFSE_DISCRIMINACAO_PADRAO,
  resolveFiscalParametros,
  resolveNfeParametros,
  resolveNfseParametros,
  type NfeParametros,
  type NfseParametros,
} from "./parametros.ts";
import type { FiscalCompanySettings, ServiceCatalogEntry } from "./types.ts";

const COMPANY = "00000000-0000-0000-0000-0000000000a1";

function nfseSettings(over: Partial<FiscalCompanySettings> = {}): FiscalCompanySettings {
  return {
    companyId: COMPANY,
    documentType: "nfse",
    ambiente: "homologacao",
    emissionMode: "automatic",
    enabled: true,
    itemListaServico: "08.02",
    aliquotaIss: 0.02,
    optanteSimples: true,
    codigoOpcaoSimplesNacional: 3,
    regimeTributarioSimplesNacional: 1,
    discriminacao: "Research RCO",
    ...over,
  };
}

describe("resolveNfseParametros", () => {
  it("usa o padrão da empresa quando não há entrada de catálogo", () => {
    const p = resolveNfseParametros(undefined, nfseSettings());
    expect(p.itemListaServico).toBe("08.02");
    expect(p.aliquotaIss).toBe(0.02);
    expect(p.discriminacao).toBe("Research RCO");
    expect(p.codigoOpcaoSimplesNacional).toBe(3);
    expect(p.regimeTributarioSimplesNacional).toBe(1);
    expect(p.optanteSimples).toBe(true);
  });

  it("catálogo (por plano) sobrepõe o padrão da empresa", () => {
    const service: ServiceCatalogEntry = {
      companyId: COMPANY,
      documentType: "nfse",
      itemListaServico: "01.07",
      aliquotaIss: 0.05,
      discriminacao: "Serviço específico",
    };
    const p = resolveNfseParametros(service, nfseSettings());
    expect(p.itemListaServico).toBe("01.07");
    expect(p.aliquotaIss).toBe(0.05);
    expect(p.discriminacao).toBe("Serviço específico");
  });

  it("cai na discriminação padrão quando ninguém define", () => {
    const p = resolveNfseParametros(undefined, nfseSettings({ discriminacao: null }));
    expect(p.discriminacao).toBe(NFSE_DISCRIMINACAO_PADRAO);
  });
});

describe("resolveNfeParametros", () => {
  it("monta a classificação de produto a partir do catálogo", () => {
    const service: ServiceCatalogEntry = {
      companyId: COMPANY,
      documentType: "nfe",
      nfe: {
        ncm: "49019900",
        cstIcms: "41",
        codigoBeneficioFiscal: "SP070130",
        pisAliquota: 0.65,
        cofinsAliquota: 3.0,
        cfopInterno: "5101",
        cfopInterestadual: "6107",
      },
    };
    const p = resolveNfeParametros(service, nfseSettings({ documentType: "nfe" }));
    expect(p.ncm).toBe("49019900");
    expect(p.cstIcms).toBe("41");
    expect(p.codigoBeneficioFiscal).toBe("SP070130");
    expect(p.pisAliquota).toBe(0.65);
  });

  it("usa os defaults de NF-e do overflow parametros.nfe quando o catálogo não traz", () => {
    const settings = nfseSettings({
      documentType: "nfe",
      parametros: { nfe: { ncm: "49019900", cstIcms: "41" } },
    });
    const p = resolveNfeParametros(undefined, settings);
    expect(p.ncm).toBe("49019900");
    expect(p.cstIcms).toBe("41");
  });
});

describe("resolveFiscalParametros (dispatch por tipo)", () => {
  it("nfse → forma de NFS-e", () => {
    const p = resolveFiscalParametros(
      "nfse",
      undefined,
      nfseSettings(),
    ) as unknown as NfseParametros;
    expect(p.itemListaServico).toBe("08.02");
  });

  it("nfe → forma de NF-e", () => {
    const settings = nfseSettings({
      documentType: "nfe",
      parametros: { nfe: { ncm: "49019900" } },
    });
    const p = resolveFiscalParametros("nfe", undefined, settings) as unknown as NfeParametros;
    expect(p.ncm).toBe("49019900");
  });
});
