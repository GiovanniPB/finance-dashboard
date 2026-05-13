import * as React from "react";

import type { Company } from "./api";
import { useCompanies } from "./hooks";

interface CompanyContextValue {
  companies: Company[];
  selectedCompanyId: string | null;
  selectedCompany: Company | null;
  isConsolidated: boolean;
  setSelectedCompanyId: (id: string | null) => void;
  loading: boolean;
}

const STORAGE_KEY = "fin-dash-selected-company";
const CONSOLIDATED = "consolidated";

const CompanyContext = React.createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { data: companies = [], isLoading } = useCompanies();
  const [selected, setSelected] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  React.useEffect(() => {
    if (!selected && companies.length > 0) {
      setSelected(CONSOLIDATED);
    }
  }, [companies, selected]);

  const setSelectedCompanyId = React.useCallback((id: string | null) => {
    setSelected(id);
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const isConsolidated = selected === CONSOLIDATED || selected === null;
  const selectedCompany = React.useMemo(
    () => (isConsolidated ? null : (companies.find((c) => c.id === selected) ?? null)),
    [companies, selected, isConsolidated],
  );

  const value = React.useMemo<CompanyContextValue>(
    () => ({
      companies,
      selectedCompanyId: selected,
      selectedCompany,
      isConsolidated,
      setSelectedCompanyId,
      loading: isLoading,
    }),
    [companies, selected, selectedCompany, isConsolidated, setSelectedCompanyId, isLoading],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompanyScope() {
  const ctx = React.useContext(CompanyContext);
  if (!ctx) throw new Error("useCompanyScope must be used inside CompanyProvider");
  return ctx;
}

export { CONSOLIDATED as CONSOLIDATED_KEY };
