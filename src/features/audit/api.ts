import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/database";

export interface AuditLogEntry {
  id: number;
  table_name: string;
  record_id: string;
  action: string;
  old_data: Json | null;
  new_data: Json | null;
  changed_fields: string[] | null;
  changed_by: string | null;
  changed_at: string;
  changer_name: string | null;
  changer_email: string | null;
  total_count: number;
}

export interface AuditLogFilters {
  table?: string | null;
  recordId?: string | null;
  changedBy?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number;
  pageSize?: number;
}

export async function fetchAuditLog(filters: AuditLogFilters): Promise<{
  rows: AuditLogEntry[];
  total: number;
}> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;

  const { data, error } = await supabase.rpc("audit_log_list", {
    p_table_name: filters.table ?? undefined,
    p_record_id: filters.recordId ?? undefined,
    p_changed_by: filters.changedBy ?? undefined,
    p_from: filters.from ?? undefined,
    p_to: filters.to ?? undefined,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw error;

  const rows = (data ?? []) as AuditLogEntry[];
  const total = rows[0]?.total_count ?? 0;
  return { rows, total };
}
