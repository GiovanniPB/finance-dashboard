/**
 * Monta o corpo de emissão de NF-e (modelo 55) para o Focus
 * (`POST /v2/nfe?ref=`). Função pura e testável.
 *
 * Estrutura PLANA (a NF-e do Focus usa `*_emitente`/`*_destinatario` no topo +
 * `items[]`), ao contrário da NFS-e (aninhada). Os campos fiscais (NCM, CFOP,
 * CST ICMS, cBenef, PIS/COFINS) vêm 100% da classificação configurada — nada
 * hardcoded para um negócio específico.
 *
 * Regras de domínio embutidas (e por quê):
 *  - CFOP escolhido pela UF do destinatário vs. a do emitente: operação interna
 *    usa `cfopInterno` (ex.: 5101); interestadual usa `cfopInterestadual` (6107).
 *  - PIS/COFINS são TRIBUTADOS (a imunidade de livro é só do ICMS) — as alíquotas
 *    vêm da config e NÃO devem ser zeradas.
 *  - `codigo_beneficio_fiscal` (cBenef) só é enviado quando configurado (SP exige
 *    para CST 41; outros estados não).
 */

import { enrichTomadorAddress, NO_STREET_NUMBER } from "./address.ts";
import { onlyDigits } from "./document.ts";
import type { NfeProductClassification, PagarmeAddress } from "./types.ts";

export interface NfeEmitenteEndereco {
  logradouro: string | null;
  numero: string | null;
  complemento?: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
}

export interface NfeEmitente {
  cnpj: string;
  nome: string;
  inscricaoEstadual: string | null;
  regimeTributario: number; // 1 Simples · 2 SN excesso · 3 Regime Normal
  endereco: NfeEmitenteEndereco;
}

export interface NfeDestinatario {
  documento: string | null;
  nome: string | null;
  email: string | null;
  endereco: PagarmeAddress | null; // texto livre do pagar.me (enriquecido aqui)
}

export interface NfePayloadInput {
  dataEmissao: string; // ISO 8601 (passado pelo worker — mantém a função pura)
  serie?: string | null;
  naturezaOperacao?: string; // default "Venda"
  emitente: NfeEmitente;
  destinatario: NfeDestinatario;
  valorProdutos: number; // reais — fatia do split desta empresa
  classificacao: NfeProductClassification;
}

function destinatarioDocField(documento: string | null): Record<string, string> {
  if (!documento) return {};
  const digits = onlyDigits(documento);
  if (digits.length === 14) return { cnpj_destinatario: digits };
  if (digits.length === 11) return { cpf_destinatario: digits };
  return {};
}

/** Centavos — evita 5.733000000000001 chegando no payload. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Bloco de PIS/COFINS do item — tributados (CST 01), alíquotas da config.
 *
 * A **base de cálculo vai explícita**: o Focus não a deriva do valor do item, e
 * sem ela a nota é autorizada com vBC e vPIS/vCOFINS zerados — constatado em
 * nota real (série 101 nº 2, apontada pela contabilidade). Em CST 01 a base é o
 * valor da operação; como esta nota não tem frete, seguro nem desconto, a base
 * é o próprio valor bruto do item.
 *
 * O valor também vai explícito para não depender do cálculo do provedor. Os
 * totais da nota (vPIS/vCOFINS) o Focus soma dos itens quando omitidos.
 */
function tributosFederais(c: NfeProductClassification, valor: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (c.pisCst != null) out.pis_situacao_tributaria = c.pisCst;
  if (c.pisAliquota != null) {
    out.pis_base_calculo = valor;
    out.pis_aliquota_porcentual = c.pisAliquota;
    out.pis_valor = round2((valor * c.pisAliquota) / 100);
  }
  if (c.cofinsCst != null) out.cofins_situacao_tributaria = c.cofinsCst;
  if (c.cofinsAliquota != null) {
    out.cofins_base_calculo = valor;
    out.cofins_aliquota_porcentual = c.cofinsAliquota;
    out.cofins_valor = round2((valor * c.cofinsAliquota) / 100);
  }
  return out;
}

export function buildNfePayload(input: NfePayloadInput): Record<string, unknown> {
  const { emitente, destinatario, classificacao: c } = input;
  const valor = input.valorProdutos;

  const dest = enrichTomadorAddress(destinatario.endereco).endereco;
  const ufDestino = dest.uf ?? "";
  const interna = ufDestino !== "" && ufDestino === emitente.endereco.uf;
  const cfop = interna ? c.cfopInterno : c.cfopInterestadual;

  const item: Record<string, unknown> = {
    numero_item: 1,
    codigo_produto: c.codigoProduto,
    descricao: c.descricao,
    cfop,
    codigo_ncm: c.ncm,
    cest: c.cest,
    unidade_comercial: "UN",
    quantidade_comercial: 1,
    valor_unitario_comercial: valor,
    unidade_tributavel: "UN",
    quantidade_tributavel: 1,
    valor_unitario_tributavel: valor,
    valor_bruto: valor,
    inclui_no_total: 1,
    icms_origem: c.origem ?? 0,
    icms_situacao_tributaria: c.cstIcms,
    ...tributosFederais(c, valor),
  };
  // cBenef só quando configurado (SP exige p/ CST 41; outros estados não)
  if (c.codigoBeneficioFiscal != null) item.codigo_beneficio_fiscal = c.codigoBeneficioFiscal;

  const payload: Record<string, unknown> = {
    natureza_operacao: input.naturezaOperacao ?? "Venda",
    data_emissao: input.dataEmissao,
    tipo_documento: 1, // saída
    finalidade_emissao: 1, // normal
    consumidor_final: 1,
    presenca_comprador: 9, // não presencial, outros
    local_destino: interna ? 1 : 2, // 1 interna · 2 interestadual
    modalidade_frete: 9, // sem frete

    // emitente
    cnpj_emitente: onlyDigits(emitente.cnpj),
    nome_emitente: emitente.nome,
    inscricao_estadual_emitente: emitente.inscricaoEstadual,
    regime_tributario_emitente: emitente.regimeTributario,
    logradouro_emitente: emitente.endereco.logradouro,
    numero_emitente: emitente.endereco.numero,
    complemento_emitente: emitente.endereco.complemento ?? null,
    bairro_emitente: emitente.endereco.bairro,
    municipio_emitente: emitente.endereco.municipio,
    uf_emitente: emitente.endereco.uf,
    cep_emitente: emitente.endereco.cep,

    // destinatário (cliente)
    nome_destinatario: destinatario.nome,
    ...destinatarioDocField(destinatario.documento),
    indicador_inscricao_estadual_destinatario: 9, // não contribuinte
    email_destinatario: destinatario.email,
    logradouro_destinatario: dest.logradouro,
    numero_destinatario: dest.numero ?? NO_STREET_NUMBER,
    bairro_destinatario: dest.bairro,
    municipio_destinatario: dest.municipio,
    uf_destinatario: dest.uf,
    cep_destinatario: dest.cep,
    pais_destinatario: "Brasil",

    // totais
    valor_produtos: valor,
    valor_total: valor,

    items: [item],
  };

  if (input.serie != null) payload.serie = input.serie;
  if (c.infoComplementar != null) {
    payload.informacoes_adicionais_contribuinte = c.infoComplementar;
  }

  return payload;
}
