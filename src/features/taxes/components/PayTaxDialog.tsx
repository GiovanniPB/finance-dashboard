import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccountCombobox } from "@/features/accounts/AccountCombobox";
import { useBankAccounts } from "@/features/bank-accounts/hooks";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";

import type { TaxObligation } from "../api";
import { KIND_META } from "../constants";
import { useMarkTaxPaid } from "../hooks";

const schema = z.object({
  paidAt: z
    .string()
    .min(1)
    .regex(/^\d{4}-\d{2}-\d{2}$/u),
  bankAccountId: z.string().uuid("Conta bancária obrigatória"),
  accountId: z.string().uuid("Conta contábil obrigatória"),
  actualAmount: z.coerce.number().positive("Valor deve ser maior que zero"),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  obligation: TaxObligation | null;
  onOpenChange: (open: boolean) => void;
}

export function PayTaxDialog({ obligation, onOpenChange }: Props) {
  const open = Boolean(obligation);
  const { data: banks = [] } = useBankAccounts(obligation?.company_id ?? null);
  const mutation = useMarkTaxPaid();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      paidAt: new Date().toISOString().slice(0, 10),
      bankAccountId: "",
      accountId: "",
      actualAmount: 0,
    },
  });

  React.useEffect(() => {
    if (obligation) {
      reset({
        paidAt: new Date().toISOString().slice(0, 10),
        bankAccountId: banks[0]?.id ?? "",
        accountId: "",
        actualAmount: obligation.amount_estimated,
      });
    }
  }, [obligation, banks, reset]);

  const onSubmit = handleSubmit((values) => {
    if (!obligation) return;
    mutation.mutate(
      {
        obligationId: obligation.id,
        paidAt: values.paidAt,
        bankAccountId: values.bankAccountId,
        accountId: values.accountId,
        actualAmount: values.actualAmount,
      },
      {
        onSuccess: () => {
          toast.success("Imposto pago e lançamento criado");
          onOpenChange(false);
        },
        onError: (err) => toast.error("Erro ao pagar", { description: err.message }),
      },
    );
  });

  const meta = obligation ? KIND_META[obligation.kind] : null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[90vw] max-w-lg -translate-x-1/2 -translate-y-1/2",
            "rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-lg)]",
            "data-[state=closed]:animate-out data-[state=open]:animate-in",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="mb-4 flex gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-income-soft text-income">
              <CheckCircle2 className="size-4" />
            </div>
            <div className="flex-1">
              <DialogPrimitive.Title className="font-display text-base font-semibold">
                Pagar imposto
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-text-muted">
                {meta?.label}
              </DialogPrimitive.Description>
              <div className="mt-1 text-sm">
                Estimado:{" "}
                <span className="font-mono font-semibold">
                  {formatBRL(obligation?.amount_estimated ?? 0)}
                </span>
              </div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="actualAmount">Valor pago</Label>
                <Controller
                  name="actualAmount"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput
                      id="actualAmount"
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
                {errors.actualAmount && (
                  <p className="text-2xs text-expense">{errors.actualAmount.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="paidAt">Data do pagamento</Label>
                <Input id="paidAt" type="date" {...register("paidAt")} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bankAccountId">Conta bancária</Label>
              <Controller
                name="bankAccountId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="bankAccountId">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      {banks.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.nickname} · {b.bank_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.bankAccountId && (
                <p className="text-2xs text-expense">{errors.bankAccountId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="accountId">Conta DRE (despesa fiscal)</Label>
              <Controller
                name="accountId"
                control={control}
                render={({ field }) => (
                  <AccountCombobox
                    id="accountId"
                    companyId={obligation?.company_id ?? null}
                    value={field.value || null}
                    onChange={field.onChange}
                    placeholder="Selecione a conta de imposto…"
                  />
                )}
              />
              {errors.accountId && (
                <p className="text-2xs text-expense">{errors.accountId.message}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Pagar e lançar
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
