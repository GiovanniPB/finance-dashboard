/**
 * CRUD de templates de relatório.
 *
 * O template guarda a `ReportConfig` serializada em `config`. A leitura é
 * tolerante: config gravada por uma versão anterior do schema (ou corrompida à
 * mão) não derruba a listagem — o template vem com `config: null` e a UI o marca
 * como incompatível.
 */
import { supabase } from "@/lib/supabase";

import { parseReportConfig, type ReportConfig } from "./schema";

export interface ReportTemplate {
  id: string;
  organizationId: string;
  /** `null` = template de escopo consolidado. */
  companyId: string | null;
  name: string;
  description: string | null;
  /** `null` quando a config gravada não passa no schema atual. */
  config: ReportConfig | null;
  createdAt: string;
  updatedAt: string;
}

interface TemplateRow {
  id: string;
  organization_id: string;
  company_id: string | null;
  name: string;
  description: string | null;
  config: unknown;
  created_at: string;
  updated_at: string;
}

function toTemplate(row: TemplateRow): ReportTemplate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    companyId: row.company_id,
    name: row.name,
    description: row.description,
    config: parseReportConfig(row.config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS =
  "id, organization_id, company_id, name, description, config, created_at, updated_at";

/**
 * Templates visíveis no escopo atual: os da empresa selecionada mais os
 * consolidados da organização. RLS já limita ao que o usuário pode ver; o filtro
 * aqui é de relevância, não de segurança.
 */
export async function fetchReportTemplates(opts: {
  organizationId: string;
  companyId: string | null;
}): Promise<ReportTemplate[]> {
  const query = supabase
    .from("report_templates")
    .select(COLUMNS)
    .eq("organization_id", opts.organizationId)
    .order("name");

  // `or()` monta o filtro como texto, então o id vai concatenado. Validar o
  // formato antes evita que um valor inesperado altere a expressão do filtro.
  if (opts.companyId != null && !UUID_RE.test(opts.companyId)) {
    throw new Error("companyId inválido");
  }

  const { data, error } =
    opts.companyId == null
      ? await query.is("company_id", null)
      : await query.or(`company_id.eq.${opts.companyId},company_id.is.null`);

  if (error) throw error;
  return (data ?? []).map((row) => toTemplate(row as TemplateRow));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface SaveTemplateInput {
  organizationId: string;
  companyId: string | null;
  name: string;
  description?: string | null;
  config: ReportConfig;
}

export async function createReportTemplate(input: SaveTemplateInput): Promise<ReportTemplate> {
  const { data, error } = await supabase
    .from("report_templates")
    .insert({
      organization_id: input.organizationId,
      company_id: input.companyId,
      name: input.name.trim(),
      description: input.description ?? null,
      config: input.config,
    })
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return toTemplate(data);
}

export async function updateReportTemplate(
  id: string,
  patch: { name?: string; description?: string | null; config?: ReportConfig },
): Promise<ReportTemplate> {
  const { data, error } = await supabase
    .from("report_templates")
    .update({
      ...(patch.name == null ? {} : { name: patch.name.trim() }),
      ...(patch.description === undefined ? {} : { description: patch.description }),
      ...(patch.config == null ? {} : { config: patch.config }),
    })
    .eq("id", id)
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return toTemplate(data);
}

export async function deleteReportTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("report_templates").delete().eq("id", id);
  if (error) throw error;
}
