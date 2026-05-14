import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";

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
import { SheetBody, SheetFooter } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { AccountCombobox } from "@/features/accounts/AccountCombobox";
import { AttachmentsSection } from "@/features/attachments/components/AttachmentsSection";
import { CostCenterSelect } from "@/features/cost-centers/CostCenterSelect";

import { transactionFormSchema, type TransactionFormValues } from "../schema";
import type { TransactionWithRelations } from "../types";

interface Props {
  initialValues: TransactionFormValues;
  existingTransaction?: TransactionWithRelations | null;
  isPending: boolean;
  onSubmit: (values: TransactionFormValues) => void;
  onCancel: () => void;
}

export function TransactionForm({
  initialValues,
  existingTransaction,
  isPending,
  onSubmit,
  onCancel,
}: Props) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isDirty },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: initialValues,
  });

  const companyId = watch("companyId");
  const isEditing = Boolean(existingTransaction);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
      <SheetBody className="space-y-5">
        {/* Direction + Status */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="direction">Tipo</Label>
            <Controller
              name="direction"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="direction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inflow">Entrada (receita)</SelectItem>
                    <SelectItem value="outflow">Saída (despesa)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Agendado</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="settled">Liquidado</SelectItem>
                    <SelectItem value="reconciled">Conciliado</SelectItem>
                    <SelectItem value="canceled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        {/* Amount */}
        <div className="space-y-1.5">
          <Label htmlFor="amount">Valor</Label>
          <Controller
            name="amount"
            control={control}
            render={({ field }) => (
              <CurrencyInput
                id="amount"
                value={field.value}
                onValueChange={field.onChange}
                disabled={isPending}
              />
            )}
          />
          {errors.amount && <p className="text-2xs text-expense">{errors.amount.message}</p>}
        </div>

        {/* Account */}
        <div className="space-y-1.5">
          <Label htmlFor="accountId">Conta</Label>
          <Controller
            name="accountId"
            control={control}
            render={({ field }) => (
              <AccountCombobox
                id="accountId"
                companyId={companyId}
                value={field.value}
                onChange={field.onChange}
                disabled={isPending}
              />
            )}
          />
          {errors.accountId && <p className="text-2xs text-expense">{errors.accountId.message}</p>}
        </div>

        {/* Cost center */}
        <div className="space-y-1.5">
          <Label htmlFor="costCenterId">
            Centro de custo <span className="text-text-subtle">(opcional)</span>
          </Label>
          <Controller
            name="costCenterId"
            control={control}
            render={({ field }) => (
              <CostCenterSelect
                id="costCenterId"
                companyId={companyId}
                value={field.value ?? null}
                onChange={field.onChange}
              />
            )}
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="accrualDate">Competência</Label>
            <Input
              id="accrualDate"
              type="date"
              {...register("accrualDate")}
              aria-invalid={Boolean(errors.accrualDate)}
            />
            {errors.accrualDate && (
              <p className="text-2xs text-expense">{errors.accrualDate.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cashDate">
              Caixa <span className="text-text-subtle">(opcional)</span>
            </Label>
            <Controller
              name="cashDate"
              control={control}
              render={({ field }) => (
                <Input
                  id="cashDate"
                  type="date"
                  value={field.value ?? ""}
                  onChange={(e) => {
                    field.onChange(e.target.value === "" ? null : e.target.value);
                  }}
                />
              )}
            />
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="description">Descrição</Label>
          <Input
            id="description"
            placeholder="Aluguel agosto/2025, NF #1234, etc."
            {...register("description")}
            aria-invalid={Boolean(errors.description)}
          />
          {errors.description && (
            <p className="text-2xs text-expense">{errors.description.message}</p>
          )}
        </div>

        {/* Document */}
        <div className="space-y-1.5">
          <Label htmlFor="documentRef">
            Documento <span className="text-text-subtle">(opcional)</span>
          </Label>
          <Controller
            name="documentRef"
            control={control}
            render={({ field }) => (
              <Input
                id="documentRef"
                placeholder="Nº NF, boleto, contrato…"
                value={field.value ?? ""}
                onChange={(e) => {
                  field.onChange(e.target.value === "" ? null : e.target.value);
                }}
              />
            )}
          />
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="notes">
            Notas internas <span className="text-text-subtle">(opcional)</span>
          </Label>
          <Controller
            name="notes"
            control={control}
            render={({ field }) => (
              <Textarea
                id="notes"
                placeholder="Observações que não vão pro DRE…"
                rows={3}
                value={field.value ?? ""}
                onChange={(e) => {
                  field.onChange(e.target.value === "" ? null : e.target.value);
                }}
              />
            )}
          />
        </div>

        {isEditing && existingTransaction ? (
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
            <AttachmentsSection
              entityType="transaction"
              entityId={existingTransaction.id}
              companyId={existingTransaction.company_id}
            />
          </div>
        ) : null}
      </SheetBody>

      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending || (isEditing && !isDirty)}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          {isEditing ? "Salvar alterações" : "Criar lançamento"}
        </Button>
      </SheetFooter>
    </form>
  );
}
