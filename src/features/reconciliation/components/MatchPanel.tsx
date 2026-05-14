import { CheckCircle2, Eye, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { StatementLineWithRelations } from "../api";
import { useCandidates, useIgnoreLine, useMatchLine } from "../hooks";

interface Props {
  line: StatementLineWithRelations;
  onClose: () => void;
}

export function MatchPanel({ line, onClose }: Props) {
  const { data: candidates = [], isLoading } = useCandidates(line.id);
  const matchMutation = useMatchLine();
  const ignoreMutation = useIgnoreLine();

  const handleMatch = (transactionId: string) => {
    matchMutation.mutate(
      { lineId: line.id, transactionId },
      {
        onSuccess: () => {
          toast.success("Linha conciliada");
          onClose();
        },
        onError: (err) => toast.error("Erro ao conciliar", { description: err.message }),
      },
    );
  };

  const handleIgnore = () => {
    ignoreMutation.mutate(line.id, {
      onSuccess: () => {
        toast.success("Linha marcada como ignorada");
        onClose();
      },
      onError: (err) => toast.error("Erro ao ignorar", { description: err.message }),
    });
  };

  return (
    <div className="space-y-3 rounded-[var(--radius-md)] border border-accent bg-accent-soft/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
            Candidatos a conciliar
          </div>
          <div className="mt-0.5 truncate text-sm font-medium">{line.description}</div>
          <div className="mt-0.5 text-xs text-text-muted">
            {formatDate(line.posted_at)} ·{" "}
            <span className="font-mono font-semibold">{formatBRL(line.amount)}</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
          <X className="size-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Loader2 className="size-3 animate-spin" /> Buscando candidatos…
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-4 text-center text-sm text-text-muted">
          Nenhum lançamento parecido encontrado. Você pode ignorar esta linha ou criar um lançamento
          manualmente em /transactions.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {candidates.map((c) => (
            <li
              key={c.transaction_id}
              className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-2.5"
            >
              <ScoreBadge score={c.score} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{c.description}</div>
                <div className="text-2xs text-text-subtle">
                  {c.counterparty_name ? `${c.counterparty_name} · ` : ""}
                  {c.account_code ? `${c.account_code} · ` : ""}
                  Venc.: {c.due_date ? formatDate(c.due_date) : "—"}
                  {c.cash_date ? ` · Caixa: ${formatDate(c.cash_date)}` : ""}
                </div>
              </div>
              <span className="font-mono text-sm font-semibold whitespace-nowrap">
                {formatBRL(c.amount)}
              </span>
              <Button
                size="sm"
                disabled={matchMutation.isPending}
                onClick={() => handleMatch(c.transaction_id)}
              >
                <CheckCircle2 className="size-3.5" /> Conciliar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-between border-t border-border pt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleIgnore}
          disabled={ignoreMutation.isPending}
        >
          <Eye className="size-3.5" /> Marcar como ignorada
        </Button>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const tone: "income" | "warning" | "expense" =
    score >= 80 ? "income" : score >= 60 ? "warning" : "expense";
  return (
    <Badge tone={tone} className={cn("min-w-[42px] justify-center font-mono")}>
      {score}%
    </Badge>
  );
}
