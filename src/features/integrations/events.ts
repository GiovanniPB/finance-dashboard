/**
 * Eventos de webhook que o roteador do pagar.me trata.
 *
 * FONTE DA VERDADE: `supabase/functions/_shared/pagarme/events.ts` (`EVENT_ACTIONS`).
 * Esta lista é a leitura humana dela — serve para a tela dizer o que assinar no
 * painel do pagar.me e comparar com o que de fato chegou. Ao adicionar um tipo
 * no roteador, adicione aqui também; um tipo que exista só aqui aparece como
 * "nunca recebido" e um que exista só lá funciona sem aparecer na tela.
 */

export type WebhookEventPurpose = "fiscal" | "money" | "funnel" | "recurrence" | "customer";

export interface WebhookEventSpec {
  type: string;
  purpose: WebhookEventPurpose;
  /** O que deixa de funcionar sem ele. */
  unlocks: string;
  /** Assinar é obrigatório para a integração cumprir o que promete? */
  required: boolean;
}

export const PURPOSE_LABELS: Record<WebhookEventPurpose, string> = {
  fiscal: "Nota fiscal",
  money: "Dinheiro",
  funnel: "Funil de vendas",
  recurrence: "Recorrência",
  customer: "Comprador",
};

export const WEBHOOK_EVENTS: WebhookEventSpec[] = [
  {
    type: "charge.paid",
    purpose: "fiscal",
    unlocks: "emite a nota e materializa o cronograma de recebíveis da venda",
    required: true,
  },
  {
    type: "charge.refunded",
    purpose: "money",
    unlocks: "estorno vira dedução de receita e corrige o recebível",
    required: true,
  },
  {
    type: "charge.chargedback",
    purpose: "money",
    unlocks: "chargeback vira dedução de receita",
    required: true,
  },
  {
    type: "charge.partial_canceled",
    purpose: "money",
    unlocks: "cancelamento parcial ajusta o valor já reconhecido",
    required: true,
  },
  {
    type: "charge.underpaid",
    purpose: "money",
    unlocks: "pago a menos (pix/boleto) ajusta o recebível",
    required: false,
  },
  {
    type: "charge.overpaid",
    purpose: "money",
    unlocks: "pago a mais ajusta o recebível",
    required: false,
  },
  {
    type: "charge.payment_failed",
    purpose: "funnel",
    unlocks: "denominador da taxa de aprovação",
    required: false,
  },
  {
    type: "charge.created",
    purpose: "funnel",
    unlocks: "tentativas sem desfecho — mantém a taxa comparável com o histórico importado",
    required: false,
  },
  {
    type: "subscription.created",
    purpose: "recurrence",
    unlocks: "nova assinatura no MRR sem esperar o sync diário",
    required: false,
  },
  {
    type: "subscription.canceled",
    purpose: "recurrence",
    unlocks: "churn no dia do cancelamento",
    required: false,
  },
  {
    type: "customer.created",
    purpose: "customer",
    unlocks: "cadastro do comprador (também vem embutido na cobrança)",
    required: false,
  },
  {
    type: "customer.updated",
    purpose: "customer",
    unlocks: "mantém nome e e-mail do comprador atualizados",
    required: false,
  },
];

/**
 * Tipos que o roteador reconhece mas ignora de propósito. Listados para a tela
 * poder dizer "não assine isto" em vez de deixar a dúvida.
 */
export const IGNORED_EVENT_TYPES = [
  "invoice.created",
  "invoice.updated",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.canceled",
];
