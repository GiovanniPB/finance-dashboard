import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import type { Company } from "@/features/companies/api";
import type { PagarmeAccount, Recipient } from "@/features/nfse/api";
import { FieldToggle } from "@/features/nfse/components/FieldToggle";
import {
  useCreateRecipient,
  useDeleteRecipient,
  useRecipients,
  useUpdateRecipient,
} from "@/features/nfse/hooks";
import { recipientFormSchema, type RecipientFormValues } from "@/features/nfse/schema";

interface Props {
  connection: PagarmeAccount;
  companies: Company[];
}

/**
 * Recebedores do split → empresa.
 *
 * Este mapeamento serve às DUAS pontas da integração, e é por isso que ele deixou
 * de morar dentro da tela de notas: decide qual empresa emite a nota de cada fatia
 * **e** de quem é o recebível daquela fatia no financeiro. Recebedor não mapeado
 * significa nota não emitida e dinheiro fora do ledger — nunca um palpite.
 */
export function RecipientsSection({ connection, companies }: Props) {
  const { data: recipients = [], isLoading } = useRecipients(connection.id);
  const update = useUpdateRecipient();
  const remove = useDeleteRecipient(connection.id);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recebedores do split</CardTitle>
        <CardDescription>
          Cada recebedor (<code>re_…</code> / <code>rp_…</code>) aponta para a empresa que emite a
          nota daquela fatia e a quem pertence o recebível dela.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : recipients.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-border p-6 text-center text-sm text-text-muted">
            Nenhum recebedor mapeado. Cobrança com split para recebedor desconhecido não gera nota e
            o recebível fica sem empresa.
          </div>
        ) : (
          <ul className="space-y-2">
            {recipients.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3"
              >
                <div className="min-w-0">
                  <code className="block truncate font-mono text-xs">{r.pagarme_recipient_id}</code>
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

        <form
          onSubmit={onAdd}
          className="grid grid-cols-1 items-end gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="space-y-1.5">
            <Label>ID do recebedor</Label>
            <Input placeholder="re_xxxxxxxxxxxxxxxx" {...register("pagarmeRecipientId")} />
            {errors.pagarmeRecipientId && (
              <p className="text-2xs text-expense">{errors.pagarmeRecipientId.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Empresa</Label>
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
                        {c.trade_name ?? c.legal_name}
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
          <Button type="submit" variant="secondary" disabled={create.isPending}>
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Adicionar
          </Button>
        </form>
      </CardContent>

      <ConfirmDialog
        open={Boolean(confirmRemove)}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
        title="Remover recebedor"
        description={
          <>
            Remover o mapeamento de <strong>{confirmRemove?.pagarme_recipient_id}</strong>?
            Cobranças com split para este recebedor deixarão de gerar nota e seus recebíveis ficarão
            sem empresa até ser remapeado.
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
    </Card>
  );
}
