export interface AccountMapping {
  /** Bank-side account identifier. */
  bankAccountId: string;
  /** ActualBudget account ID this maps to. */
  actualBudgetAccountId: string;
  /** Number of past days to fetch transactions for. Defaults to 30. */
  daysToFetch: number;
}

export interface BankConfig {
  /** Unique bank identifier matching a registered connector (e.g. "globalbank-pa"). */
  bankId: string;
  /** Account mappings for this bank. */
  accounts: AccountMapping[];
}

export interface Config {
  /** node-cron expression for the sync schedule. Default: "0 8 * * *" (daily at 08:00). */
  syncIntervalCron: string;
  /** List of bank configurations. */
  banks: BankConfig[];
}

export interface EnvConfig {
  actualServerUrl: string;
  actualPassword: string;
  actualSyncId: string;
  logLevel: string;
  browserHeadless: boolean;
}
