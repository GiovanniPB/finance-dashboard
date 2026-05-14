import { z } from "zod";

export const DRE_SECTIONS = [
  { value: "gross_revenue", label: "Receita Bruta" },
  { value: "revenue_deductions", label: "Deduções da Receita" },
  { value: "net_revenue", label: "Receita Líquida" },
  { value: "cogs", label: "Custos (CMV/CPV/CSV)" },
  { value: "contribution_margin", label: "Margem de Contribuição" },
  { value: "fixed_costs", label: "Custos Fixos" },
  { value: "fixed_costs_personnel", label: "Custos Fixos · Pessoal" },
  { value: "fixed_costs_utilities", label: "Custos Fixos · Utilities" },
  { value: "financial_result", label: "Resultado Financeiro" },
  { value: "net_result", label: "Resultado Líquido" },
  { value: "profitability", label: "Rentabilidade" },
  { value: "capital_movements", label: "Movimentos de Capital" },
  { value: "cash_generation", label: "Geração de Caixa" },
  { value: "balance_snapshot", label: "Saldo Patrimonial" },
  { value: "applications", label: "Aplicações Financeiras" },
  { value: "operational_data", label: "Dados Operacionais" },
] as const;

export type DreSectionValue = (typeof DRE_SECTIONS)[number]["value"];

export const ACCOUNT_KINDS = [
  { value: "revenue", label: "Receita" },
  { value: "revenue_deduction", label: "Dedução de Receita" },
  { value: "cogs", label: "Custo (CMV/CPV/CSV)" },
  { value: "operating_expense", label: "Despesa Operacional" },
  { value: "personnel_expense", label: "Despesa de Pessoal" },
  { value: "financial_expense", label: "Despesa Financeira" },
  { value: "financial_income", label: "Receita Financeira" },
  { value: "dividend", label: "Dividendo" },
  { value: "partner_bonus", label: "Bonificação a Sócio" },
  { value: "partner_reimbursement", label: "Reembolso a Sócio" },
  { value: "capital_movement", label: "Movimento de Capital" },
  { value: "asset", label: "Ativo" },
  { value: "liability", label: "Passivo" },
  { value: "equity", label: "Patrimônio Líquido" },
  { value: "tax_on_profit", label: "Imposto sobre Lucro" },
  { value: "summary", label: "Subtotal / Linha de Resumo" },
] as const;

export type AccountKindValue = (typeof ACCOUNT_KINDS)[number]["value"];

export const SIGN_HINTS = [
  { value: "+", label: "Soma (+)" },
  { value: "-", label: "Subtrai (−)" },
  { value: "=", label: "Resultado (=)" },
] as const;

export const chartAccountFormSchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().min(1, "Código obrigatório").max(40, "Código muito longo"),
  name: z.string().min(2, "Nome obrigatório").max(200),
  kind: z.enum([
    "revenue",
    "revenue_deduction",
    "cogs",
    "operating_expense",
    "personnel_expense",
    "financial_expense",
    "financial_income",
    "dividend",
    "partner_bonus",
    "partner_reimbursement",
    "capital_movement",
    "asset",
    "liability",
    "equity",
    "tax_on_profit",
    "summary",
  ]),
  dreSection: z
    .enum([
      "gross_revenue",
      "revenue_deductions",
      "net_revenue",
      "cogs",
      "contribution_margin",
      "fixed_costs",
      "fixed_costs_personnel",
      "fixed_costs_utilities",
      "financial_result",
      "net_result",
      "profitability",
      "capital_movements",
      "cash_generation",
      "balance_snapshot",
      "applications",
      "operational_data",
    ])
    .nullable(),
  parentId: z.string().uuid().nullable(),
  signHint: z.enum(["+", "-", "="]).nullable(),
  sortOrder: z.coerce.number().int().min(0).max(99999),
  isSummary: z.boolean(),
  belowTheLine: z.boolean(),
  isActive: z.boolean(),
  notes: z.string().max(500).nullable(),
});

export type ChartAccountFormValues = z.infer<typeof chartAccountFormSchema>;

export function emptyChartAccountForm(companyId: string): ChartAccountFormValues {
  return {
    companyId,
    code: "",
    name: "",
    kind: "operating_expense",
    dreSection: "fixed_costs",
    parentId: null,
    signHint: "-",
    sortOrder: 100,
    isSummary: false,
    belowTheLine: false,
    isActive: true,
    notes: null,
  };
}

export function dreSectionLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return DRE_SECTIONS.find((s) => s.value === value)?.label ?? value;
}

export function accountKindLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return ACCOUNT_KINDS.find((k) => k.value === value)?.label ?? value;
}
