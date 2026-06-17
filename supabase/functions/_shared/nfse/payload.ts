/**
 * Monta o corpo da requisição de emissão de NFS-e para o Focus
 * (`POST /v2/nfse?ref=`). Função pura e testável.
 *
 * Campos seguem o Focus NFS-e (doc §11.1). Os NOMES EXATOS e a forma da
 * alíquota/endereço para o provedor de Barueri (EISS) serão confirmados no
 * primeiro teste real de emissão (a rejeição do Focus aponta divergências).
 *
 * Pré-requisito fiscal (a preencher por empresa): `item_lista_servico` (LC116),
 * `codigo_tributario_municipio` e `aliquota_iss`. Sem eles o Focus rejeita.
 */

import { enrichTomadorAddress } from "./address.ts";
import { onlyDigits } from "./document.ts";
import type { PagarmeAddress } from "./types.ts";

export interface NfsePrestador {
  cnpj: string;
  inscricaoMunicipal: string | null;
  municipioIbge: string; // IBGE (Barueri = 3505708)
  optanteSimples: boolean | null;
}

export interface NfseTomador {
  documento: string | null;
  nome: string | null;
  email: string | null;
  endereco: PagarmeAddress | null;
}

export interface NfseServico {
  valorServicos: number; // reais
  itemListaServico: string | null;
  codigoTributarioMunicipio: string | null;
  aliquotaIss: number | null;
  discriminacao: string;
}

export interface NfsePayloadInput {
  dataEmissao: string; // ISO 8601 (passado pelo worker — mantém a função pura)
  prestador: NfsePrestador;
  tomador: NfseTomador;
  servico: NfseServico;
  issRetido?: boolean;
}

function tomadorDocFields(documento: string | null): Record<string, string> {
  if (!documento) return {};
  const digits = onlyDigits(documento);
  if (digits.length === 14) return { cnpj: digits };
  if (digits.length === 11) return { cpf: digits };
  return {};
}

function enderecoObj(endereco: PagarmeAddress | null): Record<string, unknown> | undefined {
  if (!endereco) return undefined;
  // Híbrido: deriva logradouro/numero/bairro de line_1 (ver address.ts).
  const { endereco: e } = enrichTomadorAddress(endereco);
  return {
    logradouro: e.logradouro,
    numero: e.numero,
    complemento: e.complemento,
    bairro: e.bairro,
    cep: e.cep,
    municipio: e.municipio,
    uf: e.uf,
  };
}

/**
 * Monta o JSON de emissão da NFS-e (Focus NFS-e municipal). Estrutura ANINHADA
 * (prestador/tomador/servico) — confirmada contra o Focus homologação (Barueri):
 * o payload plano `prestador_cnpj` retornava `requisicao_invalida`.
 */
export function buildNfsePayload(input: NfsePayloadInput): Record<string, unknown> {
  const { prestador, tomador, servico } = input;

  return {
    data_emissao: input.dataEmissao,

    prestador: {
      cnpj: onlyDigits(prestador.cnpj),
      inscricao_municipal: prestador.inscricaoMunicipal,
      codigo_municipio: prestador.municipioIbge,
    },

    tomador: {
      ...tomadorDocFields(tomador.documento),
      razao_social: tomador.nome,
      email: tomador.email,
      endereco: enderecoObj(tomador.endereco),
    },

    servico: {
      aliquota: servico.aliquotaIss,
      discriminacao: servico.discriminacao,
      iss_retido: input.issRetido ?? false,
      item_lista_servico: servico.itemListaServico,
      codigo_tributario_municipio: servico.codigoTributarioMunicipio,
      codigo_municipio: prestador.municipioIbge,
      valor_servicos: servico.valorServicos,
    },

    optante_simples_nacional: prestador.optanteSimples ?? false,
  };
}
