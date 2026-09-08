/**
 * Reexport do motor de apuração.
 *
 * A implementação vive em `supabase/functions/_shared/tax/apuracao.ts` porque o mesmo
 * cálculo é usado pela tela e pelas tools de MCP — e o número que sai dele é o que se
 * paga à Receita. Duas implementações seria questão de tempo até a IA e o dashboard
 * discordarem sobre o imposto devido.
 *
 * Importe daqui no app; não duplique a regra.
 */
export {
  computeAssessment,
  type AllowanceMode,
  type AssessmentInputs,
  type AssessmentResult,
  type ClassBreakdown,
  type ComputedLine,
  type InputLine,
  type LineKind,
  type PeriodKind,
  type PresumptionClass,
  type PresumptionTier,
  type TaxRule,
} from "../../../supabase/functions/_shared/tax/apuracao.ts";
