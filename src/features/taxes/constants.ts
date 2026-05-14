import type { TaxObligationKind, TaxObligationStatus } from "./api";

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
