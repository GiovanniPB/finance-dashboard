import type { CompanyGroup } from "@/features/company-groups/api";

import type { Company } from "./api";

export type ScopeKind = "company" | "consolidated" | "group";

export const CONSOLIDATED_KEY = "consolidated";
const GROUP_PREFIX = "group:";

export const groupScopeKey = (groupId: string) => `${GROUP_PREFIX}${groupId}`;

export interface ResolvedScope {
  kind: ScopeKind;
  company: Company | null;
  group: CompanyGroup | null;
  /** `null` = sem recorte (consolidado); array = exatamente estas empresas. */
  companyIds: string[] | null;
  /** Empresas do escopo, resolvidas e sem holding. */
  scopeCompanies: Company[];
  label: string;
}

/**
 * Traduz a chave persistida do seletor no escopo efetivo. Pura de propósito: é a regra
 * que decide QUAIS empresas entram em cada número da tela, e ela precisa ser
 * verificável sem subir React nem banco.
 */
export function resolveScope(input: {
  scopeKey: string;
  companies: Company[];
  groups: CompanyGroup[];
  /** Grupos ainda carregando — muda o que fazer com uma chave de grupo desconhecida. */
  groupsLoading: boolean;
}): ResolvedScope {
  const { scopeKey, companies, groups, groupsLoading } = input;

  const operational = companies.filter((c) => !c.is_holding);
  const isGroupKey = scopeKey.startsWith(GROUP_PREFIX);
  const groupId = isGroupKey ? scopeKey.slice(GROUP_PREFIX.length) : null;
  const group = groupId ? (groups.find((g) => g.id === groupId) ?? null) : null;
  const company =
    !isGroupKey && scopeKey !== CONSOLIDATED_KEY
      ? (companies.find((c) => c.id === scopeKey) ?? null)
      : null;

  // Grupo pedido e ainda não carregado NÃO pode virar consolidado: a tela mostraria o
  // número de todas as empresas sob o rótulo de um recorte. Recorte vazio (zeros) é o
  // erro seguro; o provider ainda declara `loading`, então a tela mostra skeleton.
  const groupPending = isGroupKey && !group && groupsLoading;
  // Grupo que não existe mais (apagado, ou perda de acesso a uma empresa dele) volta
  // para consolidado — visivelmente, com o rótulo trocando.
  const groupGone = isGroupKey && !group && !groupsLoading;

  const kind: ScopeKind = isGroupKey
    ? groupGone
      ? "consolidated"
      : "group"
    : company
      ? "company"
      : "consolidated";

  if (kind === "company" && company) {
    return {
      kind,
      company,
      group: null,
      companyIds: [company.id],
      scopeCompanies: [company],
      label: company.trade_name ?? company.legal_name,
    };
  }

  if (kind === "group") {
    const ids = groupPending ? [] : (group?.companyIds ?? []);
    return {
      kind,
      company: null,
      group,
      companyIds: ids,
      // Ordem das empresas, não a de inserção no grupo: o seletor e os cabeçalhos
      // listam sempre na mesma ordem do resto do sistema.
      scopeCompanies: operational.filter((c) => ids.includes(c.id)),
      label: group?.name ?? "Grupo",
    };
  }

  return {
    kind: "consolidated",
    company: null,
    group: null,
    companyIds: null,
    scopeCompanies: operational,
    label: "Consolidado",
  };
}
