import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatBRL, formatPercent } from "@/lib/format";

import type { AssessmentResult } from "../apuracao";
import { PRESUMPTION_CLASS_META } from "../constants";

/**
 * O caminho da conta, de cima a baixo: receita bruta -> base -> tributo -> adicional
 * -> deduções -> saldo devedor.
 *
 * É a leitura que a planilha não dá. Lá o número final aparece numa célula e o
 * caminho fica implícito nas fórmulas — foi assim que "valor a recolher" pôde sair de
 * `retenção − outras deduções` por quinze meses sem ninguém notar.
 */

interface Props {
  result: AssessmentResult;
}

export function ApuracaoResumo({ result }: Props) {
  const temPresuncao = result.classes.length > 0;

  return (
    <div className="space-y-3">
      {result.warnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-warning bg-warning-soft p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="space-y-1">
            <strong className="text-warning">
              {result.warnings.length === 1 ? "Atenção" : `${result.warnings.length} avisos`}
            </strong>
            <ul className="list-disc space-y-0.5 pl-4 text-text-muted">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* O saldo devedor em destaque — é o número que se leva ao banco. */}
      <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
              Saldo devedor
            </div>
            <div className="mt-0.5 font-mono text-3xl font-semibold tracking-tight">
              {formatBRL(result.amount_due)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
              Vencimento
            </div>
            <div className="mt-0.5 font-mono text-lg">{formatDate(result.due_date)}</div>
          </div>
        </div>
        {result.credit_carryforward > 0 && (
          <p className="mt-2 text-xs text-text-muted">
            Sobrou crédito de{" "}
            <strong className="font-mono">{formatBRL(result.credit_carryforward)}</strong> — lance
            como saldo de período anterior na próxima apuração.
          </p>
        )}
      </div>

      {/* A cascata. Cada linha diz de onde veio a de baixo. */}
      <dl className="overflow-hidden rounded-[var(--radius-md)] border border-border">
        <Row label="Receita bruta do período" value={result.gross_revenue} />

        {temPresuncao &&
          result.classes.map((c) => (
            <Row
              key={c.presumption_class}
              label={PRESUMPTION_CLASS_META[c.presumption_class].label}
              hint={`${formatBRL(c.revenue)} × ${formatPercent(c.effective_rate)}`}
              value={c.base}
              indent
            />
          ))}

        <Row
          label={temPresuncao ? "Lucro presumido (base de cálculo)" : "Base de cálculo"}
          value={result.taxable_base}
          strong
        />
        <Row label="Tributo devido" hint={formatPercent(result.rate)} value={result.tax_amount} />
        {result.surtax_amount > 0 && (
          <Row
            label="Adicional"
            hint={`sobre ${formatBRL(result.surtax_base)}`}
            value={result.surtax_amount}
          />
        )}
        {result.additions > 0 && <Row label="(+) Acréscimos" value={result.additions} />}
        {result.retentions > 0 && <Row label="(-) Retenções na fonte" value={-result.retentions} />}
        {result.deductions > 0 && <Row label="(-) Outras deduções" value={-result.deductions} />}
        <Row label="(=) Saldo devedor" value={result.amount_due} strong last />
      </dl>
    </div>
  );
}

function Row({
  label,
  hint,
  value,
  strong,
  indent,
  last,
}: {
  label: string;
  hint?: string;
  value: number;
  strong?: boolean;
  indent?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 px-3 py-2",
        !last && "border-b border-border/60",
        strong && "bg-surface-2/60",
        indent && "pl-8",
      )}
    >
      <dt className="flex items-baseline gap-2 text-sm">
        <span className={cn(indent && "text-text-muted", strong && "font-medium")}>{label}</span>
        {hint && (
          <Badge tone="default" className="text-2xs font-mono">
            {hint}
          </Badge>
        )}
      </dt>
      <dd
        className={cn(
          "font-mono text-sm tabular-nums",
          strong && "font-semibold",
          value < 0 && "text-expense",
        )}
      >
        {formatBRL(value)}
      </dd>
    </div>
  );
}
