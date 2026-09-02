import { describe, expect, it } from "vitest";

import type { CompanyGroup } from "@/features/company-groups/api";

import type { Company } from "./api";
import { CONSOLIDATED_KEY, groupScopeKey, resolveScope } from "./resolveScope";

const company = (id: string, name: string, isHolding = false): Company =>
  ({
    id,
    legal_name: `${name} LTDA`,
    trade_name: name,
    is_holding: isHolding,
    is_active: true,
    organization_id: "org",
    sort_order: 0,
  }) as Company;

const HOLDING = company("h", "OTM Holding", true);
const ASSESSORIA = company("a", "OTM Assessoria");
const CORRETORA = company("c", "OTM Corretora");
const RCO = company("r", "RCO Tecnologia");
const COMPANIES = [HOLDING, ASSESSORIA, CORRETORA, RCO];

const group = (id: string, name: string, companyIds: string[]): CompanyGroup =>
  ({ id, name, companyIds, organization_id: "org", description: null }) as CompanyGroup;

const OTM = group("g1", "OTM sem Jimmy", ["a", "c"]);

const resolve = (scopeKey: string, opts?: { groups?: CompanyGroup[]; groupsLoading?: boolean }) =>
  resolveScope({
    scopeKey,
    companies: COMPANIES,
    groups: opts?.groups ?? [OTM],
    groupsLoading: opts?.groupsLoading ?? false,
  });

describe("resolveScope · consolidado", () => {
  it("não aplica recorte: companyIds nulo deixa a RLS decidir", () => {
    const scope = resolve(CONSOLIDATED_KEY);

    expect(scope.kind).toBe("consolidated");
    expect(scope.companyIds).toBeNull();
    expect(scope.label).toBe("Consolidado");
  });

  it("exclui a holding das empresas do escopo", () => {
    expect(resolve(CONSOLIDATED_KEY).scopeCompanies.map((c) => c.id)).toEqual(["a", "c", "r"]);
  });

  it("cai em consolidado quando a chave não corresponde a nada", () => {
    expect(resolve("empresa-que-nao-existe").kind).toBe("consolidated");
  });
});

describe("resolveScope · empresa", () => {
  it("recorta exatamente aquela empresa", () => {
    const scope = resolve("c");

    expect(scope.kind).toBe("company");
    expect(scope.company?.id).toBe("c");
    expect(scope.companyIds).toEqual(["c"]);
    expect(scope.label).toBe("OTM Corretora");
  });

  it("aceita a holding quando escolhida explicitamente", () => {
    // Consolidado exclui a holding, mas escolher a holding no seletor é intencional.
    const scope = resolve("h");

    expect(scope.kind).toBe("company");
    expect(scope.companyIds).toEqual(["h"]);
  });
});

describe("resolveScope · grupo", () => {
  it("recorta só as empresas do grupo", () => {
    const scope = resolve(groupScopeKey("g1"));

    expect(scope.kind).toBe("group");
    expect(scope.companyIds).toEqual(["a", "c"]);
    expect(scope.label).toBe("OTM sem Jimmy");
  });

  it("nunca expõe uma empresa como selecionada — o número é agregado", () => {
    // Se `company` viesse preenchido, telas que operam numa empresa passariam a
    // gravar/ler numa das empresas do grupo achando que é "a" empresa do escopo.
    expect(resolve(groupScopeKey("g1")).company).toBeNull();
  });

  it("lista as empresas do grupo na ordem do sistema, não na do grupo", () => {
    const invertido = group("g2", "Invertido", ["r", "a"]);
    const scope = resolve(groupScopeKey("g2"), { groups: [invertido] });

    expect(scope.scopeCompanies.map((c) => c.id)).toEqual(["a", "r"]);
  });

  it("ignora id de empresa que o grupo cita mas não está acessível", () => {
    const comFantasma = group("g3", "Com fantasma", ["a", "inexistente"]);
    const scope = resolve(groupScopeKey("g3"), { groups: [comFantasma] });

    expect(scope.scopeCompanies.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("resolveScope · grupo ainda não resolvido", () => {
  it("enquanto os grupos carregam, o recorte é VAZIO — nunca 'todas as empresas'", () => {
    // O erro que isto evita: mostrar o total das 4 empresas sob o rótulo de um
    // recorte de 2 durante o primeiro render.
    const scope = resolve(groupScopeKey("g1"), { groups: [], groupsLoading: true });

    expect(scope.kind).toBe("group");
    expect(scope.companyIds).toEqual([]);
    expect(scope.companyIds).not.toBeNull();
  });

  it("grupo que não existe mais volta para consolidado, com o rótulo trocando", () => {
    const scope = resolve(groupScopeKey("apagado"), { groups: [], groupsLoading: false });

    expect(scope.kind).toBe("consolidated");
    expect(scope.companyIds).toBeNull();
    expect(scope.label).toBe("Consolidado");
  });

  it("grupo vazio soma nada em vez de somar tudo", () => {
    const vazio = group("g4", "Vazio", []);
    const scope = resolve(groupScopeKey("g4"), { groups: [vazio] });

    expect(scope.companyIds).toEqual([]);
    expect(scope.scopeCompanies).toEqual([]);
  });
});
