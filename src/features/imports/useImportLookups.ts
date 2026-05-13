import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

import type { LookupMaps } from "./parser";

/**
 * Loads accounts / cost centers / bank accounts / counterparties for the company,
 * and exposes them as Maps keyed by code/nickname/name for fast lookups during parsing.
 */
export function useImportLookups(companyId: string | null) {
  const accounts = useQuery({
    queryKey: ["import-lookups", "accounts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, code")
        .eq("company_id", companyId ?? "")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(companyId),
  });

  const costCenters = useQuery({
    queryKey: ["import-lookups", "cost-centers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_centers")
        .select("id, code")
        .eq("company_id", companyId ?? "")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(companyId),
  });

  const bankAccounts = useQuery({
    queryKey: ["import-lookups", "banks", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, nickname")
        .eq("company_id", companyId ?? "")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(companyId),
  });

  const counterparties = useQuery({
    queryKey: ["import-lookups", "counterparties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("counterparties").select("id, name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const lookups: LookupMaps = useMemo(
    () => ({
      accountsByCode: new Map((accounts.data ?? []).map((a) => [a.code, a.id])),
      costCentersByCode: new Map((costCenters.data ?? []).map((c) => [c.code, c.id])),
      bankAccountsByNickname: new Map((bankAccounts.data ?? []).map((b) => [b.nickname, b.id])),
      counterpartiesByName: new Map(
        (counterparties.data ?? []).map((cp) => [cp.name.toLowerCase(), cp.id]),
      ),
    }),
    [accounts.data, costCenters.data, bankAccounts.data, counterparties.data],
  );

  return {
    lookups,
    isLoading:
      accounts.isLoading ||
      costCenters.isLoading ||
      bankAccounts.isLoading ||
      counterparties.isLoading,
  };
}
