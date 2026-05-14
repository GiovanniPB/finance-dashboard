import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteAttachment,
  listAttachments,
  uploadAttachment,
  type Attachment,
  type AttachmentEntityType,
  type UploadInput,
} from "./api";

export const attachmentKeys = {
  list: (entityType: AttachmentEntityType, entityId: string | null) =>
    ["attachments", entityType, entityId] as const,
};

export function useAttachments(entityType: AttachmentEntityType, entityId: string | null) {
  return useQuery({
    queryKey: attachmentKeys.list(entityType, entityId),
    queryFn: () => listAttachments(entityType, entityId ?? ""),
    enabled: Boolean(entityId),
  });
}

export function useUploadAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadInput) => uploadAttachment(input),
    onSuccess: (att) => {
      void qc.invalidateQueries({
        queryKey: attachmentKeys.list(att.entity_type, att.entity_id),
      });
    },
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachment: Attachment) => deleteAttachment(attachment),
    onSuccess: (_void, attachment) => {
      void qc.invalidateQueries({
        queryKey: attachmentKeys.list(attachment.entity_type, attachment.entity_id),
      });
    },
  });
}
