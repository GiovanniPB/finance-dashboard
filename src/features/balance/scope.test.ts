import { describe, expect, it } from "vitest";

import { balanceScopeFrom, balanceScopeKey } from "./scope";

describe("balanceScopeFrom", () => {
  it("empresa selecionada usa o modelo daquela empresa", () => {
    expect(
      balanceScopeFrom({ scopeKind: "company", selectedCompanyId: "a", selectedGroupId: null }),
    ).toEqual({ kind: "company", companyId: "a" });
  });

  it("grupo selecionado usa o modelo do grupo", () => {
    expect(
      balanceScopeFrom({ scopeKind: "group", selectedCompanyId: null, selectedGroupId: "g1" }),
    ).toEqual({ kind: "group", groupId: "g1" });
  });

  it("consolidado usa o modelo da organização", () => {
    expect(
      balanceScopeFrom({
        scopeKind: "consolidated",
        selectedCompanyId: null,
        selectedGroupId: null,
      }),
    ).toEqual({ kind: "consolidated" });
  });

  it("grupo sem id resolvido cai em consolidado, não em empresa", () => {
    // Acontece na janela em que os grupos ainda estão carregando. Cair em "empresa"
    // aqui abriria o modelo de uma empresa sob o rótulo do grupo.
    expect(
      balanceScopeFrom({ scopeKind: "group", selectedCompanyId: null, selectedGroupId: null }),
    ).toEqual({ kind: "consolidated" });
  });
});

describe("balanceScopeKey", () => {
  it("distingue os três escopos", () => {
    const keys = [
      balanceScopeKey({ kind: "company", companyId: "a" }),
      balanceScopeKey({ kind: "group", groupId: "a" }),
      balanceScopeKey({ kind: "consolidated" }),
    ];

    // Mesma string "a" em escopos diferentes NÃO pode gerar a mesma chave de cache —
    // seria o modelo de uma empresa aparecendo como o modelo de um grupo.
    expect(new Set(keys).size).toBe(3);
  });
});
