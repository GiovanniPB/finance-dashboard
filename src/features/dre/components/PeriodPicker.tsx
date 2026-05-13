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

import { PRESET_LABELS, resolvePreset, usePeriod, type PeriodPreset } from "../usePeriod";

export function PeriodPicker() {
  const [period, setPeriod] = usePeriod();

  const effectivePreset = period.preset;
  const effective =
    effectivePreset === "custom"
      ? { from: period.from, to: period.to }
      : resolvePreset(effectivePreset);

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
            value={effectivePreset}
            onValueChange={(v) => {
              const next = v as PeriodPreset;
              const resolved = resolvePreset(next);
              void setPeriod({ preset: next, from: resolved.from, to: resolved.to });
            }}
          >
            <SelectTrigger id="preset">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(PRESET_LABELS) as [PeriodPreset, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
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
            disabled={effectivePreset !== "custom"}
            onChange={(e) => void setPeriod({ from: e.target.value, preset: "custom" })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">Até</Label>
          <Input
            id="to"
            type="date"
            value={effective.to}
            disabled={effectivePreset !== "custom"}
            onChange={(e) => void setPeriod({ to: e.target.value, preset: "custom" })}
          />
        </div>
      </div>
    </div>
  );
}
