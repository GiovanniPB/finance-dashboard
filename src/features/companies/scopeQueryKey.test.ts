import { describe, expect, it } from "vitest";

import { scopeQueryKey } from "./scopeQueryKey";

describe("scopeQueryKey", () => {
  it("a ordem da lista não gera duas entradas para o mesmo conjunto", () => {
    expect(scopeQueryKey(["c", "a"])).toBe(scopeQueryKey(["a", "c"]));
  });

  it("consolidado (null) não colide com recorte nenhum", () => {
    // Se "todas" e "estas duas" caíssem na mesma chave, a tela mostraria o número de
    // um escopo sob o rótulo do outro.
    expect(scopeQueryKey(null)).not.toBe(scopeQueryKey(["a", "c"]));
    expect(scopeQueryKey(null)).not.toBe(scopeQueryKey([]));
  });

  it("recorte vazio tem chave própria", () => {
    expect(scopeQueryKey([])).toBe("");
  });

  it("recortes diferentes têm chaves diferentes", () => {
    expect(scopeQueryKey(["a"])).not.toBe(scopeQueryKey(["a", "c"]));
  });
});
