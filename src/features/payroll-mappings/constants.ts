import type { EmployeeKind, PayrollComponent } from "./api";

export const COMPONENT_META: Record<
  PayrollComponent,
  { label: string; description: string; isLiability: boolean }
> = {
  salary_fixed: {
    label: "Salário fixo",
    description: "Parcela fixa (salário base CLT, fixo do assessor)",
    isLiability: false,
  },
  salary_variable: {
    label: "Salário variável / extras",
    description: "Variável, férias, 13º, rescisão, acerto",
    isLiability: false,
  },
  salary_bonus: {
    label: "Bônus / PLR",
    description: "Bônus e participação nos lucros",
    isLiability: false,
  },
  fgts: {
    label: "FGTS",
    description: "Encargo patronal (8% sobre salário CLT)",
    isLiability: false,
  },
  benefits: {
    label: "Benefícios",
    description: "Vale alimentação, vale transporte, plano de saúde, seguro de vida",
    isLiability: false,
  },
  irrf_withheld: {
    label: "IRRF retido",
    description: "Imposto retido do funcionário — passivo até recolhimento",
    isLiability: true,
  },
  inss_withheld: {
    label: "INSS retido",
    description: "Contribuição retida do funcionário — passivo até recolhimento",
    isLiability: true,
  },
};

export const KIND_META: Record<EmployeeKind, { label: string; description: string }> = {
  clt: { label: "CLT", description: "Funcionário registrado" },
  pj: { label: "PJ", description: "Pessoa jurídica / autônomo" },
  intern: { label: "Estagiário", description: "Termo de estágio" },
  partner: { label: "Sócio / Assessor", description: "Sem encargos (assessores OTM)" },
};

export const COMPONENT_ORDER: PayrollComponent[] = [
  "salary_fixed",
  "salary_variable",
  "salary_bonus",
  "fgts",
  "benefits",
  "irrf_withheld",
  "inss_withheld",
];

export const KIND_ORDER: EmployeeKind[] = ["partner", "clt", "pj", "intern"];
