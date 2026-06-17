import { describe, expect, it } from "vitest";

import { mapFocusStatus } from "./focus.ts";

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
