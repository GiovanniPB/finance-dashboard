import { supabase, type Tables } from "@/lib/supabase";

export type CostCenter = Tables["cost_centers"]["Row"];
export type CostCenterInsert = Tables["cost_centers"]["Insert"];
export type CostCenterUpdate = Tables["cost_centers"]["Update"];

/**
 * A central de custos inteira. Não recebe empresa de propósito: centro de custo é da
 * ORGANIZAÇÃO — o mesmo "Comercial" vale para qualquer empresa do grupo, e é isso que
 * faz o relatório consolidado somar sem depender de casar nomes.
 */
export async function fetchCostCenters(): Promise<CostCenter[]> {
  const { data, error } = await supabase
    .from("cost_centers")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Funde centros no destino: repõe lançamentos, recorrências, colaboradores,
 * mapeamentos de folha e as linhas do balanço, e apaga as origens.
 *
 * É uma RPC porque precisa ser atômica em cinco tabelas: uma falha no meio deixaria
 * referência apontando para centro apagado, e como a FK é `on delete set null` o efeito
 * seria lançamento perdendo a classificação em silêncio.
 *
 * Não tem volta — fundir é ato de organização, não filtro de visualização. Devolve
 * quantos lançamentos foram movidos.
 */
export async function mergeCostCenters(input: {
  sourceIds: string[];
  targetId: string;
}): Promise<number> {
  const { data, error } = await supabase.rpc("merge_cost_centers", {
    p_source_ids: input.sourceIds,
    p_target_id: input.targetId,
  });
  if (error) throw error;
  return data ?? 0;
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
