import { describe, expect, it } from "vitest";

import { diffMembers } from "./api";
import { companyGroupSchema } from "./schema";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("companyGroupSchema", () => {
  it("aceita um grupo com nome e duas empresas", () => {
    const parsed = companyGroupSchema.parse({ name: " OTM sem Jimmy ", companyIds: [A, B] });
    expect(parsed.name).toBe("OTM sem Jimmy");
  });

  it("recusa grupo de uma empresa só — o seletor já tem a empresa", () => {
    const result = companyGroupSchema.safeParse({ name: "Só uma", companyIds: [A] });
    expect(result.success).toBe(false);
  });

  it("recusa grupo sem empresa", () => {
    expect(companyGroupSchema.safeParse({ name: "Vazio", companyIds: [] }).success).toBe(false);
  });

  it("recusa nome vazio ou só espaço", () => {
    expect(companyGroupSchema.safeParse({ name: "   ", companyIds: [A, B] }).success).toBe(false);
  });
});

describe("diffMembers", () => {
  it("só insere o que entrou e só apaga o que saiu", () => {
    expect(diffMembers(["a", "c"], ["a", "r"])).toEqual({ toAdd: ["r"], toRemove: ["c"] });
  });

  it("não toca em nada quando a composição não mudou", () => {
    // É o que evita um delete+insert de todos os membros a cada rename do grupo.
    expect(diffMembers(["a", "c"], ["c", "a"])).toEqual({ toAdd: [], toRemove: [] });
  });

  it("trata grupo recém-criado (sem membros) como só inserções", () => {
    expect(diffMembers([], ["a", "c"])).toEqual({ toAdd: ["a", "c"], toRemove: [] });
  });

  it("esvaziar o grupo remove todos", () => {
    expect(diffMembers(["a", "c"], [])).toEqual({ toAdd: [], toRemove: ["a", "c"] });
  });
});
