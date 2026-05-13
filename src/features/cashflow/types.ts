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
  closing_balance: number;
}
