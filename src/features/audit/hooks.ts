import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { fetchAuditLog, type AuditLogFilters } from "./api";

export function useAuditLog(filters: AuditLogFilters) {
  return useQuery({
    queryKey: ["audit-log", filters],
    queryFn: () => fetchAuditLog(filters),
    placeholderData: keepPreviousData,
  });
}
