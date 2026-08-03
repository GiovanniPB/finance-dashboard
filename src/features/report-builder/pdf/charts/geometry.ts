/**
 * Geometria de desenho sobre o jsPDF.
 *
 * O jsPDF não tem primitiva de arco/fatia, só `lines()` com segmentos relativos.
 * Aproximamos arcos por polígonos com passo angular fino — em tamanho de
 * impressão a diferença não é perceptível, e evita bezier na mão.
 */
import type { jsPDF } from "jspdf";

export interface Point {
  x: number;
  y: number;
}

/** Passo angular da aproximação de arco. 2° é liso o suficiente em papel. */
const ARC_STEP_RAD = (2 * Math.PI) / 180;

/**
 * Preenche um polígono fechado. `points` em mm, no sistema do PDF (Y para baixo).
 */
export function fillPolygon(doc: jsPDF, points: readonly Point[], color: string): void {
  if (points.length < 3) return;
  const [first, ...rest] = points;
  if (first == null) return;

  const deltas: [number, number][] = [];
  let previous = first;
  for (const point of rest) {
    deltas.push([point.x - previous.x, point.y - previous.y]);
    previous = point;
  }

  doc.setFillColor(color);
  doc.lines(deltas, first.x, first.y, [1, 1], "F", true);
}

/** Traça uma polilinha aberta (sem preenchimento). */
export function strokePolyline(
  doc: jsPDF,
  points: readonly Point[],
  color: string,
  widthMm = 0.4,
): void {
  if (points.length < 2) return;
  const [first, ...rest] = points;
  if (first == null) return;

  const deltas: [number, number][] = [];
  let previous = first;
  for (const point of rest) {
    deltas.push([point.x - previous.x, point.y - previous.y]);
    previous = point;
  }

  doc.setDrawColor(color);
  doc.setLineWidth(widthMm);
  doc.lines(deltas, first.x, first.y, [1, 1], "S", false);
}

/**
 * Ponto sobre um círculo, com **ângulo 0 no topo crescendo em sentido
 * horário** — a convenção que se espera de um gráfico de rosca.
 */
export function pointOnCircle(cx: number, cy: number, radius: number, angleRad: number): Point {
  return {
    x: cx + radius * Math.sin(angleRad),
    y: cy - radius * Math.cos(angleRad),
  };
}

/**
 * Polígono de um setor anelar (fatia de rosca): arco externo no sentido do
 * ângulo, arco interno de volta.
 */
export function annularSectorPoints(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngleRad: number,
  endAngleRad: number,
): Point[] {
  const sweep = endAngleRad - startAngleRad;
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / ARC_STEP_RAD));
  const points: Point[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const angle = startAngleRad + (sweep * i) / steps;
    points.push(pointOnCircle(cx, cy, outerRadius, angle));
  }
  for (let i = steps; i >= 0; i -= 1) {
    const angle = startAngleRad + (sweep * i) / steps;
    points.push(pointOnCircle(cx, cy, innerRadius, angle));
  }

  return points;
}

/**
 * Fecha uma série em área: a polilinha dos pontos mais o retorno pela linha de
 * base, para virar polígono preenchível.
 */
export function areaPolygon(points: readonly Point[], baselineY: number): Point[] {
  if (points.length === 0) return [];
  const first = points[0];
  const last = points[points.length - 1];
  if (first == null || last == null) return [];
  return [{ x: first.x, y: baselineY }, ...points, { x: last.x, y: baselineY }];
}
