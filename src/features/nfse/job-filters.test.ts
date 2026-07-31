import { describe, expect, it } from "vitest";

import { jobPeriodPresets, jobSearchOr } from "./job-filters";

describe("jobSearchOr", () => {
  it("ignora termo vazio ou curto demais", () => {
    expect(jobSearchOr(null)).toBeNull();
    expect(jobSearchOr("   ")).toBeNull();
    expect(jobSearchOr("a")).toBeNull();
  });

  it("varre tomador, número, chave e charge id", () => {
    const or = jobSearchOr("guilherme");
    expect(or).toBe(
      "tomador_nome.ilike.%guilherme%," +
        "tomador_documento.ilike.%guilherme%," +
        "numero_nfse.ilike.%guilherme%," +
        "chave_nfse.ilike.%guilherme%," +
        "pagarme_charge_id.ilike.%guilherme%",
    );
  });

  it("remove os caracteres que quebram a sintaxe do or", () => {
    const or = jobSearchOr('  José (Ltda), "x"  ');
    expect(or).not.toContain("(");
    expect(or).not.toContain(")");
    expect(or).not.toContain('"');
    expect(or?.split(",").length).toBe(5);
    expect(or).toContain("tomador_nome.ilike.%José Ltda x%");
  });

  it("também casa a versão só dígitos de CPF/CNPJ pontuado", () => {
    const or = jobSearchOr("226.586.388-25");
    expect(or).toContain("tomador_documento.ilike.%22658638825%");
    expect(or).toContain("chave_nfse.ilike.%22658638825%");
  });

  it("não duplica quando o termo já é só dígitos", () => {
    const or = jobSearchOr("22658638825");
    expect(or?.split(",").length).toBe(5);
  });
});

describe("jobPeriodPresets", () => {
  // 15/07/2026 — julho tem 31 dias, junho 30.
  const reference = new Date(2026, 6, 15);

  it("usa o próprio dia no preset Hoje", () => {
    const [hoje] = jobPeriodPresets(reference);
    expect(hoje).toEqual({ label: "Hoje", from: "2026-07-15", to: "2026-07-15" });
  });

  it("conta 7 e 30 dias inclusivos até hoje", () => {
    const [, sete, trinta] = jobPeriodPresets(reference);
    expect(sete.from).toBe("2026-07-09");
    expect(sete.to).toBe("2026-07-15");
    expect(trinta.from).toBe("2026-06-16");
    expect(trinta.to).toBe("2026-07-15");
  });

  it("cobre o mês corrente e o anterior por inteiro", () => {
    const presets = jobPeriodPresets(reference);
    expect(presets[3]).toMatchObject({ from: "2026-07-01", to: "2026-07-31" });
    expect(presets[4]).toMatchObject({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("vira o ano quando a referência é janeiro", () => {
    const presets = jobPeriodPresets(new Date(2026, 0, 10));
    expect(presets[4]).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
  });
});
