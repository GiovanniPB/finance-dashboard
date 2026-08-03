/**
 * Editor de opções de um bloco.
 *
 * Mostra só as opções que o bloco declara honrar no catálogo — o objeto de opções
 * é compartilhado por todos os tipos, então sem esse filtro apareceriam controles
 * que o bloco ignora.
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getBlockDefinition } from "@/features/report-builder/blocks/catalog";
import {
  COUNTERPARTY_KINDS,
  type BlockOptions,
  type ReportBlock,
} from "@/features/report-builder/schema";

const KIND_LABELS: Record<(typeof COUNTERPARTY_KINDS)[number], string> = {
  all: "Todas",
  customer: "Clientes",
  supplier: "Fornecedores",
  employee: "Funcionários",
  partner: "Sócios",
  government: "Governo",
  other: "Outras",
};

interface Props {
  block: ReportBlock;
  onChange: (patch: Partial<BlockOptions>) => void;
}

export function BlockOptionsEditor({ block, onChange }: Props) {
  const honored = getBlockDefinition(block.type).options ?? [];
  if (honored.length === 0) {
    return <p className="text-2xs text-text-subtle">Este bloco não tem opções.</p>;
  }

  const id = (suffix: string) => `${block.instanceId}-${suffix}`;

  return (
    <div className="space-y-3">
      {honored.includes("heading") && (
        <Field label="Título" htmlFor={id("heading")}>
          <Input
            id={id("heading")}
            value={block.options.heading ?? ""}
            placeholder={getBlockDefinition(block.type).label}
            onChange={(e) => onChange({ heading: e.target.value })}
          />
        </Field>
      )}

      {honored.includes("text") && (
        <Field label="Texto" htmlFor={id("text")}>
          <Textarea
            id={id("text")}
            rows={4}
            value={block.options.text ?? ""}
            placeholder="Comentários que entram no relatório…"
            onChange={(e) => onChange({ text: e.target.value })}
          />
        </Field>
      )}

      {honored.includes("topN") && (
        <Field label="Quantidade de linhas" htmlFor={id("topN")}>
          <Input
            id={id("topN")}
            type="number"
            min={1}
            max={50}
            value={block.options.topN ?? 10}
            onChange={(e) => onChange({ topN: clamp(Number(e.target.value), 1, 50) })}
          />
        </Field>
      )}

      {honored.includes("granularity") && (
        <Field label="Granularidade" htmlFor={id("granularity")}>
          <Select
            value={block.options.granularity ?? "monthly"}
            onValueChange={(v) => onChange({ granularity: v as "daily" | "monthly" })}
          >
            <SelectTrigger id={id("granularity")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Mensal</SelectItem>
              <SelectItem value="daily">Diária</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}

      {honored.includes("counterpartyKind") && (
        <Field label="Natureza" htmlFor={id("kind")}>
          <Select
            value={block.options.counterpartyKind ?? "all"}
            onValueChange={(v) =>
              onChange({ counterpartyKind: v as BlockOptions["counterpartyKind"] })
            }
          >
            <SelectTrigger id={id("kind")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTERPARTY_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <div className="flex flex-wrap gap-4">
        {honored.includes("includeCashColumn") && (
          <ToggleField
            id={id("cash")}
            label="Incluir coluna de caixa"
            checked={block.options.includeCashColumn ?? true}
            onChange={(checked) => onChange({ includeCashColumn: checked })}
          />
        )}
        {honored.includes("showTable") && (
          <ToggleField
            id={id("table")}
            label="Tabela de apoio"
            checked={block.options.showTable ?? false}
            onChange={(checked) => onChange({ showTable: checked })}
          />
        )}
        {honored.includes("showChart") && (
          <ToggleField
            id={id("chart")}
            label="Gráfico de apoio"
            checked={block.options.showChart ?? true}
            onChange={(checked) => onChange({ showChart: checked })}
          />
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function ToggleField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor={id} className="cursor-pointer text-xs font-normal">
        {label}
      </Label>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
