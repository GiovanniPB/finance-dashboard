import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";

import { Button } from "./button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  pending?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
  pending = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-lg)]",
            "data-[state=closed]:animate-out data-[state=open]:animate-in",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="flex gap-3">
            {tone === "danger" && (
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-expense-soft text-expense">
                <AlertTriangle className="size-4" />
              </div>
            )}
            <div className="flex-1 space-y-1.5">
              <DialogPrimitive.Title className="font-display text-base font-semibold">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-sm text-text-muted">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              {cancelLabel}
            </Button>
            <Button
              onClick={onConfirm}
              disabled={pending}
              className={cn(
                tone === "danger" &&
                  "bg-expense text-white hover:bg-expense/90 focus-visible:ring-expense",
              )}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
