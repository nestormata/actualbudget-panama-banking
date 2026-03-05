import { loadConfig } from './config/config.loader.js';
import { loadEnvConfig } from './config/env.config.js';
import { connectorRegistry } from './connectors/index.js';
import { ImportRegistry } from './importer/import-registry.js';
import { runSyncCycle } from './orchestrator/sync.pipeline.js';
import { startScheduler } from './orchestrator/scheduler.js';
import { createLogger } from './shared/logger.js';

const logger = createLogger();

const REGISTRY_DIR = process.env['REGISTRY_DIR'] ?? '/app/data';

/**
 * Parse command-line arguments.
 * Usage:
 *   node dist/main.js --run-once                              # single sync then exit
 *   node dist/main.js                                          # start scheduler (default)
 *   node dist/main.js --clear-registry                        # clear all registries, then sync
 *   node dist/main.js --clear-registry --bank <bankId>        # clear one bank's registry, then sync
 *   node dist/main.js --clear-registry --bank <id> --account <id>  # clear one account, then sync
 *   CONFIG_PATH=/app/config.json node dist/main.js
 */
function parseArgs(): {
  runOnce: boolean;
  configPath: string;
  clearRegistry: boolean;
  bank?: string;
  account?: string;
} {
  const args = process.argv;
  const runOnce = args.includes('--run-once');
  const clearRegistry = args.includes('--clear-registry');

  const configPathIdx = args.indexOf('--config');
  const configPath =
    configPathIdx !== -1 ? args[configPathIdx + 1] :
    process.env['CONFIG_PATH'] ?? '/app/config.json';

  const bankIdx = args.indexOf('--bank');
  const bank = bankIdx !== -1 ? args[bankIdx + 1] : undefined;

  const accountIdx = args.indexOf('--account');
  const account = accountIdx !== -1 ? args[accountIdx + 1] : undefined;

  return { runOnce, configPath, clearRegistry, bank, account };
}

async function main(): Promise<void> {
  const { runOnce, configPath, clearRegistry, bank, account } = parseArgs();

  if (clearRegistry) {
    ImportRegistry.clear(REGISTRY_DIR, bank, account);
    const scope = account ? `account ${account}` : bank ? `bank ${bank}` : 'all accounts';
    logger.info({ bank, account }, `Registry cleared for ${scope} — will re-import on next sync`);
  }

  logger.info({ configPath }, 'Loading configuration...');
  const config = loadConfig(configPath);
  const envConfig = loadEnvConfig();

  if (runOnce) {
    logger.info('Running single sync cycle (--run-once)...');
    const result = await runSyncCycle(config, envConfig, connectorRegistry);
    const exitCode = result.success ? 0 : 1;
    logger.info({ success: result.success, bankResults: result.bankResults }, 'Sync complete');
    process.exit(exitCode);
  } else {
    startScheduler(config, envConfig, connectorRegistry);
  }
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});
