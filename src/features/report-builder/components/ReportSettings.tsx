/**
 * Cabeçalho de configuração: período, comparativo, dados do documento e modelos
 * prontos.
 */
import { Check } from "lucide-react";

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
import { resolveComparison, resolvePeriod } from "@/features/report-builder/period";
import { presetsForScope, type ReportPreset } from "@/features/report-builder/presets";
import {
  COMPARISON_LABELS,
  COMPARISONS,
  PERIOD_PRESET_LABELS,
  PERIOD_PRESETS,
  type PeriodPreset,
  type ReportComparison,
  type ReportConfig,
  type ReportDocument,
} from "@/features/report-builder/schema";
import { cn } from "@/lib/cn";

interface Props {
  config: ReportConfig;
  onPeriodChange: (preset: PeriodPreset) => void;
  onCustomRangeChange: (from: string, to: string) => void;
  onComparisonChange: (comparison: ReportComparison) => void;
  onDocumentChange: (patch: Partial<ReportDocument>) => void;
  onApplyPreset: (preset: ReportPreset) => void;
}

export function ReportSettings({
  config,
  onPeriodChange,
  onCustomRangeChange,
  onComparisonChange,
  onDocumentChange,
  onApplyPreset,
}: Props) {
  const period = resolvePeriod(config.period);
  const comparison = resolveComparison(period, config.comparison);
  const presets = presetsForScope(config.scope.mode);
  const isCustom = config.period.preset === "custom";

  return (
    <div className="space-y-4">
      <div>
        <span className="text-2xs mb-1.5 block font-medium tracking-wide text-text-subtle uppercase">
          Modelos prontos
        </span>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.description}
              onClick={() => onApplyPreset(preset)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium transition-colors duration-[var(--duration-fast)]",
                "hover:border-accent hover:bg-accent-soft hover:text-accent",
              )}
            >
              <Check className="size-3" />
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rb-period">Período</Label>
          <Select
            value={config.period.preset}
            onValueChange={(v) => onPeriodChange(v as PeriodPreset)}
          >
            <SelectTrigger id="rb-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_PRESETS.map((preset) => (
                <SelectItem key={preset} value={preset}>
                  {PERIOD_PRESET_LABELS[preset]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-2xs text-text-subtle">{period.label}</span>
        </div>

        {isCustom && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rb-from">Intervalo</Label>
            <div className="flex items-center gap-1.5">
              <Input
                id="rb-from"
                type="date"
                value={config.period.from ?? ""}
                onChange={(e) => onCustomRangeChange(e.target.value, config.period.to ?? "")}
              />
              <Input
                aria-label="Data final"
                type="date"
                value={config.period.to ?? ""}
                onChange={(e) => onCustomRangeChange(config.period.from ?? "", e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rb-comparison">Comparativo</Label>
          <Select
            value={config.comparison}
            onValueChange={(v) => onComparisonChange(v as ReportComparison)}
          >
            <SelectTrigger id="rb-comparison">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPARISONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {COMPARISON_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-2xs text-text-subtle">{comparison?.label ?? "Nenhum"}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rb-title">Título</Label>
          <Input
            id="rb-title"
            value={config.document.title}
            onChange={(e) => onDocumentChange({ title: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rb-subtitle">Subtítulo</Label>
          <Input
            id="rb-subtitle"
            value={config.document.subtitle ?? ""}
            placeholder="Opcional"
            onChange={(e) => onDocumentChange({ subtitle: e.target.value })}
          />
        </div>
      </div>

      {/*
        `items-end` alinha as caixas de seleção com a base do campo ao lado — sem
        isso elas ficam centralizadas na altura do rótulo + input e desalinham.
      */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rb-confidentiality">Nota de confidencialidade</Label>
          <Input
            id="rb-confidentiality"
            value={config.document.confidentialityNote ?? ""}
            placeholder="Ex.: Documento interno · uso restrito"
            onChange={(e) => onDocumentChange({ confidentialityNote: e.target.value })}
          />
        </div>
        <div className="flex h-9 flex-wrap items-center gap-x-5 gap-y-2">
          <ToggleField
            id="rb-page-numbers"
            label="Numerar páginas"
            checked={config.document.showPageNumbers}
            onChange={(checked) => onDocumentChange({ showPageNumbers: checked })}
          />
          <ToggleField
            id="rb-running-header"
            label="Cabeçalho em todas as páginas"
            checked={config.document.showRunningHeader}
            onChange={(checked) => onDocumentChange({ showRunningHeader: checked })}
          />
        </div>
      </div>
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
