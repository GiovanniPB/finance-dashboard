import * as React from "react";
import { Rocket } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useConnections, useReemitToProducao } from "../hooks";

/**
 * Cutover para produção: clona as notas AUTORIZADAS de homologação de uma conexão
 * em novos jobs de produção (pending_review). Nada é emitido — o operador revisa
 * e emite depois. Notas de homologação são de teste (sem valor fiscal) e não se
 * convertem; por isso geramos documentos novos no ambiente de produção.
 */
export function ReemitProducaoCard() {
  const { data: connections = [] } = useConnections();
  const reemit = useReemitToProducao();
  const [accountId, setAccountId] = React.useState<string>("");
  const [confirming, setConfirming] = React.useState(false);

  function run() {
    reemit.mutate(accountId, {
      onSuccess: (n) => {
        setConfirming(false);
        toast.success(
          n > 0
            ? `${n} nota(s) criadas em produção como pendentes. Revise e emita.`
            : "Nenhuma nota nova (as autorizadas de homologação já foram reemitidas).",
        );
      },
      onError: (e) => {
        setConfirming(false);
        toast.error(e instanceof Error ? e.message : "Falha ao reemitir em produção.");
      },
    });
  }

  const conn = connections.find((c) => c.id === accountId);

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <Rocket className="size-4 text-accent" />
        <h2 className="text-sm font-semibold">Reemissão em produção</h2>
      </div>
      <p className="mt-1 text-xs text-text-muted">
        Notas de homologação são de <strong>teste</strong> (sem valor fiscal) e não viram produção.
        Isto <strong>clona</strong> as notas <strong>autorizadas</strong> de homologação da conexão
        em cópias de <strong>produção</strong> como pendentes — nada é emitido até você revisar e
        emitir. Configure antes o token e o webhook de produção da conexão.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56">
          <Label>Conexão pagar.me</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="mt-1 w-full">
              <SelectValue placeholder="Selecione a conta" />
            </SelectTrigger>
            <SelectContent>
              {connections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={!accountId || reemit.isPending}
          onClick={() => setConfirming(true)}
        >
          Reemitir autorizadas em produção
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        tone="default"
        title="Reemitir em produção?"
        description={
          <>
            Cria cópias de <strong>produção</strong> (pendentes de revisão) das notas autorizadas de
            homologação da conexão <strong>{conn?.label ?? "—"}</strong>. Nenhuma nota é emitida
            agora. Confirme só depois de configurar o token e o webhook de produção.
          </>
        }
        confirmLabel={reemit.isPending ? "Clonando…" : "Reemitir"}
        pending={reemit.isPending}
        onConfirm={run}
      />
    </div>
  );
}
