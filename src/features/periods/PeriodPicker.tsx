import { Calendar } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { effectiveRange, PRESET_LABELS, PRESETS, resolvePreset, usePeriod } from "./usePeriod";

export function PeriodPicker() {
  const [period, setPeriod] = usePeriod();

  const isCustom = period.preset === "custom";
  const effective = effectiveRange(period);
  const invalidRange =
    isCustom && Boolean(effective.from && effective.to) ? effective.from > effective.to : false;

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2 text-text-muted">
        <Calendar className="size-4" />
        <span className="text-xs font-medium tracking-wide uppercase">Período</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:max-w-2xl sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="preset">Preset</Label>
          <Select
            value={period.preset}
            onValueChange={(v) => {
              const next = v as (typeof PRESETS)[number];
              // Ao sair do personalizado, materializa o intervalo do preset na URL
              // para o link continuar significando o mesmo período depois.
              const resolved = next === "custom" ? effective : resolvePreset(next);
              void setPeriod({ preset: next, from: resolved.from, to: resolved.to });
            }}
          >
            <SelectTrigger id="preset">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((preset) => (
                <SelectItem key={preset} value={preset}>
                  {PRESET_LABELS[preset]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">De</Label>
          <Input
            id="from"
            type="date"
            value={effective.from}
            disabled={!isCustom}
            aria-invalid={invalidRange}
            onChange={(e) => void setPeriod({ from: e.target.value, preset: "custom" })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">Até</Label>
          <Input
            id="to"
            type="date"
            value={effective.to}
            disabled={!isCustom}
            aria-invalid={invalidRange}
            onChange={(e) => void setPeriod({ to: e.target.value, preset: "custom" })}
          />
        </div>
      </div>
      {invalidRange && (
        <p className="text-2xs mt-2 text-expense">A data inicial precisa vir antes da final.</p>
      )}
    </div>
  );
}
