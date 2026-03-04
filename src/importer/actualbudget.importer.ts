import * as actualApi from '@actual-app/api';
import * as fs from 'node:fs';
import type { CanonicalTransaction } from '../shared/types.js';
import { createLogger } from '../shared/logger.js';

export interface ActualBudgetConfig {
  serverUrl: string;
  password: string;
  syncId: string;
  /** Local directory for ActualBudget data files. */
  dataDir: string;
}

export interface ImportResult {
  added: number;
  skipped: number;
  errors: Array<{ accountId: string; error: Error }>;
}

/**
 * Imports canonical transactions into a self-hosted ActualBudget instance.
 * Uses `imported_id` on each transaction for idempotency (no duplicates).
 */
export class ActualBudgetImporter {
  private connected = false;
  private readonly logger = createLogger({ bankId: 'actualbudget' });

  constructor(private readonly config: ActualBudgetConfig) {}

  /**
   * Initialize the ActualBudget API and download the budget.
   */
  async connect(): Promise<void> {
    fs.mkdirSync(this.config.dataDir, { recursive: true });

    await actualApi.init({
      serverURL: this.config.serverUrl,
      password: this.config.password,
      dataDir: this.config.dataDir,
    });

    await actualApi.downloadBudget(this.config.syncId);
    this.connected = true;
    this.logger.info('Connected to ActualBudget');
  }

  /**
   * Import canonical transactions into ActualBudget.
   * @param transactions List of normalized transactions to import
   * @param accountMapping Map of bankAccountId → actualBudgetAccountId
   */
  async importTransactions(
    transactions: CanonicalTransaction[],
    accountMapping: Map<string, string>,
  ): Promise<ImportResult> {
    const result: ImportResult = { added: 0, skipped: 0, errors: [] };

    // Group transactions by bankAccountId
    const byBankAccount = new Map<string, CanonicalTransaction[]>();
    for (const tx of transactions) {
      const group = byBankAccount.get(tx.accountId) ?? [];
      group.push(tx);
      byBankAccount.set(tx.accountId, group);
    }

    for (const [bankAccountId, txs] of byBankAccount.entries()) {
      const actualAccountId = accountMapping.get(bankAccountId);

      if (!actualAccountId) {
        this.logger.warn(
          { bankAccountId },
          `No ActualBudget mapping for bank account "${bankAccountId}" — skipping ${txs.length} transactions`,
        );
        result.skipped += txs.length;
        continue;
      }

      try {
        const importPayload = txs.map((tx) => ({
          account: actualAccountId,
          date: tx.date,
          amount: tx.amount,
          payee_name: tx.payee,
          imported_payee: tx.payee,
          notes: tx.notes ?? undefined,
          imported_id: tx.id,
          cleared: true,
        }));

        const importResult = await actualApi.importTransactions(actualAccountId, importPayload);
        const added = importResult.added?.length ?? 0;
        result.added += added;

        this.logger.info(
          { bankAccountId, actualAccountId, added },
          `Imported ${added} transactions for account ${bankAccountId}`,
        );
      } catch (e) {
        this.logger.error({ err: e, bankAccountId }, `Failed to import transactions for ${bankAccountId}`);
        result.errors.push({ accountId: bankAccountId, error: e as Error });
      }
    }

    return result;
  }

  /**
   * Commit pending changes and close the ActualBudget connection.
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      await actualApi.shutdown();
      this.connected = false;
      this.logger.info('Disconnected from ActualBudget');
    }
  }
}
