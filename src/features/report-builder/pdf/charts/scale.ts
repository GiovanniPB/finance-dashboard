/**
 * Escalas de gráfico — funções puras, sem jsPDF.
 *
 * É a parte dos gráficos onde erro passa despercebido no olho (um eixo com
 * limite errado ainda "parece" um gráfico), então fica isolada e coberta por
 * testes.
 */

export interface NiceScale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

export interface NiceScaleOptions {
  /** Quantidade desejada de intervalos — o resultado pode variar para arredondar bem. */
  tickCount?: number;
  /** Forçar o zero no domínio. Obrigatório em barras: barra sem base no zero mente. */
  includeZero?: boolean;
}

/** Passos "redondos" aceitáveis dentro de uma ordem de magnitude. */
const NICE_MULTIPLES = [1, 2, 2.5, 5, 10];

/**
 * Domínio arredondado para limites legíveis, com os ticks correspondentes.
 * `[0, 1_284_500]` com 4 intervalos → passo 500k, máximo 1,5M.
 */
export function niceScale(
  rawMin: number,
  rawMax: number,
  options: NiceScaleOptions = {},
): NiceScale {
  const tickCount = Math.max(1, options.tickCount ?? 4);
  const includeZero = options.includeZero ?? true;

  let min = includeZero ? Math.min(0, rawMin) : rawMin;
  let max = includeZero ? Math.max(0, rawMax) : rawMax;

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1, step: 1, ticks: [0, 1] };
  }

  // Domínio degenerado: sem isso o passo seria 0 e o laço de ticks não terminaria.
  if (min === max) {
    if (min === 0) return { min: 0, max: 1, step: 0.5, ticks: [0, 0.5, 1] };
    min = Math.min(0, min);
    max = Math.max(0, max);
    if (min === max) max = min + 1;
  }

  const step = niceStep((max - min) / tickCount);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  const decimals = decimalsFor(step);
  // Tolerância no limite: acumular passos fracionários erra o último tick.
  for (let value = niceMin; value <= niceMax + step * 1e-9; value += step) {
    ticks.push(roundTo(value, decimals));
  }

  return { min: niceMin, max: niceMax, step, ticks };
}

function niceStep(rough: number): number {
  if (!(rough > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const multiple = NICE_MULTIPLES.find((m) => normalized <= m) ?? 10;
  return multiple * magnitude;
}

function decimalsFor(step: number): number {
  if (step >= 1) return 0;
  return Math.min(6, Math.ceil(-Math.log10(step)) + 1);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Projeta um valor do domínio na faixa de coordenadas do PDF.
 *
 * Em PDF o Y cresce para baixo, então para um eixo vertical passe
 * `rangeStart = base do gráfico` e `rangeEnd = topo`: o máximo do domínio cai no
 * topo, como se espera.
 */
export function project(
  value: number,
  domainMin: number,
  domainMax: number,
  rangeStart: number,
  rangeEnd: number,
): number {
  if (domainMax === domainMin) return rangeStart;
  const ratio = (value - domainMin) / (domainMax - domainMin);
  return rangeStart + ratio * (rangeEnd - rangeStart);
}

export interface BandScale {
  /** Largura de cada faixa, incluindo o espaçamento. */
  bandWidth: number;
  /** Largura útil para desenho dentro da faixa. */
  innerWidth: number;
  /** X inicial da área útil da faixa `index`. */
  start(index: number): number;
  /** X do centro da faixa `index`. */
  center(index: number): number;
}

/**
 * Faixas de largura igual para eixos categóricos (meses, contas, centros de custo).
 * `padding` é a fração da faixa reservada ao respiro entre categorias.
 */
export function bandScale(count: number, xMm: number, widthMm: number, padding = 0.28): BandScale {
  const safeCount = Math.max(1, count);
  const bandWidth = widthMm / safeCount;
  const innerWidth = bandWidth * (1 - padding);
  const offset = (bandWidth - innerWidth) / 2;

  return {
    bandWidth,
    innerWidth,
    start: (index) => xMm + index * bandWidth + offset,
    center: (index) => xMm + index * bandWidth + bandWidth / 2,
  };
}

/**
 * Extremos de várias séries de uma vez, ignorando valores ausentes (`null`) e
 * não finitos. Ausente é diferente de zero: um mês sem dado não deve empurrar o
 * domínio até o zero.
 */
export function extentOf(seriesValues: readonly (readonly (number | null)[])[]): {
  min: number;
  max: number;
} {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const values of seriesValues) {
    for (const value of values) {
      if (value == null || !Number.isFinite(value)) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  if (min === Number.POSITIVE_INFINITY) return { min: 0, max: 0 };
  return { min, max };
}
