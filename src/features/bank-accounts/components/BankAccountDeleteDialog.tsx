import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import type { BankAccount } from "../api";
import { useBankAccountUsage, useDeleteBankAccount } from "../hooks";

interface Props {
  account: BankAccount | null;
  onClose: () => void;
}

/**
 * Confirmation dialog for deleting a bank account. Fetches reference counts so
 * the user understands the impact: statement lines and balance snapshots are
 * cascade-deleted, while transactions and recurring templates are kept but
 * unlinked from the account.
 */
export function BankAccountDeleteDialog({ account, onClose }: Props) {
  const { data: usage, isLoading } = useBankAccountUsage(account?.id ?? null);
  const remove = useDeleteBankAccount();

  const hasLinks =
    usage != null &&
    (usage.transactions > 0 ||
      usage.statementLines > 0 ||
      usage.recurringTemplates > 0 ||
      usage.snapshots > 0);

  function handleConfirm() {
    if (!account) return;
    remove.mutate(account.id, {
      onSuccess: () => {
        toast.success("Conta bancária excluída");
        onClose();
      },
      onError: (err) => toast.error("Erro ao excluir", { description: err.message }),
    });
  }

  const description = isLoading ? (
    "Verificando vínculos…"
  ) : hasLinks && usage ? (
    <span className="space-y-2">
      <span className="block">Esta conta possui registros vinculados. Ao excluir:</span>
      <ul className="list-disc space-y-0.5 pl-4 text-text-muted">
        {usage.statementLines > 0 && (
          <li>
            {usage.statementLines} linha(s) de extrato serão <strong>apagadas</strong>.
          </li>
        )}
        {usage.snapshots > 0 && (
          <li>
            {usage.snapshots} snapshot(s) de saldo serão <strong>apagados</strong>.
          </li>
        )}
        {usage.transactions > 0 && (
          <li>
            {usage.transactions} lançamento(s) serão <strong>mantidos</strong>, mas desvinculados da
            conta.
          </li>
        )}
        {usage.recurringTemplates > 0 && (
          <li>
            {usage.recurringTemplates} recorrência(s) serão <strong>mantidas</strong>, mas
            desvinculadas.
          </li>
        )}
      </ul>
      <span className="block">Esta ação não pode ser desfeita.</span>
    </span>
  ) : (
    "Esta conta não possui vínculos. A exclusão é permanente e não pode ser desfeita."
  );

  return (
    <ConfirmDialog
      open={account != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={account ? `Excluir conta "${account.nickname}"?` : "Excluir conta"}
      description={description}
      confirmLabel="Excluir conta"
      pending={remove.isPending || isLoading}
      onConfirm={handleConfirm}
    />
  );
}
