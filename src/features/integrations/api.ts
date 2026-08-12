import { supabase } from "@/lib/supabase";

/**
 * Dados da tela de integrações que não pertencem a uma feature de domínio.
 *
 * A conexão pagar.me em si (CRUD, recebedores, segredos) continua em
 * `features/nfse/api.ts`, onde nasceu com a esteira fiscal. Ela hoje serve tanto
 * notas quanto vendas; mover o módulo inteiro seria um refactor de import em ~40
 * arquivos e ficou como passo separado.
 */

export interface ObservedEventType {
  pagarmeAccountId: string | null;
  eventType: string;
  events: number;
  lastAt: string;
}

/**
 * Tipos de evento que REALMENTE chegaram, por conexão.
 *
 * É como a tela sabe o que está assinado no painel do pagar.me: não existe API
 * para ler a assinatura, então a evidência é o que caiu na fila. `sales_events` é
 * restrito por RLS a administradores — a tela trata o erro de permissão como
 * "sem visibilidade", não como falha.
 */
export async function fetchObservedEventTypes(): Promise<ObservedEventType[]> {
  const { data, error } = await supabase
    .from("sales_events")
    .select("pagarme_account_id, event_type, received_at")
    .order("received_at", { ascending: false })
    .limit(2000);
  if (error) throw error;

  const byKey = new Map<string, ObservedEventType>();
  for (const row of data ?? []) {
    const accountId = row.pagarme_account_id;
    const eventType = row.event_type ?? "—";
    const key = `${accountId ?? "null"}:${eventType}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.events += 1;
    } else {
      byKey.set(key, {
        pagarmeAccountId: accountId,
        eventType,
        events: 1,
        // a query vem ordenada desc, então o primeiro visto é o mais recente
        lastAt: row.received_at,
      });
    }
  }
  return [...byKey.values()];
}

export interface ConnectionGateway {
  settingsId: string;
  companyId: string;
  companyName: string;
  gatewayBankAccountId: string | null;
  gatewayNickname: string | null;
  payoutBankAccountId: string | null;
  payoutNickname: string | null;
  cutoverDate: string;
  enabled: boolean;
}

/**
 * Configuração de write-back de UMA conexão, por empresa recebedora.
 *
 * A RPC `pagarme_gateway_accounts` responde a pergunta oposta (uma empresa, N
 * conexões), que é a da tela de conciliação. Aqui a pergunta é a da tela de
 * integrações: nesta conexão, quem recebe e para onde vai. Select direto porque a
 * RLS de `pagarme_ledger_settings` já é por empresa — o usuário vê exatamente as
 * empresas a que tem acesso, sem RPC intermediária.
 */
export async function fetchConnectionGateways(accountId: string): Promise<ConnectionGateway[]> {
  const { data, error } = await supabase
    .from("pagarme_ledger_settings")
    .select(
      `id, company_id, gateway_bank_account_id, payout_bank_account_id, cutover_date, enabled,
       company:companies!pagarme_ledger_settings_company_id_fkey(legal_name, trade_name),
       gateway:bank_accounts!pagarme_ledger_settings_gateway_bank_account_id_fkey(nickname),
       payout:bank_accounts!pagarme_ledger_settings_payout_bank_account_id_fkey(nickname)`,
    )
    .eq("pagarme_account_id", accountId);
  if (error) throw error;

  return (data ?? []).map((r) => ({
    settingsId: r.id,
    companyId: r.company_id,
    companyName: r.company?.trade_name ?? r.company?.legal_name ?? "—",
    gatewayBankAccountId: r.gateway_bank_account_id,
    gatewayNickname: r.gateway?.nickname ?? null,
    payoutBankAccountId: r.payout_bank_account_id,
    payoutNickname: r.payout?.nickname ?? null,
    cutoverDate: r.cutover_date,
    enabled: r.enabled,
  }));
}

/**
 * Remove uma configuração de write-back.
 *
 * Existe por causa de um caso real: a versão anterior desta tela era orientada
 * pela EMPRESA selecionada, então configurar "todas as conexões" criava carteira
 * da empresa em foco para conexões que pagam OUTRA empresa. O resultado é uma
 * linha que nunca projeta nada — e que ficaria invisível numa tela orientada pela
 * conexão. Some com ela em vez de esconder.
 */
export async function deleteLedgerSettings(settingsId: string): Promise<void> {
  const { error } = await supabase.from("pagarme_ledger_settings").delete().eq("id", settingsId);
  if (error) throw error;
}

export interface CronJobStatus {
  jobName: string;
  schedule: string;
  active: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
}

/** Estado dos agendamentos da esteira (pg_cron), para a tela de webhooks. */
export async function fetchCronStatus(): Promise<CronJobStatus[]> {
  const { data, error } = await supabase.rpc("pagarme_cron_status");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    jobName: r.job_name,
    schedule: r.schedule,
    active: r.active,
    lastRunAt: r.last_run_at,
    lastStatus: r.last_status,
  }));
}

/** Retoma um lote de carga histórica do ponto onde parou. */
export async function resumeSyncRun(runId: string): Promise<string> {
  const { data, error } = await supabase.rpc("pagarme_resume_sync_run", { p_run_id: runId });
  if (error) throw error;
  return data;
}
