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
  /**
   * Deduplication matching mode for the local import registry.
   *
   * - "loose" (default): a transaction is a duplicate if date + amount + payee all match.
   *   Use when the bank portal does not provide stable transaction IDs.
   *
   * - "strict": a transaction is a duplicate only when date + amount + payee + bankTxId
   *   all match. Requires the connector to supply bankTxId. Prevents false positives when
   *   two different transactions happen to share the same date, amount, and payee text.
   */
  deduplication?: 'strict' | 'loose';
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
