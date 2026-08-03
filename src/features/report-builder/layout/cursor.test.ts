import { describe, expect, it, vi } from "vitest";

import { LayoutCursor } from "./cursor";

/** Página fictícia de 100mm úteis (topo 10, fundo 110). */
function makeCursor(onNewPage?: (page: number) => void) {
  return new LayoutCursor({ topMm: 10, bottomMm: 110, onNewPage });
}

describe("LayoutCursor", () => {
  it("começa na página 1 no topo do conteúdo", () => {
    const cursor = makeCursor();

    expect(cursor.page).toBe(1);
    expect(cursor.y).toBe(10);
    expect(cursor.remaining()).toBe(100);
    expect(cursor.isAtPageStart()).toBe(true);
  });

  it("avança sem quebrar página quando cabe", () => {
    const onNewPage = vi.fn();
    const cursor = makeCursor(onNewPage);

    const y = cursor.take(40);

    expect(y).toBe(10);
    expect(cursor.y).toBe(50);
    expect(cursor.page).toBe(1);
    expect(onNewPage).not.toHaveBeenCalled();
  });

  it("quebra a página quando o bloco não cabe no restante", () => {
    const onNewPage = vi.fn();
    const cursor = makeCursor(onNewPage);
    cursor.take(80); // resta 20mm

    const y = cursor.take(30);

    expect(y).toBe(10);
    expect(cursor.page).toBe(2);
    expect(cursor.y).toBe(40);
    expect(onNewPage).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("considera que cabe exatamente o espaço restante", () => {
    const onNewPage = vi.fn();
    const cursor = makeCursor(onNewPage);
    cursor.take(60);

    expect(cursor.fits(40)).toBe(true);
    cursor.take(40);

    expect(cursor.page).toBe(1);
    expect(onNewPage).not.toHaveBeenCalled();
  });

  it("não quebra a página para bloco maior que a página quando já está no topo", () => {
    const onNewPage = vi.fn();
    const cursor = makeCursor(onNewPage);

    const y = cursor.reserve(250);

    expect(y).toBe(10);
    expect(cursor.page).toBe(1);
    expect(onNewPage).not.toHaveBeenCalled();
  });

  it("quebra uma única vez para bloco gigante quando não está no topo", () => {
    const onNewPage = vi.fn();
    const cursor = makeCursor(onNewPage);
    cursor.take(30);

    cursor.reserve(250);

    expect(cursor.page).toBe(2);
    expect(cursor.isAtPageStart()).toBe(true);
    expect(onNewPage).toHaveBeenCalledTimes(1);
  });

  it("reserva sem avançar", () => {
    const cursor = makeCursor();

    const y = cursor.reserve(20);

    expect(y).toBe(10);
    expect(cursor.y).toBe(10);
  });

  it("quebra página explicitamente", () => {
    const onNewPage = vi.fn();
    const cursor = makeCursor(onNewPage);
    cursor.take(20);

    cursor.newPage();

    expect(cursor.page).toBe(2);
    expect(cursor.y).toBe(10);
    expect(onNewPage).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("sincroniza com a posição final de um bloco que paginou sozinho", () => {
    const cursor = makeCursor();

    cursor.syncTo(4, 72);

    expect(cursor.page).toBe(4);
    expect(cursor.y).toBe(72);
    expect(cursor.remaining()).toBe(38);
    expect(cursor.isAtPageStart()).toBe(false);
  });

  it("acumula várias quebras ao longo de muitos blocos", () => {
    const pages: number[] = [];
    const cursor = makeCursor((p) => pages.push(p));

    for (let i = 0; i < 10; i += 1) cursor.take(45);

    // 10 blocos de 45mm em páginas de 100mm úteis → 2 por página → 5 páginas.
    expect(cursor.page).toBe(5);
    expect(pages).toEqual([2, 3, 4, 5]);
  });
});
