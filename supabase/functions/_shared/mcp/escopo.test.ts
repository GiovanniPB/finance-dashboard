import { describe, expect, it } from "vitest";

import { resolverEscopo } from "./escopo.ts";
import { fakeDataSource } from "./fixtures.ts";

const EMPRESA = "11111111-2222-3333-4444-555555555555";
const ORG = "99999999-8888-7777-6666-555555555555";

describe("resolverEscopo", () => {
  it("com company_id não vai ao banco", async () => {
    const ds = fakeDataSource();
    const escopo = await resolverEscopo(ds, { companyId: EMPRESA });

    expect(escopo.companyIds).toEqual([EMPRESA]);
    expect(escopo.consolidado).toBe(false);
    expect(ds.queries).toHaveLength(0);
  });

  it("com organization_id resolve as empresas da organização", async () => {
    const ds = fakeDataSource({
      query: {
        companies: [
          { id: "empresa-a", organization_id: ORG },
          { id: "empresa-b", organization_id: ORG },
        ],
      },
    });

    const escopo = await resolverEscopo(ds, { organizationId: ORG });

    expect(escopo.companyIds).toEqual(["empresa-a", "empresa-b"]);
    expect(escopo.consolidado).toBe(true);
  });

  it("só considera empresa ativa ao consolidar", async () => {
    const ds = fakeDataSource({ query: { companies: [{ id: "a", organization_id: ORG }] } });
    await resolverEscopo(ds, { organizationId: ORG });

    expect(ds.queries[0].filters).toEqual([
      { column: "organization_id", op: "eq", value: ORG },
      { column: "is_active", op: "eq", value: true },
    ]);
  });

  it("avisa que o consolidado pode ser parcial por permissão", async () => {
    const ds = fakeDataSource({ query: { companies: [{ id: "a", organization_id: ORG }] } });
    const escopo = await resolverEscopo(ds, { organizationId: ORG });

    expect(escopo.avisos.join(" ")).toMatch(/parcial/i);
  });

  it("recusa organização sem nenhuma empresa visível em vez de responder zero", async () => {
    // Zero empresas é indistinguível de "id errado" e de "sem permissão". Responder
    // R$ 0,00 seria a pior das três saídas.
    const ds = fakeDataSource({ query: { companies: [] } });

    await expect(resolverEscopo(ds, { organizationId: ORG })).rejects.toThrow(/list_companies/);
  });

  it("exige um dos dois escopos", async () => {
    await expect(resolverEscopo(fakeDataSource(), {})).rejects.toThrow(/company_id/);
  });
});
