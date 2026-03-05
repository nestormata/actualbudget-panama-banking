import * as actualApi from '@actual-app/api';
import * as fs from 'node:fs';
import type { CanonicalTransaction } from '../shared/types.js';
import { createLogger } from '../shared/logger.js';
import { ImportRegistry } from './import-registry.js';

export interface ActualBudgetConfig {
  serverUrl: string;
  password: string;
  syncId: string;
  /** Local directory for ActualBudget data files. */
  dataDir: string;
  /** Directory for per-account import registry files. Defaults to /app/data. */
  registryDir?: string;
}

export interface ImportResult {
  added: number;
  skipped: number;
  deduplicated: number;
  errors: Array<{ accountId: string; error: Error }>;
}

/**
 * Imports canonical transactions into a self-hosted ActualBudget instance.
 * Uses `imported_id` on each transaction for idempotency (no duplicates).
 * Also maintains a local per-account registry to prevent re-importing
 * transactions that were deleted from ActualBudget.
 */
export class ActualBudgetImporter {
  private connected = false;
  private readonly logger = createLogger({ bankId: 'actualbudget' });
  private readonly registryDir: string;

  constructor(private readonly config: ActualBudgetConfig) {
    this.registryDir = config.registryDir ?? '/app/data';
  }

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
   * Transactions already present in the local registry are skipped.
   * @param transactions List of normalized transactions to import
   * @param accountMapping Map of bankAccountId → actualBudgetAccountId
   */
  async importTransactions(
    transactions: CanonicalTransaction[],
    accountMapping: Map<string, string>,
  ): Promise<ImportResult> {
    const result: ImportResult = { added: 0, skipped: 0, deduplicated: 0, errors: [] };

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
        // Filter out transactions already in the local registry
        const registry = new ImportRegistry(this.registryDir, txs[0]?.bankId ?? 'unknown', bankAccountId);
        registry.load();

        const newTxs = txs.filter((tx) => !registry.has(tx.id));
        const deduplicated = txs.length - newTxs.length;
        result.deduplicated += deduplicated;

        if (deduplicated > 0) {
          this.logger.info(
            { bankAccountId, deduplicated },
            `Skipped ${deduplicated} already-imported transaction(s) via local registry`,
          );
        }

        if (newTxs.length === 0) continue;

        const importPayload = newTxs.map((tx) => ({
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

        // Record newly imported IDs in the registry
        registry.addAll(newTxs.map((tx) => tx.id));

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

