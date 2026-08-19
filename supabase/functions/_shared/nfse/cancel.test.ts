import { describe, expect, it } from "vitest";

import {
  assertCancelable,
  focusCancelPath,
  interpretCancelResponse,
  normalizeJustificativa,
  type CancelableJob,
} from "./cancel.ts";

function job(overrides: Partial<CancelableJob> = {}): CancelableJob {
  return {
    id: "job-1",
    document_type: "nfse",
    status: "authorized",
    focus_ref: "abc123",
    numero_nfse: "1974",
    ...overrides,
  };
}

describe("focusCancelPath", () => {
  it("monta o caminho de cancelamento da NFS-e", () => {
    expect(focusCancelPath("abc123")).toBe("/v2/nfse/abc123");
  });

  it("escapa a referência", () => {
    expect(focusCancelPath("a/b c")).toBe("/v2/nfse/a%2Fb%20c");
  });
});

describe("normalizeJustificativa", () => {
  it("aceita justificativa dentro do limite do Focus", () => {
    const r = normalizeJustificativa("Nota emitida em duplicidade pelo sistema");
    expect(r).toEqual({ ok: true, value: "Nota emitida em duplicidade pelo sistema" });
  });

  it("colapsa espaço antes de medir (espaço não é justificativa)", () => {
    expect(normalizeJustificativa(" ".repeat(40))).toEqual({
      ok: false,
      error: "justificativa_curta_min_15",
    });
  });

  it("colapsa espaço interno e apara as pontas", () => {
    const r = normalizeJustificativa("  duplicidade    de   emissao fiscal  ");
    expect(r).toEqual({ ok: true, value: "duplicidade de emissao fiscal" });
  });

  it("recusa abaixo de 15 caracteres", () => {
    expect(normalizeJustificativa("duplicada")).toEqual({
      ok: false,
      error: "justificativa_curta_min_15",
    });
  });

  it("recusa acima de 255 caracteres", () => {
    expect(normalizeJustificativa("x".repeat(256))).toEqual({
      ok: false,
      error: "justificativa_longa_max_255",
    });
  });

  it("aceita exatamente nos limites", () => {
    expect(normalizeJustificativa("x".repeat(15)).ok).toBe(true);
    expect(normalizeJustificativa("x".repeat(255)).ok).toBe(true);
  });

  it("recusa entrada que não é string", () => {
    expect(normalizeJustificativa(undefined)).toEqual({
      ok: false,
      error: "justificativa_obrigatoria",
    });
  });
});

describe("assertCancelable", () => {
  it("aceita NFS-e autorizada com referência", () => {
    expect(assertCancelable(job())).toEqual({ ok: true });
  });

  it("recusa NF-e (contrato próprio, prazo de 24h)", () => {
    expect(assertCancelable(job({ document_type: "nfe" }))).toEqual({
      ok: false,
      error: "document_type_nao_suportado",
    });
  });

  it("recusa job que não está autorizado", () => {
    expect(assertCancelable(job({ status: "pending_review" }))).toEqual({
      ok: false,
      error: "status_nao_cancelavel_pending_review",
    });
    expect(assertCancelable(job({ status: "cancelled" }))).toEqual({
      ok: false,
      error: "status_nao_cancelavel_cancelled",
    });
  });

  it("recusa job sem focus_ref", () => {
    expect(assertCancelable(job({ focus_ref: null }))).toEqual({
      ok: false,
      error: "sem_focus_ref",
    });
  });
});

describe("interpretCancelResponse", () => {
  it("só trata 'cancelado' como sucesso", () => {
    const r = interpretCancelResponse(200, { status: "cancelado" });
    expect(r.outcome).toBe("cancelled");
    expect(r.doc).toEqual({ status: "cancelado" });
  });

  it("trata recusa da prefeitura como refused e preserva os erros", () => {
    const body = { status: "erro_cancelamento", erros: [{ mensagem: "fora do prazo" }] };
    const r = interpretCancelResponse(200, body);
    expect(r.outcome).toBe("refused");
    expect(r.doc).toEqual(body);
  });

  it("mapeia 404 para not_found", () => {
    expect(interpretCancelResponse(404, null).outcome).toBe("not_found");
  });

  it("mapeia 400 para refused", () => {
    expect(interpretCancelResponse(400, { mensagem: "nao autorizada" }).outcome).toBe("refused");
  });

  it("NÃO decide localmente quando a resposta é ambígua", () => {
    // 2xx sem status reconhecível, 5xx e corpo ilegível têm de sobrar para o
    // reconcile: adivinhar aqui é o que gera nota fantasma.
    expect(interpretCancelResponse(200, {}).outcome).toBe("ambiguous");
    expect(interpretCancelResponse(200, null).outcome).toBe("ambiguous");
    expect(interpretCancelResponse(500, null).outcome).toBe("ambiguous");
    expect(interpretCancelResponse(502, { status: "qualquer_coisa" }).outcome).toBe("ambiguous");
  });

  it("não devolve doc quando não há o que aplicar", () => {
    expect(interpretCancelResponse(500, null).doc).toBeNull();
    expect(interpretCancelResponse(404, null).doc).toBeNull();
  });
});
