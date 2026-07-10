import { describe, expect, it } from "vitest";

import { hasFocusError, mapFocusStatus } from "./focus.ts";

describe("mapFocusStatus", () => {
  it("mapeia os status do Focus para invoice_job_status", () => {
    expect(mapFocusStatus("autorizado")).toBe("authorized");
    expect(mapFocusStatus("erro_autorizacao")).toBe("rejected");
    expect(mapFocusStatus("cancelado")).toBe("cancelled");
    expect(mapFocusStatus("processando_autorizacao")).toBe("processing_authorization");
  });

  it("retorna null para status desconhecido ou nulo (não altera o job)", () => {
    expect(mapFocusStatus("status_estranho")).toBeNull();
    expect(mapFocusStatus(null)).toBeNull();
  });
});

describe("hasFocusError", () => {
  it("NÃO considera erro um corpo vazio ou nulo (evita rejeição falsa)", () => {
    expect(hasFocusError({})).toBe(false);
    expect(hasFocusError(null)).toBe(false);
    expect(hasFocusError({ erros: {} })).toBe(false);
    expect(hasFocusError({ erros: [] })).toBe(false);
  });

  it("considera erro quando há erros preenchidos, código ou mensagem", () => {
    expect(hasFocusError({ erros: [{ campo: "x", mensagem: "y" }] })).toBe(true);
    expect(hasFocusError({ codigo: "erro_validacao_schema" })).toBe(true);
    expect(hasFocusError({ mensagem: "Erro na validação do Schema XML" })).toBe(true);
  });
});
