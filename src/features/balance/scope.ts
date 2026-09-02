/**
 * Escopo do balanço gerencial.
 *
 * O modelo de linhas é salvo POR escopo, nos mesmos três recortes do seletor de
 * empresa: uma empresa, um grupo de agregação, ou o consolidado da organização. São
 * modelos independentes de propósito — a composição de Ebitda do grupo OTM não é a
 * mesma da RCO, e herdar o modelo de uma empresa deixaria as outras fora do balanço
 * sem aviso (as linhas apontam para centros de custo específicos).
 */
export type BalanceScope =
  | { kind: "company"; companyId: string }
  | { kind: "group"; groupId: string }
  | { kind: "consolidated" };

/** Chave estável do escopo para o cache do TanStack Query. */
export function balanceScopeKey(scope: BalanceScope): string {
  if (scope.kind === "company") return `company:${scope.companyId}`;
  if (scope.kind === "group") return `group:${scope.groupId}`;
  return "consolidated";
}

/** Traduz o escopo global de empresa no escopo do balanço. */
export function balanceScopeFrom(input: {
  scopeKind: "company" | "consolidated" | "group";
  selectedCompanyId: string | null;
  selectedGroupId: string | null;
}): BalanceScope {
  if (input.scopeKind === "company" && input.selectedCompanyId) {
    return { kind: "company", companyId: input.selectedCompanyId };
  }
  if (input.scopeKind === "group" && input.selectedGroupId) {
    return { kind: "group", groupId: input.selectedGroupId };
  }
  return { kind: "consolidated" };
}

export function balanceScopeLabel(scope: BalanceScope, names: { groupName?: string }): string {
  if (scope.kind === "company") return "desta empresa";
  if (scope.kind === "group") return `do grupo ${names.groupName ?? ""}`.trimEnd();
  return "do consolidado";
}
