/**
 * TanStack Query para os templates de relatório.
 *
 * A chave inclui empresa **e** organização porque a lista muda com o escopo: no
 * consolidado só aparecem os templates sem empresa.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createReportTemplate,
  deleteReportTemplate,
  fetchReportTemplates,
  updateReportTemplate,
  type ReportTemplate,
  type SaveTemplateInput,
} from "./api";
import type { ReportConfig } from "./schema";

export const reportTemplateKeys = {
  list: (organizationId: string, companyId: string | null) =>
    ["report-templates", organizationId, companyId ?? "consolidated"] as const,
};

export function useReportTemplates(organizationId: string, companyId: string | null) {
  return useQuery({
    queryKey: reportTemplateKeys.list(organizationId, companyId),
    queryFn: () => fetchReportTemplates({ organizationId, companyId }),
    enabled: Boolean(organizationId),
  });
}

export function useCreateReportTemplate(organizationId: string, companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveTemplateInput) => createReportTemplate(input),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: reportTemplateKeys.list(organizationId, companyId),
      }),
  });
}

export interface UpdateTemplateVariables {
  id: string;
  name?: string;
  description?: string | null;
  config?: ReportConfig;
}

export function useUpdateReportTemplate(organizationId: string, companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateTemplateVariables) => updateReportTemplate(id, patch),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: reportTemplateKeys.list(organizationId, companyId),
      }),
  });
}

export function useDeleteReportTemplate(organizationId: string, companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteReportTemplate(id),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: reportTemplateKeys.list(organizationId, companyId),
      }),
  });
}

export type { ReportTemplate };
