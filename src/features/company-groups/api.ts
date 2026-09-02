import { supabase, type Tables } from "@/lib/supabase";

export type CompanyGroupRow = Tables["company_groups"]["Row"];

/** Grupo já com as empresas que ele agrega, que é como a UI sempre precisa dele. */
export interface CompanyGroup extends CompanyGroupRow {
  companyIds: string[];
}

interface GroupWithMembers extends CompanyGroupRow {
  company_group_members: { company_id: string }[];
}

/**
 * A RLS só devolve grupo cujas empresas o usuário TODAS acessa (helper
 * `visible_company_group_ids`), então não existe grupo "pela metade" chegando aqui —
 * um recorte parcial silencioso seria um número contábil errado.
 */
export async function fetchCompanyGroups(): Promise<CompanyGroup[]> {
  const { data, error } = await supabase
    .from("company_groups")
    .select("*, company_group_members(company_id)")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as GroupWithMembers[]).map((g) => ({
    ...g,
    companyIds: g.company_group_members.map((m) => m.company_id),
  }));
}

export interface SaveCompanyGroupInput {
  organizationId: string;
  name: string;
  description: string | null;
  companyIds: string[];
}

export async function createCompanyGroup(input: SaveCompanyGroupInput): Promise<CompanyGroup> {
  const { data: group, error } = await supabase
    .from("company_groups")
    .insert({
      organization_id: input.organizationId,
      name: input.name,
      description: input.description,
    })
    .select("*")
    .single();

  if (error) throw error;

  await replaceMembers(group.id, input.organizationId, input.companyIds);
  return { ...group, companyIds: input.companyIds };
}

export async function updateCompanyGroup(
  id: string,
  input: SaveCompanyGroupInput,
): Promise<CompanyGroup> {
  const { data: group, error } = await supabase
    .from("company_groups")
    .update({ name: input.name, description: input.description })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  await replaceMembers(id, input.organizationId, input.companyIds);
  return { ...group, companyIds: input.companyIds };
}

export async function deleteCompanyGroup(id: string): Promise<void> {
  const { error } = await supabase.from("company_groups").delete().eq("id", id);
  if (error) throw error;
}

/** O que entra e o que sai para a composição virar `wanted`. */
export function diffMembers(
  existing: string[],
  wanted: string[],
): { toAdd: string[]; toRemove: string[] } {
  const has = new Set(existing);
  const keep = new Set(wanted);
  return {
    toAdd: wanted.filter((id) => !has.has(id)),
    toRemove: existing.filter((id) => !keep.has(id)),
  };
}

/**
 * Composição nova = apaga o que saiu e insere o que entrou, em vez de apagar tudo e
 * reinserir: mantém o `created_at` de quem já estava e não enche o `audit_log` de
 * delete+insert a cada rename do grupo.
 */
async function replaceMembers(
  groupId: string,
  organizationId: string,
  companyIds: string[],
): Promise<void> {
  const { data: current, error: readError } = await supabase
    .from("company_group_members")
    .select("company_id")
    .eq("group_id", groupId);

  if (readError) throw readError;

  const { toAdd, toRemove } = diffMembers(
    (current ?? []).map((m) => m.company_id),
    companyIds,
  );

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("company_group_members")
      .delete()
      .eq("group_id", groupId)
      .in("company_id", toRemove);
    if (error) throw error;
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from("company_group_members").insert(
      toAdd.map((companyId) => ({
        group_id: groupId,
        company_id: companyId,
        organization_id: organizationId,
      })),
    );
    if (error) throw error;
  }
}
