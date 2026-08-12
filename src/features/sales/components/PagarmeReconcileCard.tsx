import * as React from "react";
import { ArrowRightLeft, CheckCircle2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { isoDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import { useGatewayAccounts, useReconcileMonth, useReconcilePayout } from "../hooks";

interface Props {
  companyId: string;
  /** Contas bancárias reais da empresa, para escolher o destino do saque. */
  bankAccounts: { id: string; nickname: string }[];
  canEdit: boolean;
}

/** Métricas que precisam ser ZERO para o mês estar conciliado. */
const DIVERGENCE_METRICS = new Set(["divergencia_receita", "divergencia_taxas"]);

const METRIC_LABELS: Record<string, string> = {
  liquidado_bruto: "Liquidado (bruto)",
  liquidado_taxas: "Taxas",
  liquidado_liquido: "Líquido na carteira",
  projetado_receita: "Receita lançada",
  projetado_taxas: "Taxas lançadas",
  saques: "Saques conciliados",
  divergencia_receita: "Divergência de receita",
  divergencia_taxas: "Divergência de taxas",
};

/**
 * Conciliação do pagar.me: fecha o mês e transforma a TED em transferência.
 *
 * Este card é o que encerra o processo manual. Antes, a TED do pagar.me era
 * lançada como receita — o que criava o pico de caixa e contava a receita duas
 * vezes (uma na venda, outra no saque). Aqui ela vira as duas pernas de uma
 * transferência gateway → banco, que fica fora da DRE e do fluxo.
 *
 * O saque NÃO vem da API de propósito: `GET /transfers` do pagar.me é bloqueado
 * por allowlist de IP, mas a TED já está no extrato bancário — que é uma fonte
 * que nós controlamos.
 */
export function PagarmeReconcileCard({ companyId, bankAccounts, canEdit }: Props) {
  const [month, setMonth] = React.useState(() => isoDate(new Date()).slice(0, 7));
  const monthDate = `${month}-01`;

  const gateways = useGatewayAccounts(companyId);
  const reconcile = useReconcileMonth(companyId, monthDate);
  const payout = useReconcilePayout();

  const [amount, setAmount] = React.useState(0);
  const [fundedOn, setFundedOn] = React.useState(() => isoDate(new Date()));
  const [externalRef, setExternalRef] = React.useState("");
  const [bankAccountId, setBankAccountId] = React.useState("");

  const gateway = gateways.data?.[0];
  const rows = reconcile.data ?? [];
  const divergences = rows.filter(
    (r) => DIVERGENCE_METRICS.has(r.metric) && Math.abs(r.value) > 0.01,
  );
  const reconciled = rows.length > 0 && divergences.length === 0;

  // Sem carteira de gateway a conciliação não tem sobre o que operar; mostramos o
  // caminho em vez de um card vazio.
  if (!gateways.isLoading && !gateway) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Conciliação pagar.me</CardTitle>
          <CardDescription>
            Esta empresa ainda não tem carteira de gateway configurada, então não há saque a
            conciliar. Configure em Vendas para que as liquidações passem a ser lançadas
            automaticamente.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  function submitPayout(e: React.SyntheticEvent) {
    e.preventDefault();
    if (amount <= 0) {
      toast.error("Informe o valor da TED.");
      return;
    }
    if (externalRef.trim().length === 0) {
      toast.error("Informe uma referência para o saque (evita lançar a mesma TED duas vezes).");
      return;
    }
    payout.mutate(
      {
        companyId,
        amount,
        fundedOn,
        externalRef: externalRef.trim(),
        bankAccountId: bankAccountId || null,
        notes: null,
      },
      {
        onSuccess: () => {
          toast.success("Saque conciliado como transferência gateway → banco.");
          setAmount(0);
          setExternalRef("");
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Não foi possível conciliar o saque.");
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="size-4 text-accent" />
              Conciliação pagar.me
            </CardTitle>
            <CardDescription>
              {gateway?.gatewayNickname
                ? `Carteira ${gateway.gatewayNickname} · corte em ${gateway.cutoverDate}`
                : "Fecha o mês e registra o saque como transferência."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {gateway && !gateway.enabled ? <Badge tone="warning">projeção desligada</Badge> : null}
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-40"
              aria-label="Mês da conciliação"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {reconcile.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-text-muted">Nada liquidado neste mês.</p>
        ) : (
          <>
            <div
              className={
                reconciled
                  ? "flex items-start gap-2 rounded-[var(--radius-md)] border border-income/40 bg-income-soft p-3 text-xs"
                  : "flex items-start gap-2 rounded-[var(--radius-md)] border border-expense/40 bg-expense-soft p-3 text-xs"
              }
            >
              {reconciled ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-income" />
              ) : (
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-expense" />
              )}
              <span>
                {reconciled ? (
                  <>
                    Mês conciliado: tudo que liquidou está lançado, sem divergência de receita nem
                    de taxas.
                  </>
                ) : (
                  <>
                    {divergences.map((d) => (
                      <span key={d.metric} className="block">
                        {METRIC_LABELS[d.metric] ?? d.metric}:{" "}
                        <strong className="font-mono">{formatBRL(d.value)}</strong> — deveria ser
                        zero. Rode a projeção do período antes de fechar o mês.
                      </span>
                    ))}
                  </>
                )}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {rows
                .filter((r) => !DIVERGENCE_METRICS.has(r.metric))
                .map((r) => (
                  <div key={r.metric}>
                    <dt className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                      {METRIC_LABELS[r.metric] ?? r.metric}
                    </dt>
                    <dd className="font-mono text-sm">{formatBRL(r.value)}</dd>
                  </div>
                ))}
            </dl>
          </>
        )}

        {canEdit ? (
          <form onSubmit={submitPayout} className="space-y-3 border-t border-border pt-4">
            <div>
              <h3 className="text-sm font-medium">Registrar saque (TED do pagar.me)</h3>
              <p className="text-xs text-text-muted">
                Vira transferência da carteira do gateway para a conta bancária — fora da DRE e do
                fluxo, porque o dinheiro só trocou de bolso.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="payout-amount">Valor</Label>
                <CurrencyInput id="payout-amount" value={amount} onValueChange={setAmount} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="payout-date">Data do crédito</Label>
                <Input
                  id="payout-date"
                  type="date"
                  value={fundedOn}
                  onChange={(e) => setFundedOn(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="payout-ref">Referência</Label>
                <Input
                  id="payout-ref"
                  placeholder="ex.: extrato 10/08 TED"
                  value={externalRef}
                  onChange={(e) => setExternalRef(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="payout-bank">Conta de destino</Label>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger id="payout-bank">
                    <SelectValue placeholder={gateway?.payoutNickname ?? "Escolha a conta"} />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nickname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" disabled={payout.isPending}>
              {payout.isPending ? "Conciliando…" : "Conciliar saque"}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
