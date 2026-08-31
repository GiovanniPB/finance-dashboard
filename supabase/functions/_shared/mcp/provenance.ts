/**
 * Proveniência — os metadados que acompanham toda resposta.
 *
 * É aqui que mora a semântica contábil que um LLM não adivinha lendo o schema:
 * quais `status` cada regime inclui, e por quê. A migration
 * `dre_competencia_inclui_pendente` é a fonte dessas regras.
 */
import type { Proveniencia, Regime } from "./types.ts";

/**
 * Status de lançamento que entram em cada regime.
 *
 * - **competência**: o fato ocorreu — inclui o que ainda não foi pago (`pending`).
 * - **caixa**: só o que entrou ou saiu de fato.
 *
 * `scheduled` (ocorrência futura de recorrência) fica fora dos dois: é previsão.
 * `canceled` nunca entra.
 */
export const STATUS_POR_REGIME: Record<Regime, string[]> = {
  competencia: ["settled", "reconciled", "pending"],
  caixa: ["settled", "reconciled"],
};

export function explicaRegime(regime: Regime): string {
  return regime === "competencia"
    ? "Regime de COMPETÊNCIA: datado por accrual_date; inclui liquidados, conciliados e pendentes (fato ocorrido, ainda que não pago). Exclui agendados (previsão) e cancelados."
    : "Regime de CAIXA: datado por cash_date; inclui apenas liquidados e conciliados (dinheiro que de fato entrou ou saiu).";
}

export interface ProvenienciaInput {
  fonte: string;
  escopo: string;
  periodo?: string;
  regime?: Regime;
  linhas: number;
  como_calculado: string;
  avisos?: string[];
}

export function proveniencia(input: ProvenienciaInput): Proveniencia {
  const avisos = input.avisos?.filter((a) => a.length > 0);
  return {
    fonte: input.fonte,
    escopo: input.escopo,
    ...(input.periodo ? { periodo: input.periodo } : {}),
    ...(input.regime
      ? { regime: input.regime, status_incluidos: STATUS_POR_REGIME[input.regime] }
      : {}),
    moeda: "BRL",
    linhas: input.linhas,
    como_calculado: input.regime
      ? `${input.como_calculado} ${explicaRegime(input.regime)}`
      : input.como_calculado,
    ...(avisos && avisos.length > 0 ? { avisos } : {}),
  };
}

/** Aviso obrigatório quando o resultado bateu no teto — silêncio aqui vira conclusão errada. */
export function avisoTruncamento(linhas: number, limite: number): string[] {
  return linhas >= limite
    ? [
        `Resultado truncado em ${limite} linhas. Há provavelmente mais dados: reduza o período ou aplique mais filtros antes de concluir qualquer coisa sobre totais.`,
      ]
    : [];
}
