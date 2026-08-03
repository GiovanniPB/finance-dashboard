import { describe, expect, it } from "vitest";

import { bandScale, extentOf, niceScale, project } from "./scale";

describe("niceScale", () => {
  it("arredonda o máximo para um limite legível", () => {
    const scale = niceScale(0, 1_284_500);

    expect(scale.max).toBe(1_500_000);
    expect(scale.min).toBe(0);
    expect(scale.step).toBe(500_000);
    expect(scale.ticks).toEqual([0, 500_000, 1_000_000, 1_500_000]);
  });

  it("inclui o zero por padrão mesmo com todos os valores positivos", () => {
    expect(niceScale(820, 960).min).toBe(0);
  });

  it("permite domínio sem o zero quando pedido", () => {
    const scale = niceScale(820, 960, { includeZero: false });

    expect(scale.min).toBeGreaterThan(0);
  });

  it("abre o domínio para baixo com valores negativos", () => {
    const scale = niceScale(-446_251, 1_646_181);

    expect(scale.min).toBeLessThan(0);
    expect(scale.max).toBeGreaterThanOrEqual(1_646_181);
    expect(scale.ticks).toContain(0);
  });

  it("trata série inteiramente negativa", () => {
    const scale = niceScale(-9_874, -1_200);

    expect(scale.max).toBe(0);
    expect(scale.min).toBeLessThanOrEqual(-9_874);
  });

  it("não trava com domínio degenerado em zero", () => {
    const scale = niceScale(0, 0);

    expect(scale.ticks.length).toBeGreaterThan(1);
    expect(scale.step).toBeGreaterThan(0);
  });

  it("não trava com min igual a max diferente de zero", () => {
    const scale = niceScale(500, 500);

    expect(scale.ticks.length).toBeGreaterThan(1);
    expect(scale.min).toBe(0);
  });

  it("sobrevive a valores não finitos", () => {
    const scale = niceScale(Number.NaN, Number.POSITIVE_INFINITY);

    expect(scale.ticks).toEqual([0, 1]);
  });

  it("cobre todo o domínio de entrada", () => {
    for (const [min, max] of [
      [0, 7],
      [0, 33],
      [-12, 480],
      [3, 3.7],
      [0, 0.004],
      [-1_000_000, -3],
    ] as const) {
      const scale = niceScale(min, max);
      expect(scale.min).toBeLessThanOrEqual(min);
      expect(scale.max).toBeGreaterThanOrEqual(max);
    }
  });

  it("não gera tick com ruído de ponto flutuante", () => {
    const scale = niceScale(0, 1);

    for (const tick of scale.ticks) {
      expect(String(tick)).not.toMatch(/000000|999999/u);
    }
  });

  it("respeita a quantidade pedida de intervalos de forma aproximada", () => {
    const scale = niceScale(0, 100, { tickCount: 5 });

    expect(scale.ticks.length).toBeGreaterThanOrEqual(4);
    expect(scale.ticks.length).toBeLessThanOrEqual(8);
  });
});

describe("project", () => {
  it("mapeia o domínio na faixa", () => {
    expect(project(50, 0, 100, 0, 200)).toBe(100);
  });

  it("inverte quando a faixa é decrescente — eixo Y do PDF", () => {
    // base=100mm, topo=20mm: o máximo do domínio precisa cair no topo.
    expect(project(100, 0, 100, 100, 20)).toBe(20);
    expect(project(0, 0, 100, 100, 20)).toBe(100);
  });

  it("devolve o início da faixa em domínio degenerado", () => {
    expect(project(5, 3, 3, 10, 90)).toBe(10);
  });
});

describe("bandScale", () => {
  it("divide a largura em faixas iguais", () => {
    const scale = bandScale(4, 0, 100);

    expect(scale.bandWidth).toBe(25);
    expect(scale.center(0)).toBe(12.5);
    expect(scale.center(3)).toBe(87.5);
  });

  it("aplica o respiro entre categorias", () => {
    const scale = bandScale(2, 0, 100, 0.2);

    expect(scale.innerWidth).toBeCloseTo(40);
    expect(scale.start(0)).toBeCloseTo(5);
  });

  it("respeita o deslocamento horizontal", () => {
    expect(bandScale(2, 30, 100).center(0)).toBe(55);
  });

  it("não divide por zero sem categorias", () => {
    expect(Number.isFinite(bandScale(0, 0, 100).bandWidth)).toBe(true);
  });
});

describe("extentOf", () => {
  it("acha os extremos entre várias séries", () => {
    expect(
      extentOf([
        [1, 5],
        [-3, 9],
      ]),
    ).toEqual({ min: -3, max: 9 });
  });

  it("ignora valores não finitos", () => {
    expect(extentOf([[Number.NaN, 4, Number.POSITIVE_INFINITY]])).toEqual({ min: 4, max: 4 });
  });

  it("devolve zeros sem dados", () => {
    expect(extentOf([])).toEqual({ min: 0, max: 0 });
    expect(extentOf([[]])).toEqual({ min: 0, max: 0 });
  });
});

describe("niceScale — lado negativo raso", () => {
  it("não gasta um passo inteiro quando os dados entram pouco no negativo", () => {
    // -45 mil contra 1,4 M: antes o piso ia a -500 mil e desperdiçava ~1/4 da
    // altura do gráfico.
    const scale = niceScale(-45_000, 1_405_000);

    expect(scale.min).toBeGreaterThan(-100_000);
    expect(scale.min).toBeLessThanOrEqual(-45_000);
    expect(scale.max).toBe(1_500_000);
  });

  it("mantém os ticks em múltiplos do passo, começando no zero", () => {
    const scale = niceScale(-45_000, 1_405_000);

    expect(scale.ticks).toEqual([0, 500_000, 1_000_000, 1_500_000]);
    for (const tick of scale.ticks) {
      expect(tick % scale.step).toBe(0);
    }
  });

  it("ainda arredonda o piso quando o negativo é relevante", () => {
    // -400 mil passa de meio passo (250 mil), então o piso vira -500 mil.
    const scale = niceScale(-400_000, 1_405_000);

    expect(scale.min).toBe(-500_000);
    expect(scale.ticks).toContain(-500_000);
    expect(scale.ticks).toContain(0);
  });

  it("nunca devolve menos-zero nos ticks", () => {
    for (const [min, max] of [
      [-45_000, 1_405_000],
      [-1, 100],
      [-0.004, 9],
    ] as const) {
      for (const tick of niceScale(min, max).ticks) {
        expect(Object.is(tick, -0)).toBe(false);
      }
    }
  });

  it("cobre o dado mesmo com piso solto", () => {
    for (const [min, max] of [
      [-45_000, 1_405_000],
      [-9, 900],
      [-0.3, 50],
    ] as const) {
      const scale = niceScale(min, max);
      expect(scale.min).toBeLessThanOrEqual(min);
      expect(scale.max).toBeGreaterThanOrEqual(max);
    }
  });
});
