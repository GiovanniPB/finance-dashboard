import { describe, expect, it } from "vitest";

import { classifyEvent, emitsFiscalDocument, knownEventTypes } from "./events.ts";

describe("classifyEvent — invariante fiscal", () => {
  it("SÓ charge.paid emite nota fiscal", () => {
    // Esta é a proteção da esteira de NFS-e, que está em produção: nenhum evento
    // adicionado para o ledger de vendas pode disparar emissão.
    const emitem = knownEventTypes().filter((t) => emitsFiscalDocument(t));

    expect(emitem).toEqual(["charge.paid"]);
  });

  it("nenhum evento desconhecido emite nota", () => {
    for (const tipo of [
      "charge.antifraud_approved",
      "order.paid",
      "subscription.created",
      "invoice.paid",
      "checkout.closed",
      "tipo.que.nao.existe",
      "",
    ]) {
      expect(emitsFiscalDocument(tipo)).toBe(false);
    }
  });
});

describe("classifyEvent — roteamento", () => {
  it("charge.paid grava a venda, o cliente e materializa o cronograma", () => {
    expect(classifyEvent("charge.paid")).toEqual({
      upsertCharge: true,
      upsertCustomer: true,
      upsertSubscription: false,
      syncPayables: true,
      explodeFiscal: true,
    });
  });

  it("cobrança recusada grava a venda mas não busca recebíveis", () => {
    const acao = classifyEvent("charge.payment_failed");

    expect(acao.upsertCharge).toBe(true);
    expect(acao.syncPayables).toBe(false); // não há dinheiro a liquidar
    expect(acao.explodeFiscal).toBe(false);
  });

  it("estorno e chargeback re-sincronizam os recebíveis", () => {
    for (const tipo of [
      "charge.refunded",
      "charge.chargedback",
      "charge.partial_canceled",
      "charge.underpaid",
      "charge.overpaid",
    ]) {
      const acao = classifyEvent(tipo);
      expect(acao.syncPayables, tipo).toBe(true);
      expect(acao.upsertCharge, tipo).toBe(true);
      expect(acao.explodeFiscal, tipo).toBe(false);
    }
  });

  it("eventos de assinatura só tocam a assinatura", () => {
    for (const tipo of ["subscription.created", "subscription.canceled"]) {
      expect(classifyEvent(tipo)).toEqual({
        upsertCharge: false,
        upsertCustomer: false,
        upsertSubscription: true,
        syncPayables: false,
        explodeFiscal: false,
      });
    }
  });

  it("eventos de cliente só tocam o cliente", () => {
    for (const tipo of ["customer.created", "customer.updated"]) {
      const acao = classifyEvent(tipo);
      expect(acao.upsertCustomer).toBe(true);
      expect(acao.upsertCharge).toBe(false);
    }
  });

  it("invoice.* é reconhecido mas sem efeito (o payload não traz a assinatura)", () => {
    for (const tipo of ["invoice.created", "invoice.paid", "invoice.payment_failed"]) {
      expect(classifyEvent(tipo)).toEqual({
        upsertCharge: false,
        upsertCustomer: false,
        upsertSubscription: false,
        syncPayables: false,
        explodeFiscal: false,
      });
      // ainda assim é um tipo CONHECIDO — a distinção importa para diagnóstico
      expect(knownEventTypes()).toContain(tipo);
    }
  });

  it("tipo desconhecido não faz nada e não lança", () => {
    expect(classifyEvent("recipient.created")).toEqual({
      upsertCharge: false,
      upsertCustomer: false,
      upsertSubscription: false,
      syncPayables: false,
      explodeFiscal: false,
    });
    expect(() => classifyEvent("")).not.toThrow();
  });
});
