import { supabase, type Tables } from "@/lib/supabase";

export type CostCenter = Tables["cost_centers"]["Row"];
export type CostCenterInsert = Tables["cost_centers"]["Insert"];
export type CostCenterUpdate = Tables["cost_centers"]["Update"];

export async function fetchCostCenters(companyId: string): Promise<CostCenter[]> {
  const { data, error } = await supabase
    .from("cost_centers")
    .select("*")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/* ─── Consolidação: o mesmo conceito em empresas diferentes ─────────────── */

export interface ConsolidatedCostCenter {
  /** Nome normalizado pelo qual estes centros consolidam. */
  key: string;
  /** Grafia a exibir (nome do grupo de fusão, quando houver). */
  name: string;
  /** Grupo de fusão, quando a união foi manual. Nulo = casaram pelo próprio nome. */
  mergeGroupId: string | null;
  members: {
    id: string;
    companyId: string;
    /** Nome do centro NA empresa — pode divergir do consolidado, e é o que a UI
     *  precisa mostrar para a pessoa entender o que foi fundido com o quê. */
    name: string;
  }[];
}

/**
 * Centros de custo do escopo agrupados pela chave de consolidação, na mesma regra que
 * `cost_center_analysis_multi` usa para somar: nome do grupo de fusão, ou o próprio
 * nome, normalizado. Ler daqui em vez de reimplementar o agrupamento é o que mantém a
 * tela de fusão mostrando exatamente o que o relatório vai somar.
 */
export async function fetchConsolidatedCostCenters(
  companyIds: string[] | null,
): Promise<ConsolidatedCostCenter[]> {
  let query = supabase
    .from("v_cost_centers_consolidated")
    .select("id, company_id, name, consolidated_name, consolidation_key, merge_group_id")
    .eq("is_active", true)
    .order("consolidation_key", { ascending: true });

  if (companyIds) query = query.in("company_id", companyIds);

  const { data, error } = await query;
  if (error) throw error;

  return groupByConsolidationKey(data ?? []);
}

/**
 * Linha crua da view. Todas as colunas vêm anuláveis porque é assim que o Postgres
 * descreve view — as que na prática nunca são nulas (`id`, `company_id`, `name`) são
 * defendidas na fronteira em vez de assumidas.
 */
export interface ConsolidatedCostCenterRow {
  id: string | null;
  company_id: string | null;
  name: string | null;
  consolidated_name: string | null;
  consolidation_key: string | null;
  merge_group_id: string | null;
}

/**
 * Agrupa as linhas da view pela chave de consolidação. Exportada para teste porque é o
 * espelho, no cliente, do `group by` que `cost_center_analysis_multi` faz no banco — se
 * os dois discordarem, a tela de fusão mostra um agrupamento e o relatório soma outro.
 */
export function groupByConsolidationKey(
  rows: readonly ConsolidatedCostCenterRow[],
): ConsolidatedCostCenter[] {
  const byKey = new Map<string, ConsolidatedCostCenter>();
  for (const row of rows) {
    if (!row.id || !row.company_id) continue;
    const key = row.consolidation_key ?? "";
    const member = { id: row.id, companyId: row.company_id, name: row.name ?? "—" };
    const acc = byKey.get(key);
    if (!acc) {
      byKey.set(key, {
        key,
        name: row.consolidated_name ?? member.name,
        mergeGroupId: row.merge_group_id,
        members: [member],
      });
      continue;
    }
    byKey.set(key, { ...acc, members: [...acc.members, member] });
  }
  return [...byKey.values()];
}

/* ─── Fusão manual ──────────────────────────────────────────────────────── */

/**
 * Funde centros sob um nome de consolidação. Fundir NÃO renomeia o centro na empresa
 * nem toca lançamento: só diz "para efeito de relatório, estes são a mesma coisa".
 *
 * Reaproveita o grupo de fusão que já tenha esse nome em vez de criar outro — o nome é
 * único por organização (dois grupos homônimos somariam juntos de todo jeito, já que a
 * chave é o nome), e reaproveitar é o que permite acrescentar uma terceira empresa a
 * uma fusão feita antes.
 */
export async function mergeCostCenters(input: {
  organizationId: string;
  name: string;
  costCenterIds: string[];
}): Promise<string> {
  const name = input.name.trim();

  const { data: existing, error: findError } = await supabase
    .from("cost_center_merge_groups")
    .select("id, name")
    .eq("organization_id", input.organizationId);
  if (findError) throw findError;

  const normalized = name.toLocaleLowerCase();
  const reused = (existing ?? []).find((g) => g.name.trim().toLocaleLowerCase() === normalized);

  let groupId = reused?.id;
  if (!groupId) {
    const { data: created, error: createError } = await supabase
      .from("cost_center_merge_groups")
      .insert({ organization_id: input.organizationId, name })
      .select("id")
      .single();
    if (createError) throw createError;
    groupId = created.id;
  }

  const { error: assignError } = await supabase
    .from("cost_centers")
    .update({ merge_group_id: groupId })
    .in("id", input.costCenterIds);
  if (assignError) throw assignError;

  return groupId;
}

/**
 * Desfaz a fusão dos centros indicados: cada um volta a consolidar pelo próprio nome.
 * Não apaga o grupo de fusão — ele pode ainda ter outros membros, e um grupo vazio é
 * inofensivo (não aparece em lugar nenhum).
 */
export async function unmergeCostCenters(costCenterIds: string[]): Promise<void> {
  const { error } = await supabase
    .from("cost_centers")
    .update({ merge_group_id: null })
    .in("id", costCenterIds);
  if (error) throw error;
}

export async function createCostCenter(payload: CostCenterInsert): Promise<CostCenter> {
  const { data, error } = await supabase.from("cost_centers").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateCostCenter(id: string, payload: CostCenterUpdate): Promise<CostCenter> {
  const { data, error } = await supabase
    .from("cost_centers")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
