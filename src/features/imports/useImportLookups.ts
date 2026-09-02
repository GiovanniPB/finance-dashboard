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

  // A central de custos é global: o CSV pode citar qualquer centro, independente da
  // empresa de destino da importação.
  const costCenters = useQuery({
    queryKey: ["import-lookups", "cost-centers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_centers")
        .select("id, name")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
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
      costCentersByName: new Map(
        (costCenters.data ?? []).map((c) => [c.name.trim().toLowerCase(), c.id]),
      ),
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
