import { describe, expect, it } from "vitest";

import { focusEmitPath, focusQueryPath, focusResourceFor } from "./builder.ts";

describe("registry de documento fiscal → endpoint Focus", () => {
  it("mapeia o recurso por tipo", () => {
    expect(focusResourceFor("nfse")).toBe("nfse");
    expect(focusResourceFor("nfe")).toBe("nfe");
  });

  it("monta o caminho de emissão (POST) com a ref", () => {
    expect(focusEmitPath("nfse", "abc123")).toBe("/v2/nfse?ref=abc123");
    expect(focusEmitPath("nfe", "abc123")).toBe("/v2/nfe?ref=abc123");
  });

  it("monta o caminho de consulta (GET) com a ref", () => {
    expect(focusQueryPath("nfse", "abc123")).toBe("/v2/nfse/abc123");
    expect(focusQueryPath("nfe", "abc123")).toBe("/v2/nfe/abc123");
  });
});
