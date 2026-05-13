import * as React from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileUp,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import {
  useCommitImportBatch,
  useCreateImportBatch,
  useUploadImportFile,
  useUploadImportRows,
} from "@/features/imports/hooks";
import { parseCsvFile, parseRow, suggestMapping } from "@/features/imports/parser";
import {
  IMPORTABLE_FIELDS,
  type ColumnMapping,
  type ImportableFieldKey,
  type ParsedImportRow,
  type RawCsvRow,
} from "@/features/imports/types";
import { useImportLookups } from "@/features/imports/useImportLookups";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";

type Step = "upload" | "mapping" | "preview" | "done";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "mapping", label: "Mapeamento" },
  { key: "preview", label: "Preview" },
  { key: "done", label: "Concluído" },
];

export default function ImportPage() {
  const { companies, selectedCompanyId, isConsolidated } = useCompanyScope();
  const operational = companies.filter((c) => !c.is_holding);

  const [companyId, setCompanyId] = React.useState<string | null>(
    isConsolidated ? (operational[0]?.id ?? null) : selectedCompanyId,
  );
  React.useEffect(() => {
    if (!isConsolidated) setCompanyId(selectedCompanyId);
  }, [isConsolidated, selectedCompanyId]);

  const [step, setStep] = React.useState<Step>("upload");
  const [file, setFile] = React.useState<File | null>(null);
  const [csvColumns, setCsvColumns] = React.useState<string[]>([]);
  const [csvRows, setCsvRows] = React.useState<RawCsvRow[]>([]);
  const [mapping, setMapping] = React.useState<ColumnMapping>({});
  const [parsed, setParsed] = React.useState<ParsedImportRow[]>([]);
  const [result, setResult] = React.useState<{ committed: number; failed: number } | null>(null);

  const { lookups, isLoading: lookupsLoading } = useImportLookups(companyId);
  const createBatch = useCreateImportBatch();
  const uploadFile = useUploadImportFile();
  const uploadRows = useUploadImportRows();
  const commit = useCommitImportBatch();

  const submitting =
    createBatch.isPending || uploadFile.isPending || uploadRows.isPending || commit.isPending;

  async function handleFileSelect(f: File) {
    setFile(f);
    try {
      const result = await parseCsvFile(f);
      setCsvColumns(result.columns);
      setCsvRows(result.rows);
      setMapping(suggestMapping(result.columns));
      setStep("mapping");
    } catch (err) {
      toast.error("Erro ao ler arquivo", { description: (err as Error).message });
    }
  }

  const requiredFields = IMPORTABLE_FIELDS.filter((f) => f.required).map((f) => f.key);
  const missingRequired = requiredFields.filter((k) => !mapping[k]);
  const canProceedToPreview = missingRequired.length === 0;

  function handlePreview() {
    const parsedRows = csvRows.map((row, i) => parseRow(i + 1, row, mapping, lookups));
    setParsed(parsedRows);
    setStep("preview");
  }

  async function handleCommit() {
    if (!companyId) return;
    if (!file) return;
    try {
      const batch = await createBatch.mutateAsync({
        companyId,
        filename: file.name,
        rowCount: parsed.length,
      });
      await uploadFile.mutateAsync({ batchId: batch.id, file });
      await uploadRows.mutateAsync({ batchId: batch.id, rows: parsed });
      const r = await commit.mutateAsync(batch.id);
      setResult(r);
      setStep("done");
      toast.success(`${r.committed} lançamento(s) importado(s)`);
    } catch (err) {
      toast.error("Erro no import", { description: (err as Error).message });
    }
  }

  function reset() {
    setStep("upload");
    setFile(null);
    setCsvColumns([]);
    setCsvRows([]);
    setMapping({});
    setParsed([]);
    setResult(null);
  }

  const validRows = parsed.filter((r) => r.isValid);
  const invalidRows = parsed.filter((r) => !r.isValid);

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-6 p-6 lg:p-8">
      <div>
        <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
          Importação
        </div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
          Importar lançamentos via CSV
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Suba um CSV, mapeie as colunas, valide e comprometa — em batches.
        </p>
      </div>

      <Stepper current={step} />

      {step === "upload" && (
        <div className="space-y-4">
          {isConsolidated && operational.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="company">Empresa de destino</Label>
              <Select
                id="company"
                value={companyId ?? ""}
                onChange={(e) => setCompanyId(e.target.value)}
                className="max-w-[300px]"
              >
                {operational.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.trade_name ?? c.legal_name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <UploadDropzone onFileSelect={handleFileSelect} disabled={!companyId} />

          <Card className="border-dashed">
            <CardContent className="space-y-3 p-5 text-sm">
              <p className="font-medium">Formato esperado</p>
              <ul className="space-y-1 text-xs text-text-muted">
                <li>• CSV com cabeçalho na primeira linha</li>
                <li>
                  • Datas: <code>DD/MM/YYYY</code> ou <code>YYYY-MM-DD</code>
                </li>
                <li>
                  • Valores: <code>1.234,56</code> ou <code>1234.56</code> (com ou sem R$)
                </li>
                <li>
                  • Tipo: <code>Entrada</code>/<code>Saída</code> ou <code>+</code>/<code>-</code>
                </li>
                <li>
                  • Conta: usar o código (ex: <code>1.01</code>, <code>6.2.06</code>)
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {step === "mapping" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{file?.name}</p>
              <p className="text-xs text-text-subtle">
                {csvColumns.length} coluna(s) detectada(s), {csvRows.length} linha(s)
              </p>
            </div>
            {lookupsLoading && (
              <Badge tone="info" className="flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" /> Carregando cadastros
              </Badge>
            )}
          </div>

          <MappingPanel
            columns={csvColumns}
            mapping={mapping}
            onChange={setMapping}
            missingRequired={missingRequired}
          />

          <div className="flex justify-between">
            <Button variant="ghost" onClick={reset}>
              <ArrowLeft className="size-4" /> Voltar
            </Button>
            <Button onClick={handlePreview} disabled={!canProceedToPreview || lookupsLoading}>
              Preview <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <SummaryCard label="Total" value={parsed.length} tone="info" />
            <SummaryCard label="Válidas" value={validRows.length} tone="income" />
            <SummaryCard label="Com erros" value={invalidRows.length} tone="expense" />
          </div>

          <PreviewTable rows={parsed} />

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep("mapping")} disabled={submitting}>
              <ArrowLeft className="size-4" /> Ajustar mapeamento
            </Button>
            <Button onClick={handleCommit} disabled={validRows.length === 0 || submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Importar {validRows.length} lançamento(s)
            </Button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <Card className="border-income/30 bg-income-soft/30">
          <CardContent className="space-y-4 p-8 text-center">
            <CheckCircle2 className="mx-auto size-12 text-income" />
            <div>
              <h2 className="font-display text-xl font-semibold">Import concluído</h2>
              <p className="mt-1 text-sm text-text-muted">
                {result.committed} lançamento(s) inserido(s).{" "}
                {result.failed > 0 && `${result.failed} linha(s) com erro não foram importadas.`}
              </p>
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={reset}>
                Novo import
              </Button>
              <Button asChild>
                <Link to="/transactions">Ver lançamentos</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEPS.map((s, i) => {
        const isDone = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <li key={s.key} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "text-2xs grid size-6 place-items-center rounded-full font-semibold",
                isDone && "bg-income text-white",
                isCurrent && "bg-accent text-accent-foreground",
                !isDone && !isCurrent && "bg-surface-2 text-text-subtle",
              )}
            >
              {isDone ? "✓" : i + 1}
            </span>
            <span
              className={cn(
                "flex-1 truncate",
                isCurrent ? "font-medium text-text" : "text-text-subtle",
              )}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className={cn("h-px flex-1 bg-border", isDone && "bg-income")} aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function UploadDropzone({
  onFileSelect,
  disabled,
}: {
  onFileSelect: (f: File) => void;
  disabled: boolean;
}) {
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFileSelect(f);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed border-border bg-surface p-12 transition-colors",
        dragOver && "border-accent bg-accent-soft",
        disabled && "opacity-50",
      )}
    >
      <div className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
        <UploadCloud className="size-6" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">
          {disabled
            ? "Selecione uma empresa primeiro"
            : "Arraste o CSV aqui ou clique para escolher"}
        </p>
        <p className="text-2xs text-text-subtle">Máximo 10 MB · CSV com cabeçalho</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileSelect(f);
          e.target.value = "";
        }}
      />
      <Button variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}>
        <FileUp className="size-4" /> Escolher arquivo
      </Button>
    </div>
  );
}

function MappingPanel({
  columns,
  mapping,
  onChange,
  missingRequired,
}: {
  columns: string[];
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
  missingRequired: ImportableFieldKey[];
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-2/60">
          <tr className="border-b border-border">
            <th className="text-2xs px-4 py-2.5 text-left font-medium tracking-wide text-text-subtle uppercase">
              Campo do sistema
            </th>
            <th className="text-2xs px-4 py-2.5 text-left font-medium tracking-wide text-text-subtle uppercase">
              Coluna do CSV
            </th>
          </tr>
        </thead>
        <tbody>
          {IMPORTABLE_FIELDS.map((field) => {
            const isMissing = missingRequired.includes(field.key);
            return (
              <tr key={field.key} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{field.label}</span>
                    {field.required && (
                      <Badge tone={isMissing ? "expense" : "default"}>obrigatório</Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <Select
                    value={mapping[field.key] ?? ""}
                    onChange={(e) =>
                      onChange({ ...mapping, [field.key]: e.target.value || undefined })
                    }
                    className="w-full max-w-[300px]"
                  >
                    <option value="">— não mapear —</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "info" | "income" | "expense";
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">{label}</div>
        <div
          className={cn(
            "font-mono text-2xl font-semibold tracking-tight",
            tone === "income" && "text-income",
            tone === "expense" && "text-expense",
            tone === "info" && "text-info",
          )}
        >
          {value.toLocaleString("pt-BR")}
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewTable({ rows }: { rows: ParsedImportRow[] }) {
  const previewRows = rows.slice(0, 100);

  if (rows.length === 0) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-2/60">
          <tr className="border-b border-border">
            <th className="text-2xs px-3 py-2 text-left font-medium tracking-wide text-text-subtle uppercase">
              Status
            </th>
            <th className="text-2xs px-3 py-2 text-left font-medium tracking-wide text-text-subtle uppercase">
              Linha
            </th>
            <th className="text-2xs px-3 py-2 text-left font-medium tracking-wide text-text-subtle uppercase">
              Competência
            </th>
            <th className="text-2xs px-3 py-2 text-left font-medium tracking-wide text-text-subtle uppercase">
              Descrição
            </th>
            <th className="text-2xs px-3 py-2 text-right font-medium tracking-wide text-text-subtle uppercase">
              Valor
            </th>
            <th className="text-2xs px-3 py-2 text-left font-medium tracking-wide text-text-subtle uppercase">
              Erros
            </th>
          </tr>
        </thead>
        <tbody>
          {previewRows.map((row) => (
            <tr
              key={row.rowNumber}
              className={cn(
                "border-b border-border last:border-0",
                !row.isValid && "bg-expense-soft/30",
              )}
            >
              <td className="px-3 py-2">
                {row.isValid ? (
                  <CheckCircle2 className="size-4 text-income" />
                ) : (
                  <AlertCircle className="size-4 text-expense" />
                )}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-text-subtle">{row.rowNumber}</td>
              <td className="px-3 py-2 text-xs">{row.parsed.accrual_date ?? "—"}</td>
              <td className="max-w-[260px] truncate px-3 py-2 text-xs">
                {row.parsed.description ?? row.raw[Object.keys(row.raw)[0] ?? ""] ?? "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {row.parsed.amount != null ? formatBRL(row.parsed.amount) : "—"}
              </td>
              <td className="text-2xs px-3 py-2 text-expense">{row.errors.join(" · ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > previewRows.length && (
        <div className="text-2xs border-t border-border bg-surface-2/40 px-3 py-2 text-text-subtle">
          Mostrando 100 de {rows.length} linhas — todas serão importadas no commit.
        </div>
      )}
    </div>
  );
}
