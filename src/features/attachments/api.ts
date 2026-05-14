import { supabase, type Enums, type Tables } from "@/lib/supabase";

export type Attachment = Tables["attachments"]["Row"];
export type AttachmentEntityType = Enums["attachment_entity_type"];

const BUCKET = "attachments";

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/xml",
  "text/xml",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/x-ofx",
];

function extFromName(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

function makeStoragePath(
  companyId: string,
  entityType: AttachmentEntityType,
  entityId: string,
  fileName: string,
): string {
  const ext = extFromName(fileName);
  const id = crypto.randomUUID();
  return `${companyId}/${entityType}/${entityId}/${id}${ext}`;
}

export async function listAttachments(
  entityType: AttachmentEntityType,
  entityId: string,
): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface UploadInput {
  companyId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  file: File;
  userId: string;
}

export async function uploadAttachment(input: UploadInput): Promise<Attachment> {
  if (input.file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Arquivo excede o limite de ${(MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)} MB`,
    );
  }
  if (input.file.type && !ALLOWED_MIME_TYPES.includes(input.file.type)) {
    throw new Error(`Tipo de arquivo não permitido: ${input.file.type}`);
  }

  const path = makeStoragePath(input.companyId, input.entityType, input.entityId, input.file.name);

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, input.file, {
    upsert: false,
    contentType: input.file.type || "application/octet-stream",
  });
  if (upErr) throw upErr;

  const { data, error: insErr } = await supabase
    .from("attachments")
    .insert({
      company_id: input.companyId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      storage_path: path,
      file_name: input.file.name,
      mime_type: input.file.type || "application/octet-stream",
      size_bytes: input.file.size,
      uploaded_by: input.userId,
    })
    .select()
    .single();

  if (insErr) {
    // Best-effort cleanup of the storage object if the DB insert failed.
    await supabase.storage.from(BUCKET).remove([path]);
    throw insErr;
  }
  return data;
}

export async function deleteAttachment(attachment: Attachment): Promise<void> {
  const { error: storageErr } = await supabase.storage
    .from(BUCKET)
    .remove([attachment.storage_path]);
  if (storageErr) throw storageErr;

  const { error: dbErr } = await supabase.from("attachments").delete().eq("id", attachment.id);
  if (dbErr) throw dbErr;
}

export async function createSignedUrl(path: string, expiresInSeconds = 60): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
