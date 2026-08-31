import { describe, expect, it } from "vitest";

import { modulosConcedidos, resumirAcesso } from "./consent";

const empresas = [
  { id: "1", nome: "OTM Assessoria" },
  { id: "2", nome: "OTM Corretora" },
];

describe("modulosConcedidos", () => {
  it("super admin recebe todos os módulos", () => {
    expect(modulosConcedidos(true, ["financials"])).toHaveLength(6);
  });

  it("visibleModules nulo significa sem restrição", () => {
    expect(modulosConcedidos(false, null)).toHaveLength(6);
  });

  it("allow-list limita e preserva a ordem canônica", () => {
    expect(modulosConcedidos(false, ["taxes", "financials"])).toEqual(["financials", "taxes"]);
  });

  it("allow-list vazia não concede nada", () => {
    expect(modulosConcedidos(false, [])).toEqual([]);
  });
});

describe("resumirAcesso", () => {
  it("descreve leitura, empresas e módulos em português", () => {
    const r = resumirAcesso({
      empresas,
      isSuperAdmin: false,
      visibleModules: ["financials", "taxes"],
    });
    expect(r.resumo).toContain("2 empresas");
    expect(r.resumo).toContain("Financeiro e Impostos");
    expect(r.resumo).toContain("Não poderá criar, alterar nem apagar nada.");
  });

  it("usa o nome quando é uma empresa só", () => {
    const r = resumirAcesso({
      empresas: [empresas[0]],
      isSuperAdmin: false,
      visibleModules: null,
    });
    expect(r.resumo).toContain("a empresa OTM Assessoria");
  });

  it("é explícito quando o usuário não tem empresa alguma", () => {
    const r = resumirAcesso({ empresas: [], isSuperAdmin: false, visibleModules: [] });
    expect(r.resumo).toContain("nenhuma empresa");
    expect(r.resumo).toContain("módulos nada");
  });

  it("somente leitura não é opcional", () => {
    const r = resumirAcesso({ empresas, isSuperAdmin: true, visibleModules: null });
    expect(r.somenteLeitura).toBe(true);
  });
});
