import * as React from "react";
import { Play, Power, Wallet } from "lucide-react";
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
import { formatDate, isoDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { GatewayAccount, PagarmeAccountOption, ProjectionResultRow } from "../api";
import {
  useGatewayAccounts,
  useProjectLedger,
  useSetProjectionEnabled,
  useSetupGateway,
} from "../hooks";

interface Props {
  companyId: string;
  accounts: PagarmeAccountOption[];
  bankAccounts: { id: string; nickname: string; accountType: string }[];
  canEdit: boolean;
}

const KIND_LABELS: Record<string, string> = {
  revenue: "Receita",
  fee: "Taxas (MDR)",
  anticipation: "Antecipação",
  refund: "Estornos",
};

/**
 * Carteira do gateway e projeção — o que transforma recebível em lançamento.
 *
 * Uma linha por (empresa × conexão pagar.me), porque no grupo a mesma empresa
 * pode receber por mais de uma conexão: a RCO é recebedora na conta dela E dentro
 * da conta da Jimmy, com carteira própria em cada uma.
 *
 * A projeção nasce DESLIGADA de propósito: ela escreve na DRE e no "A Receber", e
 * o desenho é conferir a configuração antes de deixá-la lançar. Desligar depois
 * não apaga nada — só para de recalcular.
 */
export function ProjectionSetupCard({ companyId, accounts, bankAccounts, canEdit }: Props) {
  const production = accounts.filter((a) => a.ambiente === "producao");
  const gateways = useGatewayAccounts(companyId);
  const configured = gateways.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4 text-accent" />
          Carteira do gateway e projeção
        </CardTitle>
        <CardDescription>
          A carteira é a conta onde o dinheiro de fato está antes do saque. A projeção lê os
          recebíveis e lança receita bruta, taxas e estornos nela — nada antes da data de corte,
          para não duplicar o histórico lançado à mão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {gateways.isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          production.map((account) => {
            const settings = configured.find((g) => g.pagarmeAccountId === account.id) ?? null;
            return (
              <ConnectionRow
                // a `key` inclui a configuração: quando ela passa a existir (ou
                // troca), o formulário remonta e reinicializa com o que está
                // salvo, em vez de manter os defaults do primeiro render
                key={`${account.id}:${settings?.settingsId ?? "new"}`}
                companyId={companyId}
                account={account}
                settings={settings}
                bankAccounts={bankAccounts}
                canEdit={canEdit}
              />
            );
          })
        )}
        {production.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhuma conexão de produção cadastrada.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ConnectionRow({
  companyId,
  account,
  settings,
  bankAccounts,
  canEdit,
}: {
  companyId: string;
  account: PagarmeAccountOption;
  settings: GatewayAccount | null;
  bankAccounts: { id: string; nickname: string; accountType: string }[];
  canEdit: boolean;
}) {
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
        accountId: account.id,
        companyId,
        gatewayBankAccountId: gatewayId || null,
        payoutBankAccountId: payoutId || null,
        cutoverDate: cutover,
      },
      {
        onSuccess: () => {
          toast.success(
            gatewayId
              ? "Carteira vinculada. A projeção continua desligada até você ligar."
              : "Carteira criada. A projeção continua desligada até você ligar.",
          );
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
        },
      },
    );
  }

  function runProjection() {
    setResult(null);
    project.mutate(
      { companyId, from, to, accountId: account.id },
      {
        onSuccess: (rows) => {
          setResult(rows);
          if (rows.length === 0) {
            toast.info("Nenhum recebível na janela — nada a lançar.");
          } else {
            toast.success("Projeção recalculada.");
          }
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "A projeção falhou.");
        },
      },
    );
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-md)] border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{account.label}</div>
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
            <Label htmlFor={`gw-${account.id}`}>Carteira do gateway</Label>
            <Select value={gatewayId} onValueChange={setGatewayId}>
              <SelectTrigger id={`gw-${account.id}`}>
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
              Aponte para a conta “Pagar-me” que você já usa: o histórico e o saldo dela continuam
              valendo.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`po-${account.id}`}>Conta de saque</Label>
            <Select value={payoutId} onValueChange={setPayoutId}>
              <SelectTrigger id={`po-${account.id}`}>
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
            <Label htmlFor={`co-${account.id}`}>Data de corte</Label>
            <Input
              id={`co-${account.id}`}
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
                  onSuccess: () => {
                    toast.success(settings.enabled ? "Projeção desligada." : "Projeção ligada.");
                  },
                },
              )
            }
          >
            <Power className="size-4" />
            {settings.enabled ? "Desligar projeção" : "Ligar projeção"}
          </Button>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`pf-${account.id}`}>Projetar de</Label>
            <Input
              id={`pf-${account.id}`}
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`pt-${account.id}`}>até</Label>
            <Input
              id={`pt-${account.id}`}
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

      {settings && !settings.enabled ? (
        <p className="text-2xs text-text-muted">
          Enquanto estiver desligada, os recebíveis aparecem no dashboard de vendas mas não geram
          lançamento, título em “A Receber” nem linha na DRE.
        </p>
      ) : null}

      {settings?.gatewayNickname ? (
        <p className="text-2xs text-text-subtle">
          Carteira: {settings.gatewayNickname}
          {settings.payoutNickname ? ` · saque para ${settings.payoutNickname}` : ""} · corte em{" "}
          {formatDate(settings.cutoverDate)}
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
