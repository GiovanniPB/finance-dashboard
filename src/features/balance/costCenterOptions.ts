import type { ConsolidatedCostCenter } from "@/features/cost-centers/api";

/**
 * O que o editor de linhas oferece para compor uma linha do balanço.
 *
 * Num escopo de UMA empresa, uma opção é um centro de custo. Num escopo com várias
 * (consolidado ou grupo), uma opção é uma CHAVE DE CONSOLIDAÇÃO — "Capex" — e escolher
 * ela inclui o Capex de todas as empresas do escopo de uma vez. É por isso que a opção
 * carrega uma LISTA de ids: o modelo do balanço sempre guardou `costCenterIds`, então
 * a linha de grupo cabe no formato que já existia.
 */
export interface CostCenterOption {
  /** Identidade da opção: id do centro, ou a chave de consolidação. */
  id: string;
  name: string;
  /** Centros que a opção representa. */
  costCenterIds: string[];
  /** De quantas empresas esses centros vêm. Acima de 1, a opção é uma união. */
  companiesCount: number;
  /**
   * Nomes divergentes reunidos nesta opção, quando houver. Aparece na UI para a
   * pessoa conferir o que foi fundido com o quê — sem isso, uma fusão errada some.
   */
  memberNames: string[];
}

/** Escopo de uma empresa: uma opção por centro. */
export function optionsFromCostCenters(
  centers: readonly { id: string; name: string }[],
): CostCenterOption[] {
  return centers.map((cc) => ({
    id: cc.id,
    name: cc.name,
    costCenterIds: [cc.id],
    companiesCount: 1,
    memberNames: [cc.name],
  }));
}

/** Escopo com várias empresas: uma opção por chave de consolidação. */
export function optionsFromConsolidated(groups: readonly ConsolidatedCostCenter[]) {
  return groups.map<CostCenterOption>((g) => ({
    id: g.key,
    name: g.name,
    costCenterIds: g.members.map((m) => m.id),
    companiesCount: new Set(g.members.map((m) => m.companyId)).size,
    // Só as grafias diferentes do nome consolidado interessam ao leitor.
    memberNames: [...new Set(g.members.map((m) => m.name))].filter((n) => n !== g.name),
  }));
}

/**
 * Nome a exibir para um id de centro guardado no modelo. Procura por PERTENCIMENTO,
 * porque a opção pode representar vários centros.
 *
 * Um id que não está em nenhuma opção é um centro que saiu do escopo ou foi desativado
 * — a linha continua somando o que existe, e a UI diz que aquele pedaço não está mais
 * lá, em vez de mostrar um uuid cru.
 */
export function nameForCostCenterId(
  options: readonly CostCenterOption[],
  costCenterId: string,
): string | null {
  return options.find((o) => o.costCenterIds.includes(costCenterId))?.name ?? null;
}
