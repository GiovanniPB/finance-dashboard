import { describe, expect, it } from "vitest";

import type { ConsolidatedCostCenter } from "@/features/cost-centers/api";

import {
  nameForCostCenterId,
  optionsFromConsolidated,
  optionsFromCostCenters,
} from "./costCenterOptions";

const consolidated = (
  key: string,
  name: string,
  members: { id: string; companyId: string; name: string }[],
): ConsolidatedCostCenter => ({ key, name, mergeGroupId: null, members });

describe("optionsFromCostCenters (escopo de uma empresa)", () => {
  it("cada centro é uma opção de um id só", () => {
    const [opt] = optionsFromCostCenters([{ id: "cc1", name: "Capex" }]);

    expect(opt).toEqual({
      id: "cc1",
      name: "Capex",
      costCenterIds: ["cc1"],
      companiesCount: 1,
      memberNames: ["Capex"],
    });
  });
});

describe("optionsFromConsolidated (escopo com várias)", () => {
  const grupo = consolidated("capex", "Capex", [
    { id: "cc1", companyId: "a", name: "Capex" },
    { id: "cc2", companyId: "c", name: "otm corretora - capex" },
  ]);

  it("a opção representa TODOS os centros da chave", () => {
    const [opt] = optionsFromConsolidated([grupo]);

    // É isto que permite uma linha do balanço somar o mesmo conceito em N empresas:
    // o modelo sempre guardou `costCenterIds`, então a linha de grupo cabe no formato.
    expect(opt.costCenterIds).toEqual(["cc1", "cc2"]);
    expect(opt.id).toBe("capex");
  });

  it("conta empresas distintas, não centros", () => {
    const doisNaMesma = consolidated("geral", "Geral", [
      { id: "cc1", companyId: "a", name: "Geral" },
      { id: "cc2", companyId: "a", name: "Geral" },
    ]);

    expect(optionsFromConsolidated([doisNaMesma])[0].companiesCount).toBe(1);
  });

  it("expõe só as grafias DIFERENTES do nome consolidado", () => {
    // A UI mostra "inclui: …" para a pessoa conferir a fusão; repetir o nome
    // consolidado nessa lista seria ruído.
    expect(optionsFromConsolidated([grupo])[0].memberNames).toEqual(["otm corretora - capex"]);
  });

  it("sem divergência, não há nada a listar", () => {
    const igual = consolidated("capex", "Capex", [
      { id: "cc1", companyId: "a", name: "Capex" },
      { id: "cc2", companyId: "c", name: "Capex" },
    ]);

    expect(optionsFromConsolidated([igual])[0].memberNames).toEqual([]);
  });
});

describe("nameForCostCenterId", () => {
  const options = optionsFromConsolidated([
    consolidated("capex", "Capex", [
      { id: "cc1", companyId: "a", name: "Capex" },
      { id: "cc2", companyId: "c", name: "otm corretora - capex" },
    ]),
  ]);

  it("acha o nome por PERTENCIMENTO, não por igualdade de id", () => {
    // A opção tem id "capex" (a chave), então buscar por id do centro falharia.
    expect(nameForCostCenterId(options, "cc2")).toBe("Capex");
  });

  it("devolve nulo para centro que saiu do escopo", () => {
    // O modelo pode citar um centro desativado ou de empresa fora do recorte; a UI
    // precisa dizer isso em vez de mostrar um uuid cru.
    expect(nameForCostCenterId(options, "removido")).toBeNull();
  });
});
