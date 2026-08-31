/**
 * O que um acesso de IA de fato concede.
 *
 * O OAuth Server do Supabase ainda não tem escopos: o `scope` que chega na
 * autorização é sempre algo como "openid email profile", que não diz nada sobre
 * dado financeiro. Mostrar aquilo cru na tela seria consentimento de fachada.
 *
 * O escopo real é o do próprio usuário — empresas em `company_access` e módulos em
 * `visible_modules` — mais a garantia estrutural de que token de OAuth não escreve
 * (policies `oauth_sem_escrita_*`). Estas funções montam essa divulgação em
 * português, e a tela só as apresenta.
 */
import { DATA_MODULES, MODULE_LABELS, type DataModule } from "@/features/auth/modules";

export interface EmpresaResumo {
  id: string;
  nome: string;
}

export interface AcessoConcedido {
  empresas: EmpresaResumo[];
  modulos: { id: DataModule; label: string }[];
  /** Sempre true: não existe tool de escrita, e o banco recusa escrita por token de OAuth. */
  somenteLeitura: true;
  /** Frase única para quem não vai ler a lista item a item. */
  resumo: string;
}

/** Módulos efetivamente visíveis: super admin vê todos; `null` = sem restrição. */
export function modulosConcedidos(
  isSuperAdmin: boolean,
  visibleModules: DataModule[] | null,
): DataModule[] {
  if (isSuperAdmin || visibleModules === null) return [...DATA_MODULES];
  return DATA_MODULES.filter((m) => visibleModules.includes(m));
}

function listaEmPortugues(itens: string[]): string {
  if (itens.length === 0) return "nada";
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

export function resumirAcesso(params: {
  empresas: EmpresaResumo[];
  isSuperAdmin: boolean;
  visibleModules: DataModule[] | null;
}): AcessoConcedido {
  const modulos = modulosConcedidos(params.isSuperAdmin, params.visibleModules).map((id) => ({
    id,
    label: MODULE_LABELS[id],
  }));

  const empresasTxt =
    params.empresas.length === 0
      ? "nenhuma empresa"
      : params.empresas.length === 1
        ? `a empresa ${params.empresas[0].nome}`
        : `${params.empresas.length} empresas`;

  return {
    empresas: params.empresas,
    modulos,
    somenteLeitura: true,
    resumo:
      `Este aplicativo poderá LER, em seu nome, os dados de ${empresasTxt}, ` +
      `nos módulos ${listaEmPortugues(modulos.map((m) => m.label))}. ` +
      "Não poderá criar, alterar nem apagar nada.",
  };
}
