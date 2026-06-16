import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { Company } from "@/features/companies/api";

import type { PagarmeAccount, Recipient } from "../api";
import {
  useCreateRecipient,
  useDeleteRecipient,
  useRecipients,
  useUpdateRecipient,
} from "../hooks";
import { recipientFormSchema, type RecipientFormValues } from "../schema";
import { FieldToggle } from "./FieldToggle";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: PagarmeAccount | null;
  companies: Company[];
}

export function RecipientsSheet({ open, onOpenChange, connection, companies }: Props) {
  const accountId = connection?.id ?? null;
  const { data: recipients = [], isLoading } = useRecipients(open ? accountId : null);
  const update = useUpdateRecipient();
  const remove = useDeleteRecipient(accountId ?? "");
  const create = useCreateRecipient();
  const [confirmRemove, setConfirmRemove] = React.useState<Recipient | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RecipientFormValues>({
    resolver: zodResolver(recipientFormSchema),
    defaultValues: { pagarmeRecipientId: "", companyId: "", active: true },
  });

  const onAdd = handleSubmit((values) => {
    if (!connection) return;
    create.mutate(
      {
        pagarme_account_id: connection.id,
        pagarme_recipient_id: values.pagarmeRecipientId.trim(),
        company_id: values.companyId,
        ambiente: connection.ambiente,
        active: values.active,
      },
      {
        onSuccess: () => {
          toast.success("Recebedor mapeado");
          reset({ pagarmeRecipientId: "", companyId: "", active: true });
        },
        onError: (err) => toast.error("Erro ao mapear", { description: err.message }),
      },
    );
  });

  const companyName = (c: Company) => c.trade_name ?? c.legal_name;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md">
        <SheetHeader>
          <SheetTitle>Recebedores — {connection?.label}</SheetTitle>
          <SheetDescription>
            Mapeie cada recebedor do split (<code>re_…</code> / <code>rp_…</code>) desta conta para
            a empresa que emitirá a nota daquela fatia.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5">
          {/* lista */}
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : recipients.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-6 text-center text-sm text-text-muted">
              Nenhum recebedor mapeado. Adicione abaixo.
            </div>
          ) : (
            <ul className="space-y-2">
              {recipients.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-3"
                >
                  <div className="min-w-0">
                    <code className="block truncate font-mono text-xs">
                      {r.pagarme_recipient_id}
                    </code>
                    <span className="text-2xs text-text-subtle">
                      {r.company ? (r.company.trade_name ?? r.company.legal_name) : "—"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={r.active ? "income" : "default"}>
                      {r.active ? "Ativo" : "Inativo"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: r.id, payload: { active: !r.active } })}
                    >
                      {r.active ? "Desativar" : "Ativar"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remover"
                      className="text-expense hover:bg-expense-soft hover:text-expense"
                      onClick={() => setConfirmRemove(r)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* adicionar */}
          <form
            onSubmit={onAdd}
            className="space-y-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-4"
          >
            <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
              Adicionar recebedor
            </div>
            <div className="space-y-1.5">
              <Label>ID do recebedor</Label>
              <Input placeholder="re_xxxxxxxxxxxxxxxx" {...register("pagarmeRecipientId")} />
              {errors.pagarmeRecipientId && (
                <p className="text-2xs text-expense">{errors.pagarmeRecipientId.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Empresa emissora</Label>
              <Controller
                control={control}
                name="companyId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {companyName(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.companyId && (
                <p className="text-2xs text-expense">{errors.companyId.message}</p>
              )}
            </div>
            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <FieldToggle checked={field.value} onChange={field.onChange} label="Ativo" />
              )}
            />
            <Button type="submit" size="sm" disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Adicionar
            </Button>
          </form>
        </SheetBody>
      </SheetContent>

      <ConfirmDialog
        open={Boolean(confirmRemove)}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
        title="Remover recebedor"
        description={
          <>
            Remover o mapeamento de <strong>{confirmRemove?.pagarme_recipient_id}</strong>?
            Cobranças com split para este recebedor deixarão de gerar nota até ser remapeado.
          </>
        }
        confirmLabel="Remover"
        pending={remove.isPending}
        onConfirm={() => {
          if (!confirmRemove) return;
          remove.mutate(confirmRemove.id, {
            onSuccess: () => {
              toast.success("Recebedor removido");
              setConfirmRemove(null);
            },
            onError: (err) => toast.error("Erro ao remover", { description: err.message }),
          });
        }}
      />
    </Sheet>
  );
}
