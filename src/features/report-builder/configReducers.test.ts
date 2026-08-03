import { describe, expect, it } from "vitest";

import { createBlock } from "./blocks/catalog";
import {
  addBlock,
  insertBlockAfter,
  moveBlock,
  pruneIncompatibleBlocks,
  removeBlock,
  reorderBlocks,
  replaceBlocks,
  setComparison,
  setPeriod,
  setScope,
  updateBlockOptions,
  updateDocument,
} from "./configReducers";
import { emptyReportConfig, type ReportConfig } from "./schema";

const ORG = "00000000-0000-0000-0000-000000000001";
const COMPANY = "11111111-1111-1111-1111-111111111111";

function baseConfig(): ReportConfig {
  return emptyReportConfig({ organizationId: ORG, companyId: COMPANY, mode: "company" });
}

function withBlocks(types: Parameters<typeof createBlock>[0][]): ReportConfig {
  return {
    ...baseConfig(),
    blocks: types.map((type, i) => createBlock(type, `${type}-${i}`)),
  };
}

function ids(config: ReportConfig): string[] {
  return config.blocks.map((b) => b.instanceId);
}

describe("addBlock", () => {
  it("acrescenta ao fim", () => {
    const result = addBlock(withBlocks(["cover"]), "dre", "dre-1");

    expect(ids(result)).toEqual(["cover-0", "dre-1"]);
  });

  it("aplica os defaults do catálogo", () => {
    const result = addBlock(baseConfig(), "counterparties", "cp");

    expect(result.blocks[0]?.options.topN).toBe(15);
  });

  it("não muta a config original", () => {
    const original = withBlocks(["cover"]);
    addBlock(original, "dre", "dre-1");

    expect(original.blocks).toHaveLength(1);
  });

  it("respeita o limite de blocos", () => {
    const full = {
      ...baseConfig(),
      blocks: Array.from({ length: 60 }, (_, i) => createBlock("page-break", `p${i}`)),
    };
    const result = addBlock(full, "dre", "dre-1");

    expect(result.blocks).toHaveLength(60);
    expect(result).toBe(full);
  });
});

describe("insertBlockAfter", () => {
  it("insere logo depois do bloco indicado", () => {
    const result = insertBlockAfter(withBlocks(["cover", "dre"]), "notes", "cover-0", "n1");

    expect(ids(result)).toEqual(["cover-0", "n1", "dre-1"]);
  });

  it("cai para o fim quando a referência não existe", () => {
    const result = insertBlockAfter(withBlocks(["cover"]), "notes", "inexistente", "n1");

    expect(ids(result)).toEqual(["cover-0", "n1"]);
  });
});

describe("removeBlock", () => {
  it("remove pelo instanceId", () => {
    const result = removeBlock(withBlocks(["cover", "dre"]), "cover-0");

    expect(ids(result)).toEqual(["dre-1"]);
  });

  it("devolve a mesma referência quando não acha", () => {
    const config = withBlocks(["cover"]);

    expect(removeBlock(config, "nada")).toBe(config);
  });

  it("remove só a instância pedida, não o tipo", () => {
    const config = {
      ...baseConfig(),
      blocks: [createBlock("dre", "a"), createBlock("dre", "b")],
    };

    expect(ids(removeBlock(config, "a"))).toEqual(["b"]);
  });
});

describe("moveBlock", () => {
  it("sobe um bloco", () => {
    const result = moveBlock(withBlocks(["cover", "dre", "notes"]), "dre-1", "up");

    expect(ids(result)).toEqual(["dre-1", "cover-0", "notes-2"]);
  });

  it("desce um bloco", () => {
    const result = moveBlock(withBlocks(["cover", "dre", "notes"]), "dre-1", "down");

    expect(ids(result)).toEqual(["cover-0", "notes-2", "dre-1"]);
  });

  it("não faz nada no topo", () => {
    const config = withBlocks(["cover", "dre"]);

    expect(moveBlock(config, "cover-0", "up")).toBe(config);
  });

  it("não faz nada no fim", () => {
    const config = withBlocks(["cover", "dre"]);

    expect(moveBlock(config, "dre-1", "down")).toBe(config);
  });

  it("ignora id inexistente", () => {
    const config = withBlocks(["cover"]);

    expect(moveBlock(config, "nada", "up")).toBe(config);
  });
});

describe("reorderBlocks", () => {
  it("move de um índice para outro", () => {
    const result = reorderBlocks(withBlocks(["cover", "dre", "notes"]), 2, 0);

    expect(result.blocks[0]?.type).toBe("notes");
    expect(ids(result)).toEqual(["notes-2", "cover-0", "dre-1"]);
  });

  it("aceita mover para o fim", () => {
    const result = reorderBlocks(withBlocks(["cover", "dre", "notes"]), 0, 2);

    expect(ids(result)).toEqual(["dre-1", "notes-2", "cover-0"]);
  });

  it("ignora índices iguais ou fora da faixa", () => {
    const config = withBlocks(["cover", "dre"]);

    expect(reorderBlocks(config, 1, 1)).toBe(config);
    expect(reorderBlocks(config, -1, 0)).toBe(config);
    expect(reorderBlocks(config, 0, 9)).toBe(config);
  });
});

describe("updateBlockOptions", () => {
  it("mescla o patch nas opções", () => {
    const config = withBlocks(["counterparties"]);
    const result = updateBlockOptions(config, "counterparties-0", { topN: 5 });

    expect(result.blocks[0]?.options.topN).toBe(5);
    expect(result.blocks[0]?.options.counterpartyKind).toBe("all");
  });

  it("não afeta outras instâncias", () => {
    const config = {
      ...baseConfig(),
      blocks: [createBlock("dre", "a"), createBlock("dre", "b")],
    };
    const result = updateBlockOptions(config, "a", { includeCashColumn: false });

    expect(result.blocks[0]?.options.includeCashColumn).toBe(false);
    expect(result.blocks[1]?.options.includeCashColumn).toBe(true);
  });

  it("devolve a mesma referência quando não acha o bloco", () => {
    const config = withBlocks(["dre"]);

    expect(updateBlockOptions(config, "nada", { topN: 3 })).toBe(config);
  });
});

describe("setPeriod e updateDocument", () => {
  it("troca o período", () => {
    const result = setPeriod(baseConfig(), { preset: "ytd" });

    expect(result.period.preset).toBe("ytd");
  });

  it("mescla o documento sem perder os outros campos", () => {
    const result = updateDocument(baseConfig(), { subtitle: "Diretoria" });

    expect(result.document.subtitle).toBe("Diretoria");
    expect(result.document.title).toBe("Relatório Gerencial");
    expect(result.document.showPageNumbers).toBe(true);
  });
});

describe("pruneIncompatibleBlocks", () => {
  it("não remove nada quando tudo é compatível", () => {
    const config = withBlocks(["cover", "dre"]);
    const result = pruneIncompatibleBlocks(config);

    expect(result.removed).toEqual([]);
    expect(result.config).toBe(config);
  });

  it("remove blocos por empresa ao passar para consolidado", () => {
    const config: ReportConfig = {
      ...withBlocks(["cover", "dre", "cashflow", "forecast"]),
      scope: { mode: "consolidated", companyId: null, organizationId: ORG },
    };
    const result = pruneIncompatibleBlocks(config);

    expect(result.removed).toEqual(["cashflow", "forecast"]);
    expect(result.config.blocks.map((b) => b.type)).toEqual(["cover", "dre"]);
  });

  it("remove o comparativo de DRE quando não há eixo de comparação", () => {
    const config = withBlocks(["dre-comparison"]);
    const result = pruneIncompatibleBlocks(config);

    expect(result.removed).toEqual(["dre-comparison"]);
  });

  it("não duplica tipo removido mais de uma vez", () => {
    const config: ReportConfig = {
      ...baseConfig(),
      scope: { mode: "consolidated", companyId: null, organizationId: ORG },
      blocks: [createBlock("cashflow", "a"), createBlock("cashflow", "b")],
    };

    expect(pruneIncompatibleBlocks(config).removed).toEqual(["cashflow"]);
  });
});

describe("setScope", () => {
  it("troca o escopo e poda numa só operação", () => {
    const config = withBlocks(["dre", "bank-balances"]);
    const result = setScope(config, {
      mode: "consolidated",
      companyId: null,
      organizationId: ORG,
    });

    expect(result.config.scope.mode).toBe("consolidated");
    expect(result.removed).toEqual(["bank-balances"]);
  });

  it("mantém tudo ao voltar para empresa", () => {
    const config = withBlocks(["dre", "cashflow"]);
    const result = setScope(config, { mode: "company", companyId: COMPANY, organizationId: ORG });

    expect(result.removed).toEqual([]);
    expect(result.config.blocks).toHaveLength(2);
  });
});

describe("setComparison", () => {
  it("habilita o comparativo de DRE ao escolher um eixo", () => {
    const withComparison = setComparison(withBlocks(["dre"]), "yoy");

    expect(withComparison.config.comparison).toBe("yoy");
    expect(withComparison.removed).toEqual([]);
  });

  it("remove o comparativo de DRE ao voltar para sem comparativo", () => {
    const config: ReportConfig = { ...withBlocks(["dre-comparison"]), comparison: "yoy" };
    const result = setComparison(config, "none");

    expect(result.removed).toEqual(["dre-comparison"]);
    expect(result.config.blocks).toEqual([]);
  });
});

describe("replaceBlocks", () => {
  it("substitui a composição preservando o resto", () => {
    const config = updateDocument(withBlocks(["cover"]), { subtitle: "X" });
    const result = replaceBlocks(config, [createBlock("dre", "d")]);

    expect(ids(result)).toEqual(["d"]);
    expect(result.document.subtitle).toBe("X");
    expect(result.scope.companyId).toBe(COMPANY);
  });

  it("corta no limite de blocos", () => {
    const result = replaceBlocks(
      baseConfig(),
      Array.from({ length: 70 }, (_, i) => createBlock("page-break", `p${i}`)),
    );

    expect(result.blocks).toHaveLength(60);
  });
});
