import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/features/auth/AuthProvider";

import type { BackfillRun } from "../api";
import { toIso } from "../backfill-format";
import { useBackfillRuns, useConnections, useCreateBackfillRun } from "../hooks";
import { BackfillJobsTable } from "./BackfillJobsTable";
import { BackfillRunDrawer } from "./BackfillRunDrawer";
import { BackfillRunsList } from "./BackfillRunsList";

export function BackfillPanel() {
  const { user } = useAuth();
  const { data: connections = [] } = useConnections();
  const { data: runs = [] } = useBackfillRuns();
  const createRun = useCreateBackfillRun();

  const [accountId, setAccountId] = React.useState<string>("");
  const [since, setSince] = React.useState<string>("");
  const [until, setUntil] = React.useState<string>("");
  const [runDetail, setRunDetail] = React.useState<BackfillRun | null>(null);

  const hasRunning = runs.some((r) => r.status === "running");
  // mantém o drawer vivo enquanto a carga progride (o polling atualiza `runs`)
  const liveRunDetail = runDetail ? (runs.find((r) => r.id === runDetail.id) ?? runDetail) : null;
  const canLoad = Boolean(accountId && since && until && until >= since) && !createRun.isPending;

  async function load() {
    const conn = connections.find((c) => c.id === accountId);
    if (!conn) return;
    try {
      await createRun.mutateAsync({
        accountId,
        organizationId: conn.organization_id,
        createdSince: toIso(since, false),
        createdUntil: toIso(until, true),
        dryRun: false,
        createdBy: user?.id ?? "",
      });
      toast.success("Carga iniciada — as notas aparecem na lista conforme são carregadas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar a carga.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Carregar período */}
      <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Carregar período</h2>
        <p className="mt-1 text-xs text-text-muted">
          Carrega as cobranças pagas da janela como notas <strong>pendentes</strong> (dedup
          automática — o que já existe, inclusive via webhook, é ignorado). Nada é emitido até você
          selecionar e emitir.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
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
          <div>
            <Label htmlFor="bf-since">De</Label>
            <Input
              id="bf-since"
              type="date"
              className="mt-1"
              value={since}
              max={until || undefined}
              onChange={(e) => setSince(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="bf-until">Até</Label>
            <Input
              id="bf-until"
              type="date"
              className="mt-1"
              value={until}
              min={since || undefined}
              onChange={(e) => setUntil(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4">
          <Button type="button" disabled={!canLoad} onClick={() => void load()}>
            Carregar
          </Button>
        </div>
      </div>

      <BackfillRunsList runs={runs} onOpenDetail={setRunDetail} />

      <BackfillJobsTable polling={hasRunning} />

      <BackfillRunDrawer
        open={Boolean(runDetail)}
        onOpenChange={(o) => !o && setRunDetail(null)}
        run={liveRunDetail}
      />
    </div>
  );
}
