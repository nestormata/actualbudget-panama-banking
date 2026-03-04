import type { Config, BankConfig } from '../config/config.types.js';
import type { EnvConfig } from '../config/config.types.js';
import type { ConnectorRegistry } from '../shared/connector-registry.js';
import { ActualBudgetImporter } from '../importer/actualbudget.importer.js';
import { createLogger } from '../shared/logger.js';
import { writeHealthStatus } from './health.js';

export interface OrchestratorResult {
  success: boolean;
  bankResults: Array<{
    bankId: string;
    accountsProcessed: number;
    transactionsAdded: number;
    errors: string[];
  }>;
}

/**
 * Run a single sync cycle: for each configured bank, connect the connector,
 * fetch transactions for each account, normalize, and import into ActualBudget.
 * Each bank runs in isolation — failure of one bank does not block others.
 */
export async function runSyncCycle(
  config: Config,
  envConfig: EnvConfig,
  registry: ConnectorRegistry,
): Promise<OrchestratorResult> {
  const logger = createLogger();
  const result: OrchestratorResult = { success: true, bankResults: [] };

  const importer = new ActualBudgetImporter({
    serverUrl: envConfig.actualServerUrl,
    password: envConfig.actualPassword,
    syncId: envConfig.actualSyncId,
    dataDir: process.env['ACTUAL_DATA_DIR'] ?? '/app/actual-data',
  });

  logger.info('Connecting to ActualBudget...');
  await importer.connect();

  for (const bankConfig of config.banks) {
    const bankResult = await processBankConfig(bankConfig, envConfig, registry, importer, logger);
    result.bankResults.push(bankResult);
    if (bankResult.errors.length > 0) {
      result.success = false;
    }
  }

  await importer.disconnect();

  await writeHealthStatus({
    lastRunAt: new Date().toISOString(),
    success: result.success,
    bankResults: result.bankResults,
  });

  return result;
}

async function processBankConfig(
  bankConfig: BankConfig,
  envConfig: EnvConfig,
  registry: ConnectorRegistry,
  importer: ActualBudgetImporter,
  logger: ReturnType<typeof createLogger>,
): Promise<OrchestratorResult['bankResults'][0]> {
  const { bankId } = bankConfig;
  const bankLogger = createLogger({ bankId });
  const bankResult = { bankId, accountsProcessed: 0, transactionsAdded: 0, errors: [] as string[] };

  let connector;
  try {
    connector = registry.get(bankId);
  } catch (e) {
    const msg = `No connector registered for "${bankId}": ${(e as Error).message}`;
    bankLogger.error(msg);
    bankResult.errors.push(msg);
    return bankResult;
  }

  try {
    bankLogger.info('Connecting to bank...');
    await connector.connect();

    // Build account mapping
    const accountMapping = new Map<string, string>();
    for (const acct of bankConfig.accounts) {
      accountMapping.set(acct.bankAccountId, acct.actualBudgetAccountId);
    }

    const daysToFetch = Math.max(...bankConfig.accounts.map((a) => a.daysToFetch ?? 30));
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysToFetch);
    const toDate = new Date();

    for (const acctConfig of bankConfig.accounts) {
      try {
        bankLogger.info({ accountId: acctConfig.bankAccountId }, 'Fetching transactions...');
        const raw = await connector.getTransactions(acctConfig.bankAccountId, fromDate, toDate);
        const canonical = connector.normalize(raw, acctConfig.bankAccountId);

        const importResult = await importer.importTransactions(canonical, accountMapping);
        bankResult.accountsProcessed++;
        bankResult.transactionsAdded += importResult.added;

        bankLogger.info(
          { accountId: acctConfig.bankAccountId, added: importResult.added },
          'Account sync complete',
        );
      } catch (e) {
        const msg = `Account ${acctConfig.bankAccountId}: ${(e as Error).message}`;
        bankLogger.error({ err: e }, msg);
        bankResult.errors.push(msg);
      }
    }
  } catch (e) {
    const msg = `Bank connection failed: ${(e as Error).message}`;
    bankLogger.error({ err: e }, msg);
    bankResult.errors.push(msg);
  } finally {
    await connector.disconnect().catch((e: Error) => {
      logger.warn({ err: e }, `Error during ${bankId} disconnect (non-critical)`);
    });
  }

  return bankResult;
}
