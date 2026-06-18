/**
 * Registry de tipos de documento fiscal → recurso/endpoint do Focus.
 *
 * É o ponto único que o `nfse-worker` (Fase 4) usa para rotear a emissão e a
 * consulta para o endpoint certo conforme o `document_type` do job. Manter o
 * mapeamento aqui (e não espalhado em ifs) é o que torna o motor multi-documento
 * e extensível: adicionar um tipo novo é uma entrada no `RESOURCE` + um builder.
 *
 * Puro (sem I/O) — testável por Vitest, usável pelo Deno.
 */

import type { FiscalDocumentType } from "./types.ts";

/** Recurso do Focus (`/v2/<recurso>`) por tipo de documento. */
const RESOURCE: Record<FiscalDocumentType, "nfe" | "nfse"> = {
  nfse: "nfse",
  nfe: "nfe",
};

export function focusResourceFor(type: FiscalDocumentType): "nfe" | "nfse" {
  return RESOURCE[type] ?? "nfse";
}

/** Caminho de EMISSÃO no Focus (POST), relativo à base do ambiente. */
export function focusEmitPath(type: FiscalDocumentType, ref: string): string {
  return `/v2/${focusResourceFor(type)}?ref=${encodeURIComponent(ref)}`;
}

/** Caminho de CONSULTA no Focus (GET), relativo à base do ambiente. */
export function focusQueryPath(type: FiscalDocumentType, ref: string): string {
  return `/v2/${focusResourceFor(type)}/${encodeURIComponent(ref)}`;
}
