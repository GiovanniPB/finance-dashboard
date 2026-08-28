/**
 * Cálculo da matriz do balanço gerencial — funções puras, sem banco.
 *
 * Entra a série mensal crua (mês × centro de custo) e o modelo de linhas; sai a
 * matriz pronta para a tabela. O cálculo fica aqui, e não no SQL, para as
 * fórmulas serem testáveis sem subir Postgres.
 */
import { eachMonthOfInterval, parseISO, startOfMonth } from "date-fns";

import { isoDate } from "@/lib/dates";

import type { BalanceLine, BalanceMeasure } from "./schema";

export interface MonthlySeriesRow {
  /** Primeiro dia do mês, YYYY-MM-DD. */
  month: string;
  costCenterId: string | null;
  revenue: number;
  expense: number;
}

/**
 * Como chegar nos lançamentos por trás de uma linha.
 *
 * Linha calculada (fórmula, percentual) não tem lançamento próprio — ela nasce de
 * outras linhas —, então o drilldown dela é `null`.
 */
export type BalanceDrilldown =
  | { kind: "cost_centers"; costCenterIds: string[]; measure: BalanceMeasure }
  | { kind: "unclassified"; revenueCovered: string[]; expenseCovered: string[] };

export interface BalanceMatrixLine {
  id: string;
  label: string;
  kind: BalanceLine["kind"] | "unclassified";
  emphasis: boolean;
  format: "currency" | "percent";
  /** Um valor por mês do eixo. `null` = indefinido (divisão por zero, fórmula quebrada). */
  values: (number | null)[];
  /**
   * Variação contra o mês anterior, alinhada com `values` — o primeiro mês é
   * sempre `null` porque não tem anterior. A unidade depende do formato da linha
   * (ver `deltaUnit`).
   */
  deltas: (number | null)[];
  /**
   * `percent` para linha de dinheiro (variação % sobre o mês anterior);
   * `points` para linha que já é percentual, onde a variação é em pontos
   * percentuais — margem de 10% para 20% é +10 p.p., não +100%.
   */
  deltaUnit: "percent" | "points";
  /** Total do período — recalculado do agregado, não somado dos meses (ver abaixo). */
  total: number | null;
  /** `null` quando a linha é calculada e não tem lançamento próprio. */
  drilldown: BalanceDrilldown | null;
}

export interface BalanceMatrix {
  /** Eixo de meses (primeiro dia de cada mês), sempre completo no período. */
  months: string[];
  lines: BalanceMatrixLine[];
}

const UNCLASSIFIED_ID = "__unclassified__";
export const UNCLASSIFIED_LABEL = "Não classificado";

/** Centavo — abaixo disso é ruído de float, não dinheiro. */
const EPSILON = 0.005;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Eixo de meses do período, inclusive os meses sem nenhum lançamento. */
export function monthAxis(from: string, to: string): string[] {
  if (!from || !to) return [];
  const start = startOfMonth(parseISO(from));
  const end = startOfMonth(parseISO(to));
  if (end < start) return [];
  return eachMonthOfInterval({ start, end }).map((d) => isoDate(d));
}

interface Bucket {
  revenue: number;
  expense: number;
}

function emptyBucket(): Bucket {
  return { revenue: 0, expense: 0 };
}

function measureOf(bucket: Bucket, measure: BalanceMeasure): number {
  if (measure === "revenue") return bucket.revenue;
  if (measure === "expense") return bucket.expense;
  return bucket.revenue - bucket.expense;
}

/** Agrupa as linhas da série por centro de custo. `null` = sem centro. */
function bucketsByCostCenter(rows: readonly MonthlySeriesRow[]): Map<string | null, Bucket> {
  const map = new Map<string | null, Bucket>();
  for (const row of rows) {
    const current = map.get(row.costCenterId) ?? emptyBucket();
    current.revenue += row.revenue;
    current.expense += row.expense;
    map.set(row.costCenterId, current);
  }
  return map;
}

/**
 * Ordem de avaliação das linhas.
 *
 * `formula` e `ratio` apontam para outras linhas, então a ordem do modelo não
 * basta — uma fórmula pode referenciar uma linha declarada depois dela. DFS com
 * marcação de "em visita" resolve a ordem e, de quebra, detecta ciclo
 * (Ebitda = Lucro, Lucro = Ebitda) e referência para linha inexistente.
 */
export function evaluationOrder(lines: readonly BalanceLine[]): {
  order: string[];
  broken: Set<string>;
} {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const order: string[] = [];
  const broken = new Set<string>();
  const done = new Set<string>();
  const visiting = new Set<string>();

  const depsOf = (line: BalanceLine): string[] => {
    if (line.kind === "formula") return line.terms.map((t) => t.lineId);
    if (line.kind === "ratio") return [line.numeratorLineId, line.denominatorLineId];
    return [];
  };

  function visit(id: string): boolean {
    if (done.has(id)) return !broken.has(id);
    if (visiting.has(id)) return false; // ciclo
    const line = byId.get(id);
    if (!line) return false; // referência para linha que não existe

    visiting.add(id);
    let ok = true;
    for (const dep of depsOf(line)) {
      if (!visit(dep)) ok = false;
    }
    visiting.delete(id);

    done.add(id);
    if (!ok) broken.add(id);
    order.push(id);
    return ok;
  }

  for (const line of lines) visit(line.id);
  return { order, broken };
}

/** Avalia todas as linhas sobre um único conjunto de buckets (um mês ou o total). */
function evaluate(
  lines: readonly BalanceLine[],
  order: readonly string[],
  broken: ReadonlySet<string>,
  buckets: Map<string | null, Bucket>,
): Map<string, number | null> {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const values = new Map<string, number | null>();

  for (const id of order) {
    const line = byId.get(id);
    if (!line || broken.has(id)) {
      values.set(id, null);
      continue;
    }

    if (line.kind === "cost_centers") {
      const sum = line.costCenterIds.reduce(
        (acc, ccId) => acc + measureOf(buckets.get(ccId) ?? emptyBucket(), line.measure),
        0,
      );
      values.set(id, round2(sum));
      continue;
    }

    if (line.kind === "formula") {
      let sum = 0;
      let defined = true;
      for (const term of line.terms) {
        const value = values.get(term.lineId);
        if (value == null) {
          defined = false;
          break;
        }
        sum += term.sign * value;
      }
      values.set(id, defined ? round2(sum) : null);
      continue;
    }

    const numerator = values.get(line.numeratorLineId);
    const denominator = values.get(line.denominatorLineId);
    const defined = numerator != null && denominator != null && Math.abs(denominator) >= EPSILON;
    values.set(id, defined ? (numerator / denominator) * 100 : null);
  }

  return values;
}

/**
 * Centros de custo cobertos pelo modelo, por lado.
 *
 * A cobertura é por medida, não por centro: uma linha com medida `expense` conta
 * só as saídas daquele centro. Se ele tiver uma entrada (um estorno, por exemplo),
 * ela não aparece em lugar nenhum — e é justamente isso que a linha
 * "Não classificado" precisa capturar para o relatório fechar com a empresa.
 */
function coverage(lines: readonly BalanceLine[]): { revenue: Set<string>; expense: Set<string> } {
  const revenue = new Set<string>();
  const expense = new Set<string>();
  for (const line of lines) {
    if (line.kind !== "cost_centers") continue;
    for (const ccId of line.costCenterIds) {
      if (line.measure === "revenue" || line.measure === "net") revenue.add(ccId);
      if (line.measure === "expense" || line.measure === "net") expense.add(ccId);
    }
  }
  return { revenue, expense };
}

/** Sobra de dinheiro que nenhuma linha do modelo captura, em regime líquido. */
function unclassifiedOf(
  rows: readonly MonthlySeriesRow[],
  covered: { revenue: Set<string>; expense: Set<string> },
): number {
  let sum = 0;
  for (const row of rows) {
    const id = row.costCenterId;
    if (id == null || !covered.revenue.has(id)) sum += row.revenue;
    if (id == null || !covered.expense.has(id)) sum -= row.expense;
  }
  return round2(sum);
}

/**
 * Variação mês a mês de uma série.
 *
 * Linha de dinheiro varia em porcentagem sobre o mês anterior; linha que já é
 * percentual varia em pontos percentuais, porque "a margem subiu 100%" não quer
 * dizer nada — subiu de 10% para 20% são +10 p.p.
 *
 * A base é o **módulo** do mês anterior: de −100 para −50 é +50%, e não −50%. Sem
 * isso o sinal se inverte justamente nas linhas de resultado negativo, que são as
 * que mais importam ler.
 *
 * Variar a partir de zero não tem porcentagem definida, então vira `null` em vez
 * de infinito.
 */
export function monthOverMonth(
  values: readonly (number | null)[],
  format: "currency" | "percent",
): (number | null)[] {
  return values.map((current, index) => {
    if (index === 0) return null;
    const previous = values[index - 1];
    if (current == null || previous == null) return null;
    if (format === "percent") return current - previous;
    if (Math.abs(previous) < EPSILON) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  });
}

export interface BuildMatrixInput {
  from: string;
  to: string;
  series: readonly MonthlySeriesRow[];
  lines: readonly BalanceLine[];
}

export function buildBalanceMatrix({ from, to, series, lines }: BuildMatrixInput): BalanceMatrix {
  const months = monthAxis(from, to);
  const { order, broken } = evaluationOrder(lines);

  const rowsByMonth = new Map<string, MonthlySeriesRow[]>();
  for (const row of series) {
    const bucket = rowsByMonth.get(row.month);
    if (bucket) bucket.push(row);
    else rowsByMonth.set(row.month, [row]);
  }

  const perMonth = months.map((month) => {
    const rows = rowsByMonth.get(month) ?? [];
    return evaluate(lines, order, broken, bucketsByCostCenter(rows));
  });

  // O total do período é recalculado sobre o agregado, e não somado dos meses.
  // Para soma e fórmula dá no mesmo (são lineares); para percentual não: a margem
  // do ano é lucro_do_ano ÷ receita_do_ano, nunca a soma das margens mensais.
  const totals = evaluate(lines, order, broken, bucketsByCostCenter(series));

  const matrixLines: BalanceMatrixLine[] = lines.map((line) => {
    const format = line.kind === "ratio" ? "percent" : "currency";
    const values = perMonth.map((monthValues) => monthValues.get(line.id) ?? null);
    return {
      id: line.id,
      label: line.label,
      kind: line.kind,
      emphasis: line.emphasis,
      format,
      values,
      deltas: monthOverMonth(values, format),
      deltaUnit: format === "percent" ? "points" : "percent",
      total: totals.get(line.id) ?? null,
      drilldown:
        line.kind === "cost_centers"
          ? {
              kind: "cost_centers",
              costCenterIds: [...line.costCenterIds],
              measure: line.measure,
            }
          : null,
    };
  });

  const covered = coverage(lines);
  const unclassifiedTotal = unclassifiedOf(series, covered);
  if (Math.abs(unclassifiedTotal) >= EPSILON) {
    const values = months.map((month) => unclassifiedOf(rowsByMonth.get(month) ?? [], covered));
    matrixLines.push({
      id: UNCLASSIFIED_ID,
      label: UNCLASSIFIED_LABEL,
      kind: "unclassified",
      emphasis: false,
      format: "currency",
      values,
      deltas: monthOverMonth(values, "currency"),
      deltaUnit: "percent",
      total: unclassifiedTotal,
      drilldown: {
        kind: "unclassified",
        revenueCovered: [...covered.revenue],
        expenseCovered: [...covered.expense],
      },
    });
  }

  return { months, lines: matrixLines };
}

export interface ModelIssues {
  /** Linhas com ciclo ou referência para linha inexistente. */
  brokenLineIds: string[];
  /** Centros de custo em mais de uma linha — o dinheiro entra duas vezes no total. */
  duplicatedCostCenterIds: string[];
  /** Centros referenciados que não existem mais na empresa. */
  unknownCostCenterIds: string[];
}

/** Problemas do modelo que valem aviso na UI (nenhum impede o relatório de rodar). */
export function analyzeModel(
  lines: readonly BalanceLine[],
  knownCostCenterIds: readonly string[],
): ModelIssues {
  const { broken } = evaluationOrder(lines);
  const known = new Set(knownCostCenterIds);
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  const unknown = new Set<string>();

  for (const line of lines) {
    if (line.kind !== "cost_centers") continue;
    for (const ccId of line.costCenterIds) {
      if (seen.has(ccId)) duplicated.add(ccId);
      seen.add(ccId);
      if (!known.has(ccId)) unknown.add(ccId);
    }
  }

  return {
    brokenLineIds: [...broken],
    duplicatedCostCenterIds: [...duplicated],
    unknownCostCenterIds: [...unknown],
  };
}
