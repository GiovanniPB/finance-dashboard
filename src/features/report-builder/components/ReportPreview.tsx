/**
 * Pré-visualização — o PDF de verdade, num `<iframe>`.
 *
 * Não existe caminho de render paralelo em DOM: o que aparece aqui é exatamente o
 * arquivo que o botão de baixar entrega, então preview e saída não podem divergir.
 *
 * Regeneração é **debounced e só em mudança estrutural** (blocos, período,
 * comparativo, escopo). Digitar um título não dispara consulta ao banco; para isso
 * existe o botão de atualizar.
 */
import * as React from "react";
import { AlertTriangle, Download, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getBlockDefinition } from "@/features/report-builder/blocks/catalog";
import { downloadReport, generateReport } from "@/features/report-builder/generate";
import type { GeneratedReport } from "@/features/report-builder/pdf/jsPdfDriver";
import type { ReportConfig } from "@/features/report-builder/schema";
import { cn } from "@/lib/cn";

/** Tempo de espera antes de regenerar após mudança estrutural. */
const DEBOUNCE_MS = 900;

interface Props {
  config: ReportConfig;
  scopeLabel: string;
  /** Bloqueia a geração (ex.: nenhuma empresa selecionada). */
  disabledReason?: string;
}

export function ReportPreview({ config, scopeLabel, disabledReason }: Props) {
  const [report, setReport] = React.useState<GeneratedReport | null>(null);
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Só o que muda o conteúdo do PDF entra aqui — título e textos livres ficam
  // de fora para não disparar consulta a cada tecla.
  const structuralKey = React.useMemo(
    () =>
      JSON.stringify({
        scope: config.scope,
        period: config.period,
        comparison: config.comparison,
        blocks: config.blocks.map((b) => [b.type, b.options]),
      }),
    [config.scope, config.period, config.comparison, config.blocks],
  );

  const configRef = React.useRef(config);
  configRef.current = config;
  const scopeLabelRef = React.useRef(scopeLabel);
  scopeLabelRef.current = scopeLabel;

  const generate = React.useCallback(async () => {
    if (disabledReason != null) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await generateReport({
        config: configRef.current,
        scopeLabel: scopeLabelRef.current,
      });
      setReport(result);
      setObjectUrl((previous) => {
        if (previous != null) URL.revokeObjectURL(previous);
        return URL.createObjectURL(result.blob);
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsGenerating(false);
    }
  }, [disabledReason]);

  React.useEffect(() => {
    if (disabledReason != null) return undefined;
    if (config.blocks.length === 0) return undefined;
    const timer = setTimeout(() => void generate(), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `structuralKey` resume o que importa; `config` inteiro regeneraria a cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralKey, disabledReason, generate]);

  // Revoga a última URL ao desmontar, senão o blob fica retido.
  React.useEffect(
    () => () => {
      if (objectUrl != null) URL.revokeObjectURL(objectUrl);
    },
    [objectUrl],
  );

  const skipped = report?.skippedBlocks ?? [];

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-2xs flex items-center gap-2 text-text-subtle">
          {isGenerating ? (
            <>
              <Loader2 className="size-3 animate-spin" /> Gerando prévia…
            </>
          ) : report != null ? (
            `${report.pageCount} página(s)`
          ) : (
            "Sem prévia"
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void generate()}
            disabled={isGenerating || disabledReason != null || config.blocks.length === 0}
          >
            <RefreshCw className={cn("size-3.5", isGenerating && "animate-spin")} /> Atualizar
          </Button>
          <Button
            size="sm"
            onClick={() => report != null && downloadReport(report)}
            disabled={report == null || isGenerating}
          >
            <Download className="size-3.5" /> Baixar PDF
          </Button>
        </div>
      </div>

      {skipped.length > 0 && (
        <p className="text-2xs flex items-start gap-1.5 rounded-[var(--radius-sm)] bg-warning-soft px-2 py-1.5 text-warning">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <span>
            Ignorado(s) por falta de renderizador:{" "}
            {skipped.map((type) => getBlockDefinition(type).label).join(", ")}.
          </span>
        </p>
      )}

      {error != null && (
        <p className="text-2xs rounded-[var(--radius-sm)] bg-expense-soft px-2 py-1.5 text-expense">
          {error}
        </p>
      )}

      <div className="min-h-[420px] flex-1 overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-2">
        {disabledReason != null ? (
          <Placeholder>{disabledReason}</Placeholder>
        ) : config.blocks.length === 0 ? (
          <Placeholder>Adicione blocos para ver a prévia.</Placeholder>
        ) : objectUrl != null ? (
          <iframe src={objectUrl} title="Prévia do relatório" className="size-full border-0" />
        ) : (
          <Placeholder>
            {isGenerating ? "Gerando a primeira prévia…" : "Clique em Atualizar para gerar."}
          </Placeholder>
        )}
      </div>
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center p-6 text-center text-sm text-text-muted">
      {children}
    </div>
  );
}
