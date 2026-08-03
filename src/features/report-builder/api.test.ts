/**
 * O que interessa aqui não é o cliente Supabase, é a **fronteira de serialização**:
 * a config vai para o banco como JSON e volta como `unknown`. Se um round-trip
 * perder ou corromper campo, o template salvo abre errado — e isso passaria por
 * qualquer teste que só olhasse a chamada HTTP.
 */
import { describe, expect, it } from "vitest";

import { createBlock } from "./blocks/catalog";
import { emptyReportConfig, parseReportConfig, type ReportConfig } from "./schema";

const ORG = "00000000-0000-0000-0000-000000000001";
const COMPANY = "11111111-1111-1111-1111-111111111111";

function fullConfig(): ReportConfig {
  const base = emptyReportConfig({ organizationId: ORG, companyId: COMPANY, mode: "company" });
  return {
    ...base,
    period: { preset: "custom", from: "2026-01-01", to: "2026-07-31" },
    comparison: "mom",
    document: {
      title: "Relatório Gerencial Mensal",
      subtitle: "Diretoria",
      showPageNumbers: false,
      showRunningHeader: true,
      confidentialityNote: "Uso restrito",
    },
    blocks: [
      createBlock("cover", "c1"),
      {
        instanceId: "n1",
        type: "notes",
        options: { heading: "Notas", text: "Texto com acento ç" },
      },
      {
        instanceId: "cp1",
        type: "counterparties",
        options: { topN: 7, counterpartyKind: "supplier" },
      },
      { instanceId: "cf1", type: "cashflow", options: { granularity: "daily", showTable: true } },
      { instanceId: "d1", type: "dre", options: { includeCashColumn: false } },
    ],
  };
}

/** Simula ida e volta pelo Postgres: serializa como jsonb e lê de volta. */
function roundTrip(config: ReportConfig): ReportConfig | null {
  return parseReportConfig(JSON.parse(JSON.stringify(config)) as unknown);
}

describe("round-trip da config pelo banco", () => {
  it("preserva a config inteira", () => {
    const original = fullConfig();
    const restored = roundTrip(original);

    expect(restored).not.toBeNull();
    expect(restored).toEqual(original);
  });

  it("preserva as datas do período personalizado", () => {
    const restored = roundTrip(fullConfig());

    expect(restored?.period).toEqual({
      preset: "custom",
      from: "2026-01-01",
      to: "2026-07-31",
    });
  });

  it("preserva as opções de cada bloco, incluindo booleanos falsos", () => {
    const restored = roundTrip(fullConfig());
    const dre = restored?.blocks.find((b) => b.instanceId === "d1");
    const counterparties = restored?.blocks.find((b) => b.instanceId === "cp1");

    // `false` sobrevivendo importa: um `?? true` no caminho apagaria a escolha.
    expect(dre?.options.includeCashColumn).toBe(false);
    expect(counterparties?.options).toEqual({ topN: 7, counterpartyKind: "supplier" });
  });

  it("preserva acentuação no texto livre", () => {
    const restored = roundTrip(fullConfig());
    const notes = restored?.blocks.find((b) => b.instanceId === "n1");

    expect(notes?.options.text).toBe("Texto com acento ç");
  });

  it("preserva a ordem dos blocos", () => {
    const restored = roundTrip(fullConfig());

    expect(restored?.blocks.map((b) => b.instanceId)).toEqual(["c1", "n1", "cp1", "cf1", "d1"]);
  });

  it("preserva showPageNumbers falso", () => {
    expect(roundTrip(fullConfig())?.document.showPageNumbers).toBe(false);
  });
});

describe("config gravada que não bate com o schema atual", () => {
  it("devolve null em vez de lançar, para a UI marcar o template", () => {
    expect(parseReportConfig({ scope: { mode: "company" } })).toBeNull();
    expect(parseReportConfig(null)).toBeNull();
    expect(parseReportConfig("{}")).toBeNull();
  });

  it("devolve null quando o tipo de bloco não existe mais", () => {
    const config = fullConfig();
    const comBlocoRemovido = {
      ...config,
      blocks: [...config.blocks, { instanceId: "x", type: "bloco-que-foi-removido", options: {} }],
    };

    expect(parseReportConfig(comBlocoRemovido)).toBeNull();
  });

  it("aceita config sem `version` (gravada antes do campo existir)", () => {
    const { version: _version, ...semVersao } = fullConfig();

    expect(parseReportConfig(semVersao)).not.toBeNull();
  });
});
