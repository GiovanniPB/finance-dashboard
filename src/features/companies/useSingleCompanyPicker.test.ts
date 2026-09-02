import { describe, expect, it } from "vitest";

import { resolvePickedCompany } from "./useSingleCompanyPicker";

describe("resolvePickedCompany", () => {
  const GRUPO = ["a", "c"];

  it("respeita a escolha manual quando ela está no escopo", () => {
    expect(resolvePickedCompany("c", GRUPO, null)).toBe("c");
  });

  it("descarta a escolha que saiu do escopo", () => {
    // Cenário: a pessoa escolheu a RCO no consolidado e depois trocou para um grupo
    // que não tem a RCO. Manter a escolha gravaria numa empresa fora do recorte.
    expect(resolvePickedCompany("r", GRUPO, null)).toBe("a");
  });

  it("prefere a empresa única do escopo à primeira da lista", () => {
    expect(resolvePickedCompany(null, ["c"], "c")).toBe("c");
  });

  it("cai na primeira empresa do escopo quando não há empresa única", () => {
    expect(resolvePickedCompany(null, GRUPO, null)).toBe("a");
  });

  it("devolve nulo quando o escopo não tem empresa alguma", () => {
    expect(resolvePickedCompany(null, [], null)).toBeNull();
    expect(resolvePickedCompany("a", [], null)).toBeNull();
  });
});
