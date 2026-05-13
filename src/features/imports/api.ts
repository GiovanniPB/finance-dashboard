import { supabase, type Tables } from "@/lib/supabase";

import type { ParsedImportRow } from "./types";

export type ImportBatch = Tables["import_batches"]["Row"];

export async function createImportBatch(payload: {
  companyId: string;
  filename: string;
  rowCount: number;
}): Promise<ImportBatch> {
  const { data, error } = await supabase
    .from("import_batches")
    .insert({
      company_id: payload.companyId,
      filename: payload.filename,
      source: "csv",
      status: "previewed",
      row_count: payload.rowCount,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function uploadOriginalFile(batchId: string, file: File): Promise<string> {
  const path = `${batchId}/${file.name}`;
  const { error } = await supabase.storage.from("imports").upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw error;

  await supabase.from("import_batches").update({ storage_path: path }).eq("id", batchId);
  return path;
}

export async function uploadImportRows(batchId: string, rows: ParsedImportRow[]): Promise<void> {
  const payload = rows.map((r) => ({
    import_batch_id: batchId,
    row_number: r.rowNumber,
    raw_data: r.raw,
    parsed: r.parsed,
    validation_errors: r.errors.length > 0 ? { messages: r.errors } : null,
    is_valid: r.isValid,
  }));

  // Insert in chunks of 200 to avoid request size limits
  const CHUNK = 200;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const slice = payload.slice(i, i + CHUNK);
    const { error } = await supabase.from("import_rows").insert(slice);
    if (error) throw error;
  }
}

export async function commitImportBatch(batchId: string): Promise<{
  committed: number;
  failed: number;
}> {
  const { data, error } = await supabase.rpc("commit_import_batch", { p_batch_id: batchId });
  if (error) throw error;
  const row = data?.[0];
  return {
    committed: row?.committed_count ?? 0,
    failed: row?.failed_count ?? 0,
  };
}
