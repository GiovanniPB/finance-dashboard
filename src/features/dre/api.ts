import { supabase } from "@/lib/supabase";

import type { DreRow } from "./types";

export async function fetchDreByCompany(
  companyId: string,
  from: string,
  to: string,
): Promise<DreRow[]> {
  const { data, error } = await supabase.rpc("dre_by_company", {
    p_company_id: companyId,
    p_start: from,
    p_end: to,
  });
  if (error) throw error;
  return (data ?? []) as unknown as DreRow[];
}

export async function fetchDreConsolidated(
  organizationId: string,
  from: string,
  to: string,
): Promise<DreRow[]> {
  const { data, error } = await supabase.rpc("dre_consolidated", {
    p_organization_id: organizationId,
    p_start: from,
    p_end: to,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    account_id: r.master_id,
    parent_id: r.parent_id,
    code: r.code,
    name: r.name,
    kind: r.kind,
    dre_section: r.dre_section,
    is_summary: r.is_summary,
    below_the_line: r.below_the_line,
    sign_hint: r.sign_hint as DreRow["sign_hint"],
    sort_order: r.sort_order,
    total: r.total,
  })) satisfies DreRow[];
}
