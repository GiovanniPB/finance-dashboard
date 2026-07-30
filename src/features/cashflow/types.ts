export interface CashflowPeriod {
  /** ISO date YYYY-MM-DD — start of the bucket (day or month). */
  bucket: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface CashflowPeriodWithBalance extends CashflowPeriod {
  /** Cumulative balance assuming starting balance of `openingBalance`. */
  cumulative: number;
}

export type CashflowGranularity = "daily" | "monthly";

export interface BankAccountBalance {
  bank_account_id: string;
  bank_name: string;
  nickname: string;
  account_type: string;
  /** Saldo cadastrado na conta, ponto de partida do cálculo. */
  initial_balance: number;
  /** Entradas liquidadas até a data de corte. */
  inflow: number;
  /** Saídas liquidadas até a data de corte. */
  outflow: number;
  /** initial_balance + inflow − outflow. */
  closing_balance: number;
}
