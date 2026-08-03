/** Formatação compacta para rótulos de eixo, onde não cabe o valor cheio. */
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

const MILLION = 1_000_000;
const THOUSAND = 1_000;

/**
 * `1500000` → `R$ 1,5M`; `340000` → `R$ 340 mil`; `-820` → `-R$ 820`.
 *
 * Mesma intenção do `formatCompact` de `YoYBarChart`, mas com "mil" em vez de
 * "k" — o PDF é um documento em português, não uma UI.
 */
export function formatCompactBRL(value: number): string {
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  if (abs >= MILLION) return `${sign(value)}R$ ${trim(abs / MILLION)}M`;
  if (abs >= THOUSAND) return `${sign(value)}R$ ${Math.round(abs / THOUSAND)} mil`;
  return formatBRL(value);
}

function sign(value: number): string {
  return value < 0 ? "-" : "";
}

/** Uma casa decimal, sem `,0` supérfluo. */
function trim(value: number): string {
  return value
    .toFixed(1)
    .replace(/,?\.0$/u, "")
    .replace(".", ",");
}

/** `2026-07-01` → `jul` — rótulo de categoria mensal, sem o ponto do ptBR. */
export function monthCategory(iso: string): string {
  return formatDate(iso, "MMM").replace(".", "");
}

/** `2026-07-09` → `09/07` — rótulo de categoria diária. */
export function dayCategory(iso: string): string {
  return formatDate(iso, "dd/MM");
}
