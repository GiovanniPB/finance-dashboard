import { describe, expect, it } from "vitest";

import { brandLabel, installmentOrder, paymentMethodLabel, sumAmount } from "./labels";

describe("paymentMethodLabel", () => {
  it("traduz o valor cru do gateway para português", () => {
    expect(paymentMethodLabel("credit_card")).toBe("Cartão de crédito");
    expect(paymentMethodLabel("pix")).toBe("Pix");
    expect(paymentMethodLabel("boleto")).toBe("Boleto");
  });

  it("torna legível um método que ainda não mapeamos, em vez de esconder", () => {
    expect(paymentMethodLabel("nubank_wallet")).toBe("Nubank wallet");
  });

  it("não quebra com string vazia", () => {
    expect(paymentMethodLabel("")).toBe("");
  });
});

describe("brandLabel", () => {
  it("normaliza a bandeira independente de caixa", () => {
    expect(brandLabel("visa")).toBe("Visa");
    expect(brandLabel("MASTERCARD")).toBe("Mastercard");
  });

  it("preserva o rótulo de venda sem cartão", () => {
    expect(brandLabel("não-cartão")).toBe("Não-cartão");
  });
});

describe("installmentOrder", () => {
  it("põe à vista antes de qualquer parcelamento", () => {
    expect(installmentOrder("à vista")).toBeLessThan(installmentOrder("2x"));
  });

  it("ordena numericamente, não alfabeticamente", () => {
    // o bug clássico: "10x" < "2x" em ordenação de texto
    expect(installmentOrder("2x")).toBeLessThan(installmentOrder("10x"));
    expect(installmentOrder("10x")).toBeLessThan(installmentOrder("12x"));
  });

  it("manda rótulo desconhecido para o fim da sequência", () => {
    expect(installmentOrder("desconhecido")).toBeGreaterThan(installmentOrder("12x"));
  });

  it("ordena a série inteira na ordem natural", () => {
    const embaralhado = ["12x", "à vista", "desconhecido", "3x", "10x", "2x"];
    const ordenado = [...embaralhado].sort((a, b) => installmentOrder(a) - installmentOrder(b));
    expect(ordenado).toEqual(["à vista", "2x", "3x", "10x", "12x", "desconhecido"]);
  });
});

describe("sumAmount", () => {
  it("soma os valores das linhas", () => {
    expect(
      sumAmount([
        { label: "a", amount: 10.5, salesCount: 1 },
        { label: "b", amount: 4.5, salesCount: 2 },
      ]),
    ).toBe(15);
  });

  it("devolve zero quando ainda não há dado", () => {
    expect(sumAmount(undefined)).toBe(0);
    expect(sumAmount([])).toBe(0);
  });
});
