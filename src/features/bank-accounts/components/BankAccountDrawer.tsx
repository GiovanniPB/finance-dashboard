import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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

import type { BankAccount } from "../api";
import { useCreateBankAccount, useUpdateBankAccount } from "../hooks";
import {
  BANK_ACCOUNT_TYPES,
  bankAccountFormSchema,
  emptyBankAccountForm,
  type BankAccountFormValues,
} from "../schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: BankAccount | null;
  companyId: string;
}

export function BankAccountDrawer({ open, onOpenChange, account, companyId }: Props) {
  const isEditing = Boolean(account);
  const create = useCreateBankAccount();
  const update = useUpdateBankAccount();
  const pending = create.isPending || update.isPending;

  const initialValues = React.useMemo<BankAccountFormValues>(() => {
    if (account) {
      return {
        companyId: account.company_id,
        bankName: account.bank_name,
        nickname: account.nickname,
        accountType: account.account_type,
        agency: account.agency,
        accountNumber: account.account_number,
        initialBalance: account.initial_balance,
        initialBalanceDate: account.initial_balance_date,
        sortOrder: account.sort_order,
        isActive: account.is_active,
        notes: account.notes,
      };
    }
    return emptyBankAccountForm(companyId);
  }, [account, companyId]);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<BankAccountFormValues>({
    resolver: zodResolver(bankAccountFormSchema),
    defaultValues: initialValues,
  });

  const onSubmit = handleSubmit((values) => {
    const payload = {
      company_id: values.companyId,
      bank_name: values.bankName,
      nickname: values.nickname,
      account_type: values.accountType,
      agency: values.agency,
      account_number: values.accountNumber,
      initial_balance: values.initialBalance,
      initial_balance_date: values.initialBalanceDate,
      sort_order: values.sortOrder,
      is_active: values.isActive,
      notes: values.notes,
    };
    if (isEditing && account) {
      update.mutate(
        { id: account.id, payload },
        {
          onSuccess: () => {
            toast.success("Conta bancária atualizada");
            onOpenChange(false);
          },
          onError: (err) => {
            toast.error("Erro ao salvar", { description: err.message });
          },
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success("Conta bancária criada");
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error("Erro ao criar", { description: err.message });
        },
      });
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md" className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar conta bancária" : "Nova conta bancária"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Atualize os dados da conta. Saldo inicial só vale para contas novas."
              : "Cadastre uma conta para vincular a lançamentos."}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={onSubmit}
          key={account?.id ?? "new"}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <SheetBody className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bankName">Banco</Label>
                <Input
                  id="bankName"
                  placeholder="BTG Pactual"
                  {...register("bankName")}
                  aria-invalid={Boolean(errors.bankName)}
                />
                {errors.bankName && (
                  <p className="text-2xs text-expense">{errors.bankName.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="accountType">Tipo</Label>
                <Controller
                  name="accountType"
                  control={control}
                  render={({ field }) => (
                    <Select
                      id="accountType"
                      value={field.value}
                      onChange={(e) => {
                        field.onChange(e.target.value);
                      }}
                      className="w-full"
                    >
                      {BANK_ACCOUNT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nickname">Apelido</Label>
              <Input
                id="nickname"
                placeholder="BTG - conta remunerada"
                {...register("nickname")}
                aria-invalid={Boolean(errors.nickname)}
              />
              {errors.nickname && (
                <p className="text-2xs text-expense">{errors.nickname.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="agency">
                  Agência <span className="text-text-subtle">(opcional)</span>
                </Label>
                <Controller
                  name="agency"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="agency"
                      placeholder="0001"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(e.target.value === "" ? null : e.target.value);
                      }}
                    />
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="accountNumber">
                  Nº da conta <span className="text-text-subtle">(opcional)</span>
                </Label>
                <Controller
                  name="accountNumber"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="accountNumber"
                      placeholder="12345-6"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(e.target.value === "" ? null : e.target.value);
                      }}
                    />
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="initialBalance">Saldo inicial</Label>
                <Controller
                  name="initialBalance"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput
                      id="initialBalance"
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isEditing}
                    />
                  )}
                />
                {isEditing && (
                  <p className="text-2xs text-text-subtle">Saldo inicial é fixo após a criação.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="initialBalanceDate">Data do saldo</Label>
                <Controller
                  name="initialBalanceDate"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="initialBalanceDate"
                      type="date"
                      disabled={isEditing}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(e.target.value === "" ? null : e.target.value);
                      }}
                    />
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sortOrder">Ordem de exibição</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  min={0}
                  {...register("sortOrder", { valueAsNumber: true })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <Controller
                  name="isActive"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? "active" : "inactive"}
                      onChange={(e) => {
                        field.onChange(e.target.value === "active");
                      }}
                      className="w-full"
                    >
                      <option value="active">Ativa</option>
                      <option value="inactive">Inativa</option>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">
                Observações <span className="text-text-subtle">(opcional)</span>
              </Label>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <Textarea
                    id="notes"
                    rows={3}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      field.onChange(e.target.value === "" ? null : e.target.value);
                    }}
                  />
                )}
              />
            </div>
          </SheetBody>

          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onOpenChange(false);
              }}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || (isEditing && !isDirty)}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar conta"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
