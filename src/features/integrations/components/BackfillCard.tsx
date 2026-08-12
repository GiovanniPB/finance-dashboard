import * as React from "react";
import { CircleAlert, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PagarmeAccount } from "@/features/nfse/api";
import type { SyncRun } from "@/features/sales/api";
import { useStartBackfill, useSyncRuns } from "@/features/sales/hooks";
import { dayEndIso, dayStartIso, formatDate, isoDate } from "@/lib/dates";
import { formatNumber } from "@/lib/format";

import { useResumeSyncRun } from "../hooks";

interface Props {
  connection: PagarmeAccount;
  canEdit: boolean;
}

/** Lote sem progresso por mais tempo que isto = esteira provavelmente inativa. */
const STALE_MINUTES = 10;

const STATUS_LABELS: Record<string, string> = {
  running: "em andamento",
  completed: "concluído",
  failed: "falhou",
};

/**
 * Carga histórica das vendas desta conexão.
 *
 * O ledger nasce vazio: webhook só traz venda NOVA. Todo o histórico — e com ele os
 * recebíveis já contratados que sustentam o "A Receber" — entra por aqui.
 *
 * A tela só ENFILEIRA. O cron `pagarme-backfill` drena o lote em blocos de duas
 * páginas por tick, retomável por cursor: cada venda paga custa uma consulta de
 * cronograma, então varrer anos numa invocação estouraria o tempo da Edge Function.
 * Sem os segredos do cron configurados o lote fica parado em zero — é o que o aviso
 * de lote travado detecta.
 */
export function BackfillCard({ connection, canEdit }: Props) {
  const [start, setStart] = React.useState("2025-01-01");
  const [end, setEnd] = React.useState(() => isoDate());

  const runs = useSyncRuns();
  const startBackfill = useStartBackfill();
  const resume = useResumeSyncRun();

  const isProduction = connection.ambiente === "producao";
  const mine = (runs.data ?? []).filter((r) => r.pagarmeAccountId === connection.id);

  function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (end < start) {
      toast.error("A janela termina antes de começar.");
      return;
    }
    startBackfill.mutate(
      {
        accountId: connection.id,
        // a API filtra por instante: o dia final entra inteiro
        windowStart: dayStartIso(start),
        windowEnd: dayEndIso(end),
      },
      {
        onSuccess: () =>
          toast.success("Lote enfileirado. O cron drena em blocos — acompanhe abaixo."),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Não foi possível enfileirar o lote."),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Carga histórica</CardTitle>
        <CardDescription>
          Importa vendas e cronograma de recebíveis de uma janela passada. É o que popula o
          dashboard e os recebíveis já contratados. Idempotente: repetir não duplica.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!isProduction ? (
          <p className="text-sm text-text-muted">
            Carga histórica só em produção — venda de sandbox não entra no financeiro.
          </p>
        ) : canEdit ? (
          <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="backfill-start">Vendas desde</Label>
              <Input
                id="backfill-start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="backfill-end">Até</Label>
              <Input
                id="backfill-end"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={startBackfill.isPending}>
                {startBackfill.isPending ? "Enfileirando…" : "Iniciar carga"}
              </Button>
            </div>
          </form>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            Lotes desta conexão
          </h3>
          {runs.isLoading ? (
            <p className="text-sm text-text-muted">Carregando…</p>
          ) : mine.length === 0 ? (
            <p className="text-sm text-text-muted">Nenhuma carga executada até agora.</p>
          ) : (
            <ul className="divide-y divide-border">
              {mine.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  canEdit={canEdit}
                  resuming={resume.isPending}
                  onResume={() =>
                    resume.mutate(run.id, {
                      onSuccess: () => toast.success("Lote retomado de onde parou."),
                      onError: (err) =>
                        toast.error(
                          err instanceof Error ? err.message : "Não foi possível retomar.",
                        ),
                    })
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RunRow({
  run,
  canEdit,
  resuming,
  onResume,
}: {
  run: SyncRun;
  canEdit: boolean;
  resuming: boolean;
  onResume: () => void;
}) {
  const minutesSinceUpdate = (Date.now() - new Date(run.updatedAt).getTime()) / 60_000;
  // parado há muito tempo sem ter escrito nada: o sintoma de cron desligado
  const stale =
    run.status === "running" && run.itemsSeen === 0 && minutesSinceUpdate > STALE_MINUTES;

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm">
          {run.status === "running" ? (
            <Badge tone="info">
              <Loader2 className="size-3 animate-spin" /> em andamento
            </Badge>
          ) : run.status === "completed" ? (
            <Badge tone="income">concluído</Badge>
          ) : (
            <Badge tone="expense">{STATUS_LABELS[run.status] ?? run.status}</Badge>
          )}
          <span className="text-text-muted">
            {formatDate(run.windowStart)} → {formatDate(run.windowEnd)}
          </span>
        </div>
        <div className="text-2xs text-text-subtle">
          página {run.pageCursor} · atualizado {formatDate(run.updatedAt, "dd/MM HH:mm")}
        </div>
        {run.lastError ? (
          <div className="text-2xs text-expense">
            {run.lastError} ({run.attempts} tentativas)
          </div>
        ) : null}
        {stale ? (
          <div className="text-2xs mt-1 flex items-start gap-1.5 text-warning">
            <CircleAlert className="mt-0.5 size-3 shrink-0" />
            Sem progresso há {Math.round(minutesSinceUpdate)} min. O cron precisa dos segredos
            <code className="mx-1">pagarme_sync_url</code> e
            <code className="mx-1">pagarme_sync_secret</code> no Vault para chamar a função.
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right text-sm">
          <div className="font-mono">{formatNumber(run.itemsWritten)}</div>
          <div className="text-2xs text-text-subtle">de {formatNumber(run.itemsSeen)} vistas</div>
        </div>
        {canEdit && run.status === "failed" ? (
          <Button size="sm" variant="outline" disabled={resuming} onClick={onResume}>
            <RotateCcw className="size-3.5" /> Retomar
          </Button>
        ) : null}
      </div>
    </li>
  );
}
