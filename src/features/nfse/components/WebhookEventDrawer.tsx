import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDate } from "@/lib/dates";

import type { WebhookEvent } from "../api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: WebhookEvent | null;
}

export function WebhookEventDrawer({ open, onOpenChange, event }: Props) {
  const [copied, setCopied] = React.useState(false);
  if (!event) return null;

  const pretty = JSON.stringify(event.payload, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pretty);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {event.kind}
            {event.processError ? (
              <Badge tone="expense">erro</Badge>
            ) : event.processedAt ? (
              <Badge tone="income">processado</Badge>
            ) : (
              <Badge tone="warning">pendente</Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {event.provider === "pagarme" ? "pagar.me" : "Focus"} · recebido em{" "}
            {formatDate(event.receivedAt)}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-4">
          <div className="space-y-1 rounded-[var(--radius-md)] border border-border bg-surface p-3">
            <Row label="Referência" value={event.ref} />
            {event.resourceId && <Row label="Recurso" value={event.resourceId} />}
            <Row label="Recebido" value={formatDate(event.receivedAt)} />
            <Row
              label="Processado"
              value={event.processedAt ? formatDate(event.processedAt) : "—"}
            />
          </div>

          {event.processError && (
            <div className="space-y-1">
              <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
                Erro de processamento
              </div>
              <p className="rounded-[var(--radius-md)] border border-expense bg-expense-soft p-3 text-xs text-expense">
                {event.processError}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
                Payload bruto
              </div>
              <Button type="button" size="sm" variant="outline" onClick={copy}>
                {copied ? (
                  <Check className="size-3.5 text-income" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                Copiar
              </Button>
            </div>
            <pre className="text-2xs max-h-[55vh] overflow-auto rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 font-mono leading-relaxed">
              {pretty}
            </pre>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="shrink-0 text-text-subtle">{label}</span>
      <span className="truncate text-right font-mono text-xs">{value}</span>
    </div>
  );
}
