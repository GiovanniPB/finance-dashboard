/**
 * Busca o snapshot de dados necessário para a composição escolhida.
 *
 * **Por que função assíncrona e não hooks:** a lista de blocos é dinâmica, e
 * hooks do React não podem ser chamados condicionalmente. Orquestrar isso com
 * `useQuery` exigiria montar todos os hooks sempre e desabilitar os não usados.
 * Como a geração é uma ação pontual (clique), buscar direto é mais simples e
 * evita o problema de raiz. As funções chamadas aqui são as mesmas dos hooks,
 * então continuam protegidas por RLS.
 */
import { fetchDreByCompany, fetchDreConsolidated } from "@/features/dre/api";
import { computeDreTotals } from "@/features/dre/compute";

import type { ResolvedPeriod } from "../period";
import type { ReportBlockType, ReportConfig } from "../schema";
import { emptyReportData, type ReportData } from "./types";

export interface FetchReportDataInput {
  config: ReportConfig;
  period: ResolvedPeriod;
  comparisonPeriod: ResolvedPeriod | null;
}

export async function fetchReportData(input: FetchReportDataInput): Promise<ReportData> {
  const { config, period } = input;
  const types = new Set<ReportBlockType>(config.blocks.map((b) => b.type));
  const data = emptyReportData();

  // Estruturado como lista de tarefas paralelas desde já: as fases seguintes
  // acrescentam blocos e nenhum deve esperar pelo anterior.
  const tasks: Promise<void>[] = [];

  if (types.has("dre")) {
    tasks.push(
      fetchDre(config, period).then((rows) => {
        data.dre = rows;
      }),
    );
  }

  await Promise.all(tasks);
  return data;
}

async function fetchDre(config: ReportConfig, period: ResolvedPeriod) {
  const rows =
    config.scope.mode === "consolidated"
      ? await fetchDreConsolidated(config.scope.organizationId, period.from, period.to)
      : await fetchDreByCompany(config.scope.companyId ?? "", period.from, period.to);
  return computeDreTotals(rows);
}
