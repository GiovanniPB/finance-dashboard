import * as React from "react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { useCreateTransaction, useUpdateTransaction } from "../hooks";
import { emptyFormValues, type TransactionFormValues } from "../schema";
import type { TransactionWithRelations } from "../types";
import { TransactionForm } from "./TransactionForm";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, drawer is in edit mode. */
  transaction?: TransactionWithRelations | null;
  /** Company scope (drawer is disabled if null in create mode). */
  companyId: string | null;
}

export function TransactionDrawer({ open, onOpenChange, transaction, companyId }: Props) {
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const pending = create.isPending || update.isPending;

  const initialValues = React.useMemo<TransactionFormValues>(() => {
    if (transaction) {
      return {
        companyId: transaction.company_id,
        accountId: transaction.account_id,
        costCenterId: transaction.cost_center_id,
        bankAccountId: transaction.bank_account_id,
        counterpartyId: transaction.counterparty_id,
        direction: transaction.direction,
        amount: transaction.amount,
        accrualDate: transaction.accrual_date,
        dueDate: transaction.due_date,
        cashDate: transaction.cash_date,
        status: transaction.status,
        description: transaction.description,
        documentRef: transaction.document_ref,
        notes: transaction.notes,
      };
    }
    return emptyFormValues(companyId ?? "");
  }, [transaction, companyId]);

  const isEditing = Boolean(transaction);

  const handleSubmit = (values: TransactionFormValues) => {
    if (isEditing && transaction) {
      update.mutate(
        {
          id: transaction.id,
          payload: {
            account_id: values.accountId,
            cost_center_id: values.costCenterId,
            bank_account_id: values.bankAccountId,
            counterparty_id: values.counterpartyId,
            direction: values.direction,
            amount: values.amount,
            accrual_date: values.accrualDate,
            due_date: values.dueDate,
            cash_date: values.cashDate,
            status: values.status,
            description: values.description,
            document_ref: values.documentRef,
            notes: values.notes,
          },
        },
        {
          onSuccess: () => {
            toast.success("Lançamento atualizado");
            onOpenChange(false);
          },
          onError: (err) => {
            toast.error("Erro ao salvar", { description: err.message });
          },
        },
      );
    } else {
      create.mutate(
        {
          company_id: values.companyId,
          account_id: values.accountId,
          cost_center_id: values.costCenterId,
          bank_account_id: values.bankAccountId,
          counterparty_id: values.counterpartyId,
          direction: values.direction,
          amount: values.amount,
          accrual_date: values.accrualDate,
          due_date: values.dueDate,
          cash_date: values.cashDate,
          status: values.status,
          description: values.description,
          document_ref: values.documentRef,
          notes: values.notes,
        },
        {
          onSuccess: () => {
            toast.success("Lançamento criado");
            onOpenChange(false);
          },
          onError: (err) => {
            toast.error("Erro ao criar", { description: err.message });
          },
        },
      );
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md" className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar lançamento" : "Novo lançamento"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Atualize os dados do lançamento. Mudanças ficam no log de auditoria."
              : "Lance uma receita ou despesa. Use 'Agendado' se o evento ainda não ocorreu."}
          </SheetDescription>
        </SheetHeader>

        {/* Re-mount the form when initialValues changes so RHF picks up the new defaults */}
        <TransactionForm
          key={transaction?.id ?? "new"}
          initialValues={initialValues}
          existingTransaction={transaction ?? null}
          isPending={pending}
          onSubmit={handleSubmit}
          onCancel={() => {
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
