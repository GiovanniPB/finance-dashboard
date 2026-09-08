import type {
  TaxAssessmentLineKind,
  TaxObligationKind,
  TaxObligationStatus,
  TaxPeriodKind,
  TaxPresumptionClass,
} from "./api";

export const KIND_META: Record<TaxObligationKind, { label: string; description: string }> = {
  das_simples: {
    label: "DAS · Simples Nacional",
    description: "Mensal, vence dia 20 do mês seguinte",
  },
  darf_irpj: { label: "DARF · IRPJ", description: "Imposto de Renda PJ" },
  darf_csll: { label: "DARF · CSLL", description: "Contribuição Social" },
  darf_pis: { label: "DARF · PIS", description: "Mensal" },
  darf_cofins: { label: "DARF · COFINS", description: "Mensal" },
  gps_inss: { label: "GPS · INSS Empresa", description: "Mensal, dia 20" },
  fgts: { label: "FGTS", description: "Mensal, dia 7" },
  icms: { label: "ICMS", description: "Estadual" },
  iss: { label: "ISS", description: "Municipal" },
  irrf_retencao: { label: "IRRF · Retenção", description: "Retido na fonte" },
  irrf_dividendos: {
    label: "IRRF · Distribuição de lucros",
    description: "Retido do sócio na distribuição",
  },
  inss_retencao: { label: "INSS · Retenção", description: "Retido na fonte" },
  custom: { label: "Customizado", description: "Outras obrigações" },
};

export const STATUS_META: Record<
  TaxObligationStatus,
  { label: string; tone: "info" | "warning" | "income" | "expense" | "default" }
> = {
  pending: { label: "Pendente", tone: "warning" },
  paid: { label: "Pago", tone: "income" },
  overdue: { label: "Vencido", tone: "expense" },
  waived: { label: "Dispensado", tone: "default" },
};

// ---------------------------------------------------------------------------
// Apuração
// ---------------------------------------------------------------------------

/**
 * Classes de presunção do Lucro Presumido, com os percentuais legais de referência.
 * O percentual que VALE é o cadastrado em `tax_rule_presumptions` — aqui é só a
 * legenda que ajuda quem configura a regra a não errar a classe.
 */
export const PRESUMPTION_CLASS_META: Record<TaxPresumptionClass, { label: string; hint: string }> =
  {
    revenda_mercadoria: { label: "Revenda de mercadoria", hint: "8% IRPJ · 12% CSLL" },
    industria: { label: "Industrialização", hint: "8% IRPJ · 12% CSLL" },
    servico_geral: { label: "Serviços em geral", hint: "32% IRPJ · 32% CSLL" },
    servico_transporte: { label: "Transporte", hint: "8%/16% IRPJ · 12% CSLL" },
    servico_hospitalar: { label: "Serviços hospitalares", hint: "8% IRPJ · 12% CSLL" },
    combustivel_revenda: { label: "Revenda de combustível", hint: "1,6% IRPJ · 12% CSLL" },
    financeiro_exterior: {
      label: "Ganho de capital / exterior",
      hint: "100% — entra integral na base",
    },
    outras: { label: "Outras receitas", hint: "Conforme a regra cadastrada" },
  };

/** Seções do demonstrativo, na ordem em que aparecem — a mesma da planilha. */
export const LINE_KIND_META: Record<
  TaxAssessmentLineKind,
  { label: string; sign: "+" | "-"; order: number }
> = {
  revenue: { label: "Receita do período", sign: "+", order: 0 },
  revenue_return: { label: "(-) Devoluções", sign: "-", order: 1 },
  retention: { label: "(-) Retenções na fonte", sign: "-", order: 2 },
  deduction: { label: "(-) Outras deduções", sign: "-", order: 3 },
  addition: { label: "(+) Acréscimos", sign: "+", order: 4 },
  carryforward: { label: "Saldo de período anterior", sign: "+", order: 5 },
};

export const PERIOD_KIND_META: Record<TaxPeriodKind, { label: string; short: string }> = {
  monthly: { label: "Mensal", short: "mês" },
  quarterly: { label: "Trimestral", short: "trimestre" },
  annual: { label: "Anual", short: "ano" },
};

/** Tributos que a apuração sabe calcular hoje — os que têm regra parametrizável. */
export const APURAVEIS: TaxObligationKind[] = [
  "iss",
  "darf_pis",
  "darf_cofins",
  "darf_irpj",
  "darf_csll",
  "irrf_dividendos",
  "das_simples",
  "custom",
];

/** Rótulo do trimestre/mês da competência, para cabeçalho de demonstrativo. */
export function periodLabel(periodStart: string, periodKind: TaxPeriodKind): string {
  const [year, month] = periodStart.split("-").map(Number);
  if (periodKind === "quarterly") {
    return `${Math.floor((month - 1) / 3) + 1}º trimestre ${year}`;
  }
  if (periodKind === "annual") return String(year);
  const meses = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return `${meses[month - 1]} ${year}`;
}
