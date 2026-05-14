import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { useBankAccounts } from "@/features/bank-accounts/hooks";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";

import { useRegisterPayment } from "../hooks";
import { paymentFormSchema, type PaymentFormValues } from "../schema";
import type { BillWithRelations } from "../types";

interface Props {
  bill: BillWithRelations | null;
  onOpenChange: (open: boolean) => void;
}

export function PaymentDialog({ bill, onOpenChange }: Props) {
  const open = Boolean(bill);
  const registerMutation = useRegisterPayment();
  const { data: bankAccounts = [] } = useBankAccounts(bill?.company_id ?? null);

  const openAmount = bill?.open_amount ?? 0;
  const defaultBank = bankAccounts[0]?.id ?? "";

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: openAmount,
      paidAt: new Date().toISOString().slice(0, 10),
      bankAccountId: defaultBank,
      interest: 0,
      fine: 0,
      discount: 0,
    },
  });

  React.useEffect(() => {
    if (bill) {
      reset({
        amount: bill.open_amount ?? 0,
        paidAt: new Date().toISOString().slice(0, 10),
        bankAccountId: defaultBank,
        interest: 0,
        fine: 0,
        discount: 0,
      });
    }
  }, [bill, defaultBank, reset]);

  const onSubmit = handleSubmit((values) => {
    if (!bill?.id) return;
    registerMutation.mutate(
      {
        transactionId: bill.id,
        amount: values.amount,
        paidAt: values.paidAt,
        bankAccountId: values.bankAccountId,
        interest: values.interest,
        fine: values.fine,
        discount: values.discount,
      },
      {
        onSuccess: () => {
          toast.success("Baixa registrada");
          onOpenChange(false);
        },
        onError: (err) => toast.error("Erro ao dar baixa", { description: err.message }),
      },
    );
  });

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
                Dar baixa no título
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-text-muted">
                {bill?.description}
              </DialogPrimitive.Description>
              <div className="mt-1 text-sm">
                Saldo em aberto:{" "}
                <span className="font-mono font-semibold">{formatBRL(openAmount)}</span>
              </div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="amount">Valor pago</Label>
                <Controller
                  name="amount"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput id="amount" value={field.value} onValueChange={field.onChange} />
                  )}
                />
                {errors.amount && <p className="text-2xs text-expense">{errors.amount.message}</p>}
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
                      {bankAccounts.map((b) => (
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

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="interest">Juros</Label>
                <Controller
                  name="interest"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput
                      id="interest"
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fine">Multa</Label>
                <Controller
                  name="fine"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput id="fine" value={field.value} onValueChange={field.onChange} />
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="discount">Desconto</Label>
                <Controller
                  name="discount"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput
                      id="discount"
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={registerMutation.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={registerMutation.isPending}>
                {registerMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Registrar baixa
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
