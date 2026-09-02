import * as React from "react";

import type { CompanyGroup } from "@/features/company-groups/api";
import { useCompanyGroups } from "@/features/company-groups/hooks";

import type { Company } from "./api";
import { useCompanies } from "./hooks";
import { CONSOLIDATED_KEY, groupScopeKey, resolveScope, type ScopeKind } from "./resolveScope";

export { CONSOLIDATED_KEY, groupScopeKey };
export type { ScopeKind };

/**
 * Escopo de empresa da aplicação. Três formas:
 *
 *   company       uma empresa
 *   consolidated  todas as operacionais que a RLS deixa a pessoa ver
 *   group         um recorte nomeado (ex.: "OTM sem Jimmy") — consolidação seletiva
 *
 * Por que NÃO existe um `isConsolidated` booleano: com três formas, um booleano
 * obrigaria cada tela a adivinhar de que lado o grupo cai, e o erro silencioso
 * (mostrar as 4 empresas sob o rótulo de um recorte de 2) é o pior defeito possível
 * aqui. Quem precisa "é mais de uma empresa?" usa `isMultiCompany`; quem precisa
 * distinguir consolidado de recorte usa `scopeKind`.
 *
 * A regra de resolução em si mora em `resolveScope.ts`, pura e coberta por teste.
 */
interface CompanyContextValue {
  /** Empresas ativas acessíveis, holding incluída. */
  companies: Company[];
  /** Só as operacionais — é o que entra em consolidação e em seletor de empresa. */
  operationalCompanies: Company[];
  groups: CompanyGroup[];

  scopeKind: ScopeKind;
  /** Chave persistida do escopo: "consolidated" | "<companyId>" | "group:<groupId>". */
  scopeKey: string;
  setScope: (key: string) => void;

  /** Empresa selecionada — `null` em consolidado e em grupo, sempre. */
  selectedCompany: Company | null;
  selectedCompanyId: string | null;
  selectedGroup: CompanyGroup | null;

  /**
   * Recorte de empresas do escopo, para filtro (`in`) e para os RPCs multi-empresa:
   * `null` = sem recorte (consolidado, quem filtra é a RLS); array = exatamente estas.
   */
  companyIds: string[] | null;
  /** Empresas do escopo, resolvidas — para seletor em tela que opera numa empresa. */
  scopeCompanies: Company[];

  isMultiCompany: boolean;
  scopeLabel: string;
  loading: boolean;
}

const STORAGE_KEY = "fin-dash-selected-company";

const CompanyContext = React.createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { data: companies = [], isLoading: companiesLoading } = useCompanies();
  const { data: groups = [], isLoading: groupsLoading } = useCompanyGroups();

  const [scopeKey, setScopeKey] = React.useState<string>(() => {
    if (typeof window === "undefined") return CONSOLIDATED_KEY;
    return window.localStorage.getItem(STORAGE_KEY) ?? CONSOLIDATED_KEY;
  });

  const setScope = React.useCallback((key: string) => {
    setScopeKey(key);
    window.localStorage.setItem(STORAGE_KEY, key);
  }, []);

  const value = React.useMemo<CompanyContextValue>(() => {
    const scope = resolveScope({ scopeKey, companies, groups, groupsLoading });

    return {
      companies,
      operationalCompanies: companies.filter((c) => !c.is_holding),
      groups,
      scopeKind: scope.kind,
      scopeKey,
      setScope,
      selectedCompany: scope.company,
      selectedCompanyId: scope.company?.id ?? null,
      selectedGroup: scope.group,
      companyIds: scope.companyIds,
      scopeCompanies: scope.scopeCompanies,
      isMultiCompany: scope.kind !== "company",
      scopeLabel: scope.label,
      loading: companiesLoading || groupsLoading,
    };
  }, [companies, groups, groupsLoading, companiesLoading, scopeKey, setScope]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompanyScope() {
  const ctx = React.useContext(CompanyContext);
  if (!ctx) throw new Error("useCompanyScope must be used inside CompanyProvider");
  return ctx;
}
