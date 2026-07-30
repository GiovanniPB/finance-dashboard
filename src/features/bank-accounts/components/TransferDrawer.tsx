import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2 } from "lucide-react";
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
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

import { useBankAccounts, useCreateTransfer } from "../hooks";
import { emptyTransferForm, transferFormSchema, type TransferFormValues } from "../schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  /** Conta pré-selecionada como origem (ao abrir a partir do extrato dela). */
  defaultFromAccountId?: string;
}

export function TransferDrawer({ open, onOpenChange, companyId, defaultFromAccountId }: Props) {
  const { data: accounts = [] } = useBankAccounts(companyId);
  const transfer = useCreateTransfer();

  const initialValues = React.useMemo(
    () => emptyTransferForm(companyId, defaultFromAccountId ?? ""),
    [companyId, defaultFromAccountId],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: initialValues,
  });

  // O drawer fica montado; reseta ao abrir para não herdar a transferência anterior.
  React.useEffect(() => {
    if (open) reset(initialValues);
  }, [open, initialValues, reset]);

  const fromId = watch("fromAccountId");
  const active = accounts.filter((a) => a.is_active);

  const onSubmit = handleSubmit((values) => {
    transfer.mutate(
      {
        companyId: values.companyId,
        fromAccountId: values.fromAccountId,
        toAccountId: values.toAccountId,
        amount: values.amount,
        date: values.date,
        description: values.description,
        notes: values.notes,
      },
      {
        onSuccess: () => {
          toast.success("Transferência registrada");
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error("Erro ao transferir", { description: err.message });
        },
      },
    );
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form onSubmit={onSubmit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Nova transferência</SheetTitle>
            <SheetDescription>
              Move dinheiro entre contas da mesma empresa. Não entra na DRE nem no fluxo de caixa —
              o caixa da empresa não muda, só a distribuição entre os bancos.
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fromAccountId">De</Label>
              <Controller
                control={control}
                name="fromAccountId"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger id="fromAccountId">
                      <SelectValue placeholder="Conta de origem" />
                    </SelectTrigger>
                    <SelectContent>
                      {active.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.nickname}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.fromAccountId && (
                <p className="text-xs text-expense">{errors.fromAccountId.message}</p>
              )}
            </div>

            <div className="flex justify-center text-text-subtle">
              <ArrowRight className="size-4 rotate-90" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="toAccountId">Para</Label>
              <Controller
                control={control}
                name="toAccountId"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger id="toAccountId">
                      <SelectValue placeholder="Conta de destino" />
                    </SelectTrigger>
                    <SelectContent>
                      {active
                        .filter((a) => a.id !== fromId)
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.nickname}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.toAccountId && (
                <p className="text-xs text-expense">{errors.toAccountId.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amount">Valor</Label>
                <Controller
                  control={control}
                  name="amount"
                  render={({ field }) => (
                    <CurrencyInput id="amount" value={field.value} onValueChange={field.onChange} />
                  )}
                />
                {errors.amount && <p className="text-xs text-expense">{errors.amount.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="date">Data</Label>
                <Input id="date" type="date" {...register("date")} />
                {errors.date && <p className="text-xs text-expense">{errors.date.message}</p>}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                placeholder="Opcional — geramos uma a partir das contas"
                {...register("description")}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" rows={3} {...register("notes")} />
            </div>
          </SheetBody>

          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={transfer.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={transfer.isPending}>
              {transfer.isPending && <Loader2 className="size-4 animate-spin" />}
              Transferir
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
