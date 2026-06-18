/**
 * Resolução do SNAPSHOT de parâmetros fiscais de um job, por tipo de documento.
 *
 * Precedência: classificação do `service_catalog` (por plano/produto) sobrepõe o
 * padrão da empresa (`fiscal_company_settings`). O resultado é gravado em
 * `invoice_jobs.parametros` (jsonb) e é o que o builder NF-e/NFS-e consome ao
 * emitir — congelado na criação do job (auditoria + estabilidade se a config
 * mudar depois).
 *
 * Puro e determinístico (sem I/O) — testável por Vitest e usável pelo Deno.
 */

import type {
  FiscalCompanySettings,
  FiscalDocumentType,
  NfeProductClassification,
  ServiceCatalogEntry,
} from "./types.ts";

/** Discriminação padrão quando nem catálogo nem perfil definem uma. */
export const NFSE_DISCRIMINACAO_PADRAO = "Prestação de serviço";

/** Parâmetros congelados de uma NFS-e (serviço). */
export interface NfseParametros {
  discriminacao: string;
  itemListaServico: string | null;
  codigoTributarioMunicipio: string | null;
  aliquotaIss: number | null;
  issRetido: boolean;
  optanteSimples: boolean;
  // Barueri (Simples Nacional) — exigidos pela PMB
  codigoOpcaoSimplesNacional: number | null;
  regimeTributarioSimplesNacional: number | null;
}

/** Parâmetros congelados de uma NF-e (produto). */
export interface NfeParametros {
  codigoProduto: string | null;
  descricao: string | null;
  ncm: string | null;
  cest: string | null;
  cfopInterno: string | null;
  cfopInterestadual: string | null;
  origem: number | null;
  cstIcms: string | null;
  codigoBeneficioFiscal: string | null;
  pisCst: string | null;
  pisAliquota: number | null;
  cofinsCst: string | null;
  cofinsAliquota: number | null;
  infoComplementar: string | null;
}

function firstDefined<T>(...values: (T | null | undefined)[]): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

/** Lê os defaults de NF-e que a empresa pode ter no overflow `parametros.nfe`. */
function settingsNfeDefaults(
  settings: FiscalCompanySettings | undefined,
): Partial<NfeProductClassification> {
  const raw = settings?.parametros?.nfe;
  return raw && typeof raw === "object" ? (raw as Partial<NfeProductClassification>) : {};
}

export function resolveNfseParametros(
  service: ServiceCatalogEntry | undefined,
  settings: FiscalCompanySettings | undefined,
): NfseParametros {
  return {
    discriminacao:
      firstDefined(service?.discriminacao, settings?.discriminacao) ?? NFSE_DISCRIMINACAO_PADRAO,
    itemListaServico: firstDefined(service?.itemListaServico, settings?.itemListaServico),
    codigoTributarioMunicipio: firstDefined(
      service?.codigoTributarioMunicipio,
      settings?.codigoTributarioMunicipio,
    ),
    aliquotaIss: firstDefined(service?.aliquotaIss, settings?.aliquotaIss),
    issRetido: settings?.issRetido ?? false,
    optanteSimples: settings?.optanteSimples ?? false,
    codigoOpcaoSimplesNacional: settings?.codigoOpcaoSimplesNacional ?? null,
    regimeTributarioSimplesNacional: settings?.regimeTributarioSimplesNacional ?? null,
  };
}

export function resolveNfeParametros(
  service: ServiceCatalogEntry | undefined,
  settings: FiscalCompanySettings | undefined,
): NfeParametros {
  const c = service?.nfe ?? {};
  const d = settingsNfeDefaults(settings);
  return {
    codigoProduto: firstDefined(c.codigoProduto, d.codigoProduto),
    descricao: firstDefined(c.descricao, d.descricao),
    ncm: firstDefined(c.ncm, d.ncm),
    cest: firstDefined(c.cest, d.cest),
    cfopInterno: firstDefined(c.cfopInterno, d.cfopInterno),
    cfopInterestadual: firstDefined(c.cfopInterestadual, d.cfopInterestadual),
    origem: firstDefined(c.origem, d.origem),
    cstIcms: firstDefined(c.cstIcms, d.cstIcms),
    codigoBeneficioFiscal: firstDefined(c.codigoBeneficioFiscal, d.codigoBeneficioFiscal),
    pisCst: firstDefined(c.pisCst, d.pisCst),
    pisAliquota: firstDefined(c.pisAliquota, d.pisAliquota),
    cofinsCst: firstDefined(c.cofinsCst, d.cofinsCst),
    cofinsAliquota: firstDefined(c.cofinsAliquota, d.cofinsAliquota),
    infoComplementar: firstDefined(c.infoComplementar, d.infoComplementar),
  };
}

/** Resolve o snapshot fiscal conforme o tipo de documento da empresa. */
export function resolveFiscalParametros(
  documentType: FiscalDocumentType,
  service: ServiceCatalogEntry | undefined,
  settings: FiscalCompanySettings | undefined,
): Record<string, unknown> {
  return documentType === "nfe"
    ? (resolveNfeParametros(service, settings) as unknown as Record<string, unknown>)
    : (resolveNfseParametros(service, settings) as unknown as Record<string, unknown>);
}
