const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const pct = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const num = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatBRL(
  value: number | string | null | undefined,
  opts?: { compact?: boolean },
): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return opts?.compact ? brlCompact.format(n) : brl.format(n);
}

export function formatPercent(
  value: number | null | undefined,
  opts?: { fromHundred?: boolean },
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const n = opts?.fromHundred ? value / 100 : value;
  return pct.format(n);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return num.format(value);
}

/** Signed currency with arrow/sign suitable for variation display. */
export function formatVariation(value: number | null | undefined): {
  text: string;
  tone: "positive" | "negative" | "neutral";
} {
  if (value == null || !Number.isFinite(value) || value === 0) {
    return { text: "0,0%", tone: "neutral" };
  }
  const sign = value > 0 ? "+" : "";
  return {
    text: `${sign}${(value * 100).toFixed(1)}%`,
    tone: value > 0 ? "positive" : "negative",
  };
}
