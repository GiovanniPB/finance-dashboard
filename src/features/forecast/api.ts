import { supabase } from "@/lib/supabase";

export interface ForecastDay {
  day: string;
  inflowExpected: number;
  outflowExpected: number;
  inflowRecurring: number;
  outflowRecurring: number;
  runningBalance: number;
}

export async function fetchForecast(
  companyId: string,
  from: string,
  to: string,
): Promise<ForecastDay[]> {
  const { data, error } = await supabase.rpc("forecast_cashflow_daily", {
    p_company_id: companyId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    day: r.day,
    inflowExpected: r.inflow_expected,
    outflowExpected: r.outflow_expected,
    inflowRecurring: r.inflow_recurring,
    outflowRecurring: r.outflow_recurring,
    runningBalance: r.running_balance,
  }));
}

export type Scenario = "realistic" | "pessimistic" | "optimistic";

/**
 * Apply a scenario adjustment to the realistic baseline. Each scenario shifts
 * the AR/AP timing without re-querying the database — we re-bucket inflows
 * and outflows by N days and then re-cumulate the running balance.
 */
export function applyScenario(baseline: ForecastDay[], scenario: Scenario): ForecastDay[] {
  if (scenario === "realistic" || baseline.length === 0) return baseline;

  // Shift days for AR and AP separately. Pessimistic: AR +7, AP -3 (worse).
  //                                       Optimistic: AR -3, AP +0.
  const arShift = scenario === "pessimistic" ? 7 : -3;
  const apShift = scenario === "pessimistic" ? -3 : 0;

  const indexByDay = new Map<string, number>();
  baseline.forEach((d, idx) => indexByDay.set(d.day, idx));

  const shifted = baseline.map((d) => ({
    ...d,
    inflowExpected: 0,
    outflowExpected: 0,
  }));

  // Carry forward the opening balance: subtract baseline's net deltas, we'll
  // rebuild from scratch using shifted flows + same recurring flows.
  const opening =
    baseline[0].runningBalance -
    (baseline[0].inflowExpected +
      baseline[0].inflowRecurring -
      baseline[0].outflowExpected -
      baseline[0].outflowRecurring);

  // Move each day's AR/AP into the shifted slot (clamped to the window).
  for (let i = 0; i < baseline.length; i += 1) {
    const src = baseline[i];
    const arTargetIdx = clamp(i + arShift, 0, baseline.length - 1);
    const apTargetIdx = clamp(i + apShift, 0, baseline.length - 1);
    shifted[arTargetIdx].inflowExpected += src.inflowExpected;
    shifted[apTargetIdx].outflowExpected += src.outflowExpected;
  }

  // Re-cumulate running balance.
  let acc = opening;
  for (const d of shifted) {
    acc += d.inflowExpected + d.inflowRecurring - d.outflowExpected - d.outflowRecurring;
    d.runningBalance = acc;
  }
  return shifted;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
