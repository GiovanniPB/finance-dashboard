import { useMutation, useQueryClient } from "@tanstack/react-query";

import { commitImportBatch, createImportBatch, uploadImportRows, uploadOriginalFile } from "./api";

export function useCreateImportBatch() {
  return useMutation({
    mutationFn: createImportBatch,
  });
}

export function useUploadImportRows() {
  return useMutation({
    mutationFn: ({
      batchId,
      rows,
    }: {
      batchId: string;
      rows: Parameters<typeof uploadImportRows>[1];
    }) => uploadImportRows(batchId, rows),
  });
}

export function useUploadImportFile() {
  return useMutation({
    mutationFn: ({ batchId, file }: { batchId: string; file: File }) =>
      uploadOriginalFile(batchId, file),
  });
}

export function useCommitImportBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => commitImportBatch(batchId),
    onSuccess: () => {
      // Invalida queries de transações pra refletir o que acabou de entrar
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["kpis"] });
      void qc.invalidateQueries({ queryKey: ["dre"] });
      void qc.invalidateQueries({ queryKey: ["cashflow"] });
    },
  });
}
