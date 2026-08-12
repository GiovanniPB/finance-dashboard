import * as React from "react";
import { Play, Power } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useBankAccounts } from "@/features/bank-accounts/hooks";
import type { PagarmeAccount } from "@/features/nfse/api";
import { useRecipients } from "@/features/nfse/hooks";
import type { ProjectionResultRow } from "@/features/sales/api";
import { useProjectLedger, useSetProjectionEnabled, useSetupGateway } from "@/features/sales/hooks";
import { formatDate, isoDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { ConnectionGateway } from "../api";
import { useConnectionGateways } from "../hooks";

interface Props {
  connection: PagarmeAccount;
  canEdit: boolean;
}

const KIND_LABELS: Record<string, string> = {
  revenue: "Receita",
  fee: "Taxas (MDR)",
  anticipation: "Antecipação",
  refund: "Estornos",
};

/**
 * Write-back financeiro desta conexão: uma carteira por empresa que recebe nela.
 *
 * Orientado pela CONEXÃO (e não pela empresa) porque é assim que a configuração se
 * apresenta na vida real: numa mesma conta pagar.me o split paga várias empresas, e
 * cada uma precisa da própria carteira, do próprio plano de contas e do próprio
 * corte. As empresas listadas são a dona da conexão mais as mapeadas no split.
 *
 * A projeção nasce desligada de propósito: ela escreve receita na DRE e título em
 * "A Receber", então a ordem é configurar, conferir e só então ligar.
 */
export function ProjectionSettingsCard({ connection, canEdit }: Props) {
  const gateways = useConnectionGateways(connection.id);
  const { data: recipients = [] } = useRecipients(connection.id);

  // dona + recebedoras do split, sem repetir
  const companies = React.useMemo(() => {
    const map = new Map<string, string>();
    const ownerName =
      connection.owner?.trade_name ?? connection.owner?.legal_name ?? "Empresa dona";
    map.set(connection.owner_company_id, ownerName);
    for (const r of recipients) {
      if (!r.active || !r.company_id) continue;
      map.set(r.company_id, r.company?.trade_name ?? r.company?.legal_name ?? "—");
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [connection, recipients]);

  const isProduction = connection.ambiente === "producao";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendas no financeiro</CardTitle>
        <CardDescription>
          A carteira do gateway é a conta onde o dinheiro fica antes do saque. A projeção lê os
          recebíveis desta conexão e lança receita bruta, taxas e estornos nela — nada antes da data
          de corte, para não duplicar o que já foi lançado à mão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isProduction ? (
          <p className="text-sm text-text-muted">
            Conexão de homologação não alimenta o financeiro — venda de teste não vira recebível.
            Nada a configurar aqui.
          </p>
        ) : gateways.isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          companies.map((company) => {
            const settings = (gateways.data ?? []).find((g) => g.companyId === company.id) ?? null;
            return (
              <CompanyRow
                // a `key` inclui a configuração: quando ela passa a existir, o
                // formulário remonta e reinicializa com o que está salvo em vez de
                // manter os defaults do primeiro render
                key={`${company.id}:${settings?.settingsId ?? "new"}`}
                accountId={connection.id}
                company={company}
                settings={settings}
                canEdit={canEdit}
              />
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function CompanyRow({
  accountId,
  company,
  settings,
  canEdit,
}: {
  accountId: string;
  company: { id: string; name: string };
  settings: ConnectionGateway | null;
  canEdit: boolean;
}) {
  const { data: bankAccounts = [] } = useBankAccounts(company.id);
  const setup = useSetupGateway();
  const toggle = useSetProjectionEnabled();
  const project = useProjectLedger();

  const [gatewayId, setGatewayId] = React.useState(settings?.gatewayBankAccountId ?? "");
  const [payoutId, setPayoutId] = React.useState(settings?.payoutBankAccountId ?? "");
  const [cutover, setCutover] = React.useState(settings?.cutoverDate ?? "2026-09-01");
  const [from, setFrom] = React.useState(settings?.cutoverDate ?? "2026-09-01");
  const [to, setTo] = React.useState(() => isoDate(new Date(new Date().getFullYear() + 3, 11, 31)));
  const [result, setResult] = React.useState<ProjectionResultRow[] | null>(null);

  function save(e: React.SyntheticEvent) {
    e.preventDefault();
    setup.mutate(
      {
        accountId,
        companyId: company.id,
        gatewayBankAccountId: gatewayId || null,
        payoutBankAccountId: payoutId || null,
        cutoverDate: cutover,
      },
      {
        onSuccess: () =>
          toast.success("Carteira configurada. A projeção continua desligada até você ligar."),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Não foi possível salvar."),
      },
    );
  }

  function runProjection() {
    setResult(null);
    project.mutate(
      { companyId: company.id, from, to, accountId },
      {
        onSuccess: (rows) => {
          setResult(rows);
          toast[rows.length === 0 ? "info" : "success"](
            rows.length === 0
              ? "Nenhum recebível na janela — nada a lançar."
              : "Projeção recalculada.",
          );
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "A projeção falhou."),
      },
    );
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-md)] border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{company.name}</div>
        {settings ? (
          settings.enabled ? (
            <Badge tone="income">projeção ligada</Badge>
          ) : (
            <Badge tone="warning">projeção desligada</Badge>
          )
        ) : (
          <Badge>não configurada</Badge>
        )}
      </div>

      {canEdit ? (
        <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`gw-${company.id}`}>Carteira do gateway</Label>
            <Select value={gatewayId} onValueChange={setGatewayId}>
              <SelectTrigger id={`gw-${company.id}`}>
                <SelectValue placeholder="Criar nova" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.nickname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-2xs text-text-subtle">
              Aponte para a conta “Pagar-me” que já existe: histórico e saldo continuam valendo.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`po-${company.id}`}>Conta de saque</Label>
            <Select value={payoutId} onValueChange={setPayoutId}>
              <SelectTrigger id={`po-${company.id}`}>
                <SelectValue placeholder="Escolha a conta" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.nickname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`co-${company.id}`}>Data de corte</Label>
            <Input
              id={`co-${company.id}`}
              type="date"
              value={cutover}
              onChange={(e) => setCutover(e.target.value)}
            />
            <p className="text-2xs text-text-subtle">
              Liquidação anterior a esta data não é lançada.
            </p>
          </div>
          <div className="flex items-start">
            <Button type="submit" variant="secondary" disabled={setup.isPending}>
              {setup.isPending ? "Salvando…" : settings ? "Atualizar" : "Configurar"}
            </Button>
          </div>
        </form>
      ) : null}

      {settings && canEdit ? (
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <Button
            variant={settings.enabled ? "outline" : "primary"}
            disabled={toggle.isPending}
            onClick={() =>
              toggle.mutate(
                { settingsId: settings.settingsId, enabled: !settings.enabled },
                {
                  onSuccess: () =>
                    toast.success(settings.enabled ? "Projeção desligada." : "Projeção ligada."),
                },
              )
            }
          >
            <Power className="size-4" />
            {settings.enabled ? "Desligar projeção" : "Ligar projeção"}
          </Button>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`pf-${company.id}`}>Projetar de</Label>
            <Input
              id={`pf-${company.id}`}
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`pt-${company.id}`}>até</Label>
            <Input
              id={`pt-${company.id}`}
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          <Button
            variant="secondary"
            disabled={project.isPending || !settings.enabled}
            onClick={runProjection}
          >
            <Play className="size-4" />
            {project.isPending ? "Projetando…" : "Rodar projeção"}
          </Button>
        </div>
      ) : null}

      {settings?.gatewayNickname ? (
        <p className="text-2xs text-text-subtle">
          Carteira: {settings.gatewayNickname}
          {settings.payoutNickname ? ` · saque para ${settings.payoutNickname}` : ""} · corte em{" "}
          {formatDate(settings.cutoverDate)}
        </p>
      ) : null}

      {settings && !settings.enabled ? (
        <p className="text-2xs text-text-muted">
          Desligada: os recebíveis aparecem no dashboard de vendas mas não geram lançamento, título
          em “A Receber” nem linha na DRE.
        </p>
      ) : null}

      {result && result.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 sm:grid-cols-4">
          {result.map((r) => (
            <div key={r.kind}>
              <dt className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                {KIND_LABELS[r.kind] ?? r.kind}
              </dt>
              <dd className="font-mono text-sm">{formatBRL(r.amount)}</dd>
              <dd className="text-2xs text-text-subtle">
                {r.entries} {r.entries === 1 ? "lançamento" : "lançamentos"}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
