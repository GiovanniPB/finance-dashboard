/**
 * Contrato do modelo de balanço gerencial.
 *
 * O modelo é a lista ordenada de linhas do relatório. Ele é persistido como jsonb
 * em `balance_report_models.lines` e validado aqui na fronteira — o banco só
 * garante que é um array (ver a migration do balanço).
 *
 * Três tipos de linha:
 *   `cost_centers` — soma de uma medida de N centros de custo (o "item");
 *   `formula`      — combinação com sinal de outras linhas (o "subitem calculado");
 *   `ratio`        — divisão de duas linhas, exibida em %.
 */
import { z } from "zod";

export const BALANCE_MEASURES = ["revenue", "expense", "net"] as const;
export type BalanceMeasure = (typeof BALANCE_MEASURES)[number];

export const MEASURE_LABELS: Record<BalanceMeasure, string> = {
  revenue: "Entradas",
  expense: "Saídas",
  net: "Entradas − saídas",
};

export const MEASURE_HINTS: Record<BalanceMeasure, string> = {
  revenue: "Só o que entrou. Use em linha de receita.",
  expense: "Só o que saiu, como número positivo. Use em linha de custo, para a fórmula subtrair.",
  net: "Entradas menos saídas. Use quando o centro tem os dois lados (estorno, devolução).",
};

const lineId = z.string().min(1).max(64);

const lineBase = {
  id: lineId,
  label: z.string().trim().min(1, "Nome obrigatório").max(60),
  /** Linha de destaque (Ebitda, Lucro Líquido) — peso visual maior na matriz. */
  emphasis: z.boolean(),
};

export const costCentersLineSchema = z.object({
  ...lineBase,
  kind: z.literal("cost_centers"),
  measure: z.enum(BALANCE_MEASURES),
  costCenterIds: z.array(z.string().uuid()),
});

export const formulaTermSchema = z.object({
  lineId,
  sign: z.union([z.literal(1), z.literal(-1)]),
});

export const formulaLineSchema = z.object({
  ...lineBase,
  kind: z.literal("formula"),
  terms: z.array(formulaTermSchema),
});

export const ratioLineSchema = z.object({
  ...lineBase,
  kind: z.literal("ratio"),
  numeratorLineId: lineId,
  denominatorLineId: lineId,
});

export const balanceLineSchema = z.discriminatedUnion("kind", [
  costCentersLineSchema,
  formulaLineSchema,
  ratioLineSchema,
]);

export const balanceLinesSchema = z.array(balanceLineSchema);

export type CostCentersLine = z.infer<typeof costCentersLineSchema>;
export type FormulaLine = z.infer<typeof formulaLineSchema>;
export type RatioLine = z.infer<typeof ratioLineSchema>;
export type BalanceLine = z.infer<typeof balanceLineSchema>;
export type FormulaTerm = z.infer<typeof formulaTermSchema>;

export const LINE_KIND_LABELS: Record<BalanceLine["kind"], string> = {
  cost_centers: "Centros de custo",
  formula: "Fórmula",
  ratio: "Percentual",
};

/**
 * Lê o jsonb do banco. Um modelo corrompido não pode derrubar a tela: descarta a
 * linha inválida e segue com o resto, que é sempre melhor que uma tela em branco.
 */
export function parseBalanceLines(raw: unknown): BalanceLine[] {
  if (!Array.isArray(raw)) return [];
  const out: BalanceLine[] = [];
  for (const item of raw) {
    const parsed = balanceLineSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export function newLineId(): string {
  return crypto.randomUUID();
}

/**
 * Modelo inicial: uma linha por centro de custo ativo, na ordem em que vêm.
 *
 * Deliberadamente não tenta adivinhar Ebitda/Lucro a partir do nome do centro —
 * a composição dessas linhas é decisão contábil de quem monta o relatório, e
 * errar em silêncio no palpite é pior que deixar o usuário montar.
 */
export function linesFromCostCenters(
  costCenters: readonly { id: string; name: string }[],
): BalanceLine[] {
  return costCenters.map((cc) => ({
    id: newLineId(),
    label: cc.name,
    kind: "cost_centers" as const,
    measure: "net" as const,
    costCenterIds: [cc.id],
    emphasis: false,
  }));
}
