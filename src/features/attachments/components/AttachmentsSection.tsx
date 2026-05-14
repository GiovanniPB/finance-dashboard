import * as React from "react";
import {
  Download,
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/features/auth/AuthProvider";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";

import {
  ALLOWED_MIME_TYPES,
  createSignedUrl,
  MAX_FILE_SIZE_BYTES,
  type Attachment,
  type AttachmentEntityType,
} from "../api";
import { useAttachments, useDeleteAttachment, useUploadAttachment } from "../hooks";

interface Props {
  entityType: AttachmentEntityType;
  entityId: string;
  companyId: string;
  readOnly?: boolean;
}

export function AttachmentsSection({ entityType, entityId, companyId, readOnly }: Props) {
  const { user } = useAuth();
  const { data: attachments = [], isLoading } = useAttachments(entityType, entityId);
  const upload = useUploadAttachment();
  const del = useDeleteAttachment();

  const [dragOver, setDragOver] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<Attachment | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFiles = React.useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0 || !user) return;
      Array.from(files).forEach((file) => {
        upload.mutate(
          { companyId, entityType, entityId, file, userId: user.id },
          {
            onSuccess: () => toast.success(`Anexo enviado: ${file.name}`),
            onError: (err) =>
              toast.error("Erro ao enviar", { description: err.message ?? String(err) }),
          },
        );
      });
    },
    [companyId, entityType, entityId, upload, user],
  );

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const onDownload = async (a: Attachment) => {
    try {
      const url = await createSignedUrl(a.storage_path, 60);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error("Erro ao baixar", { description: message });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-2xs flex items-center gap-1.5 font-semibold tracking-wide text-text-subtle uppercase">
          <Paperclip className="size-3" />
          Anexos · {attachments.length}
        </div>
      </div>

      {!readOnly && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-md)] border border-dashed p-4 text-center text-xs transition-colors",
            dragOver
              ? "border-accent bg-accent-soft text-accent"
              : "border-border bg-surface-2 text-text-muted hover:border-border-strong hover:bg-surface-3",
          )}
        >
          <Upload className="mb-1 size-4" />
          <span>Arraste arquivos aqui ou clique para selecionar</span>
          <span className="text-2xs mt-0.5 text-text-subtle">
            Até {(MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)} MB · PDF, imagens, XML, planilhas
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ALLOWED_MIME_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-text-subtle">
          <Loader2 className="size-3 animate-spin" /> Carregando anexos…
        </div>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-text-subtle">Nenhum anexo.</p>
      ) : (
        <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <FileIconForMime mime={a.mime_type} />
              <div className="min-w-0 flex-1">
                <div className="truncate">{a.file_name}</div>
                <div className="text-2xs text-text-subtle">
                  {formatBytes(a.size_bytes)} · {formatDate(a.created_at)}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void onDownload(a)}
                aria-label="Baixar"
                title="Baixar"
              >
                <Download className="size-3.5" />
              </Button>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setConfirmDelete(a)}
                  aria-label="Excluir"
                  className="text-expense hover:bg-expense-soft hover:text-expense"
                  title="Excluir"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Excluir anexo"
        description={
          <>
            Excluir <strong>{confirmDelete?.file_name}</strong>? Esta ação remove o arquivo
            permanentemente.
          </>
        }
        confirmLabel="Excluir"
        pending={del.isPending}
        onConfirm={() => {
          if (!confirmDelete) return;
          del.mutate(confirmDelete, {
            onSuccess: () => {
              toast.success("Anexo excluído");
              setConfirmDelete(null);
            },
            onError: (err) =>
              toast.error("Erro ao excluir", { description: err.message ?? String(err) }),
          });
        }}
      />
    </div>
  );
}

function FileIconForMime({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <FileImage className="size-4 shrink-0 text-info" />;
  if (mime.includes("pdf")) return <FileText className="size-4 shrink-0 text-expense" />;
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv"))
    return <FileSpreadsheet className="size-4 shrink-0 text-income" />;
  return <FileIcon className="size-4 shrink-0 text-text-subtle" />;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
