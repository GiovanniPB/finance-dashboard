import { describe, expect, it } from "vitest";

import { decidirSobreConector } from "./clientes.ts";

describe("decidirSobreConector", () => {
  it("deixa passar conector desconhecido — com registro dinâmico, cada conexão gera um id novo", () => {
    expect(decidirSobreConector("cli_novo_em_folha", null)).toBeNull();
  });

  it("deixa passar conector cadastrado e ativo", () => {
    expect(decidirSobreConector("cli_1", { nome: "Claude", ativo: true })).toBeNull();
  });

  it("barra conector desativado, dizendo o nome", () => {
    const motivo = decidirSobreConector("cli_1", { nome: "Claude", ativo: false });
    expect(motivo).toMatch(/"Claude" foi desativado/);
  });

  it("barra token sem client_id — não veio do fluxo de consentimento", () => {
    expect(decidirSobreConector(undefined, null)).toMatch(/só atende conectores OAuth/);
  });

  it("token sem client_id é barrado mesmo que exista registro ativo", () => {
    expect(decidirSobreConector(undefined, { nome: "Claude", ativo: true })).not.toBeNull();
  });
});
