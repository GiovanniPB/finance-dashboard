import { describe, expect, it } from "vitest";

import { formatDocument, isValidCNPJ, isValidCPF, isValidDocument, onlyDigits } from "./document";

describe("onlyDigits", () => {
  it("strips mask characters", () => {
    expect(onlyDigits("12.345.678/0001-95")).toBe("12345678000195");
  });
});

describe("isValidCPF", () => {
  it("accepts a valid CPF with and without mask", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("52998224725")).toBe(true);
  });

  it("rejects wrong check digits", () => {
    expect(isValidCPF("529.982.247-24")).toBe(false);
  });

  it("rejects repeated digits and wrong length", () => {
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("12345")).toBe(false);
  });
});

describe("isValidCNPJ", () => {
  it("accepts a valid CNPJ with and without mask", () => {
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(isValidCNPJ("11222333000181")).toBe(true);
  });

  it("rejects wrong check digits", () => {
    expect(isValidCNPJ("11.222.333/0001-80")).toBe(false);
  });

  it("rejects repeated digits and wrong length", () => {
    expect(isValidCNPJ("00.000.000/0000-00")).toBe(false);
    expect(isValidCNPJ("123")).toBe(false);
  });
});

describe("isValidDocument", () => {
  it("validates either CPF or CNPJ by length", () => {
    expect(isValidDocument("529.982.247-25")).toBe(true);
    expect(isValidDocument("11.222.333/0001-81")).toBe(true);
    expect(isValidDocument("529.982.247-24")).toBe(false);
    expect(isValidDocument("1234567890")).toBe(false);
  });
});

describe("formatDocument", () => {
  it("formats a CPF", () => {
    expect(formatDocument("52998224725")).toBe("529.982.247-25");
  });

  it("formats a CNPJ", () => {
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("formats partial input progressively (CPF mask until length disambiguates)", () => {
    expect(formatDocument("11222")).toBe("112.22");
    expect(formatDocument("112223330")).toBe("112.223.330");
  });
});
