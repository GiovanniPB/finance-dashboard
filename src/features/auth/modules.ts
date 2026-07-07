/**
 * Data modules (domínios de dados) — espelham o enum `data_module` do Postgres.
 * Definem o escopo de visualização configurável por usuário; a imposição real é no
 * banco (RLS via `can_view_module`), isto aqui controla nav/UI (defesa em profundidade).
 */
export const DATA_MODULES = ["financials", "payroll", "taxes", "nfse", "audit"] as const;

export type DataModule = (typeof DATA_MODULES)[number];

export const MODULE_LABELS: Record<DataModule, string> = {
  financials: "Financeiro",
  payroll: "Folha de pagamento",
  taxes: "Impostos",
  nfse: "NFS-e",
  audit: "Auditoria",
};

export const MODULE_DESCRIPTIONS: Record<DataModule, string> = {
  financials: "Lançamentos, contas, DRE, fluxo, conciliação, relatórios, forecast, importações",
  payroll: "Funcionários e folha de pagamento (dados sensíveis / PII)",
  taxes: "Obrigações e apuração de impostos",
  nfse: "Emissão e gestão de NFS-e",
  audit: "Trilha de auditoria",
};

/**
 * Pode ver o módulo? Espelha o helper `can_view_module` do banco:
 *  - super_admin sempre vê;
 *  - visibleModules null = sem restrição (vê tudo);
 *  - senão precisa estar na allow-list.
 * A imposição real é no banco (RLS); isto é só para nav/UI.
 */
export function canViewModule(
  isSuperAdmin: boolean,
  visibleModules: DataModule[] | null,
  module: DataModule,
): boolean {
  if (isSuperAdmin) return true;
  if (visibleModules === null) return true;
  return visibleModules.includes(module);
}
