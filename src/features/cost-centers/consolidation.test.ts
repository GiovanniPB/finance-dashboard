import { describe, expect, it } from "vitest";

import { groupByConsolidationKey, type ConsolidatedCostCenterRow } from "./api";

const row = (
  id: string,
  companyId: string,
  name: string,
  opts?: { consolidatedName?: string; mergeGroupId?: string },
): ConsolidatedCostCenterRow => ({
  id,
  company_id: companyId,
  name,
  consolidated_name: opts?.consolidatedName ?? name,
  consolidation_key: (opts?.consolidatedName ?? name).trim().toLocaleLowerCase(),
  merge_group_id: opts?.mergeGroupId ?? null,
});

describe("groupByConsolidationKey", () => {
  it("junta o mesmo nome de empresas diferentes numa chave", () => {
    const groups = groupByConsolidationKey([
      row("cc1", "a", "Capex"),
      row("cc2", "c", "Capex"),
      row("cc3", "r", "Capex"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m) => m.companyId)).toEqual(["a", "c", "r"]);
  });

  it("normaliza caixa e espaço, como o índice do banco", () => {
    // `cost_centers_company_name_active_uniq` usa lower(btrim(name)); a chave da view
    // é a mesma expressão, então " CAPEX " e "capex" precisam cair juntos.
    const groups = groupByConsolidationKey([row("cc1", "a", " CAPEX "), row("cc2", "c", "capex")]);

    expect(groups).toHaveLength(1);
  });

  it("nome divergente fica em chave separada — é o comportamento honesto", () => {
    // O caso real do grupo: a OTM Corretora prefixa os centros dela.
    const groups = groupByConsolidationKey([
      row("cc1", "a", "Capex"),
      row("cc2", "c", "otm corretora - capex"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.key).sort()).toEqual(["capex", "otm corretora - capex"]);
  });

  it("fusão manual reúne nomes divergentes sob o nome do grupo", () => {
    const groups = groupByConsolidationKey([
      row("cc1", "a", "Capex", { consolidatedName: "Capex", mergeGroupId: "mg1" }),
      row("cc2", "c", "otm corretora - capex", {
        consolidatedName: "Capex",
        mergeGroupId: "mg1",
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Capex");
    expect(groups[0].mergeGroupId).toBe("mg1");
  });

  it("preserva o nome de cada empresa, para a UI mostrar o que foi fundido", () => {
    const groups = groupByConsolidationKey([
      row("cc1", "a", "Capex", { consolidatedName: "Capex", mergeGroupId: "mg1" }),
      row("cc2", "c", "otm corretora - capex", {
        consolidatedName: "Capex",
        mergeGroupId: "mg1",
      }),
    ]);

    expect(groups[0].members.map((m) => m.name)).toEqual(["Capex", "otm corretora - capex"]);
  });

  it("descarta linha sem id ou sem empresa em vez de inventar membro", () => {
    const groups = groupByConsolidationKey([
      row("cc1", "a", "Capex"),
      { ...row("x", "a", "Capex"), id: null },
      { ...row("y", "a", "Capex"), company_id: null },
    ]);

    expect(groups[0].members).toHaveLength(1);
  });

  it("lista vazia devolve nenhum grupo", () => {
    expect(groupByConsolidationKey([])).toEqual([]);
  });
});
