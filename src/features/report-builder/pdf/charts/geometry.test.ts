import { describe, expect, it } from "vitest";

import { annularSectorPoints, areaPolygon, pointOnCircle } from "./geometry";

const QUARTER = Math.PI / 2;

describe("pointOnCircle", () => {
  it("põe o ângulo zero no topo", () => {
    const point = pointOnCircle(0, 0, 10, 0);

    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(-10);
  });

  it("cresce em sentido horário", () => {
    const right = pointOnCircle(0, 0, 10, QUARTER);
    const bottom = pointOnCircle(0, 0, 10, Math.PI);

    expect(right.x).toBeCloseTo(10);
    expect(right.y).toBeCloseTo(0);
    expect(bottom.y).toBeCloseTo(10);
  });

  it("respeita o centro", () => {
    const point = pointOnCircle(50, 30, 5, 0);

    expect(point.x).toBeCloseTo(50);
    expect(point.y).toBeCloseTo(25);
  });
});

describe("annularSectorPoints", () => {
  it("fecha o setor com ida pelo raio externo e volta pelo interno", () => {
    const points = annularSectorPoints(0, 0, 5, 10, 0, QUARTER);

    // Simétrico: mesmo número de pontos no arco externo e no interno.
    expect(points.length % 2).toBe(0);

    const first = points[0];
    const last = points[points.length - 1];
    expect(Math.hypot(first?.x ?? 0, first?.y ?? 0)).toBeCloseTo(10);
    expect(Math.hypot(last?.x ?? 0, last?.y ?? 0)).toBeCloseTo(5);
  });

  it("todos os pontos ficam entre os dois raios", () => {
    const points = annularSectorPoints(0, 0, 4, 9, 0.3, 2.1);

    for (const point of points) {
      const radius = Math.hypot(point.x, point.y);
      expect(radius).toBeGreaterThanOrEqual(4 - 1e-6);
      expect(radius).toBeLessThanOrEqual(9 + 1e-6);
    }
  });

  it("usa mais segmentos em setores maiores", () => {
    const small = annularSectorPoints(0, 0, 5, 10, 0, 0.1);
    const large = annularSectorPoints(0, 0, 5, 10, 0, Math.PI * 2);

    expect(large.length).toBeGreaterThan(small.length);
  });

  it("mantém um mínimo de segmentos em setor muito fino", () => {
    const sliver = annularSectorPoints(0, 0, 5, 10, 0, 0.0001);

    expect(sliver.length).toBeGreaterThanOrEqual(6);
  });
});

describe("areaPolygon", () => {
  it("fecha a série pela linha de base", () => {
    const polygon = areaPolygon(
      [
        { x: 0, y: 10 },
        { x: 5, y: 4 },
        { x: 10, y: 8 },
      ],
      20,
    );

    expect(polygon[0]).toEqual({ x: 0, y: 20 });
    expect(polygon[polygon.length - 1]).toEqual({ x: 10, y: 20 });
    expect(polygon).toHaveLength(5);
  });

  it("devolve vazio sem pontos", () => {
    expect(areaPolygon([], 10)).toEqual([]);
  });
});
