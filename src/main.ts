import { loadConfig } from './config/config.loader.js';
import { loadEnvConfig } from './config/env.config.js';
import { connectorRegistry } from './connectors/index.js';
import { runSyncCycle } from './orchestrator/sync.pipeline.js';
import { startScheduler } from './orchestrator/scheduler.js';
import { createLogger } from './shared/logger.js';

const logger = createLogger();

/**
 * Parse command-line arguments.
 * Usage:
 *   node dist/main.js --run-once              # single sync then exit
 *   node dist/main.js                          # start scheduler (default)
 *   CONFIG_PATH=/app/config.json node dist/main.js
 */
function parseArgs(): { runOnce: boolean; configPath: string } {
  const runOnce = process.argv.includes('--run-once');
  const configPathIdx = process.argv.indexOf('--config');
  const configPath =
    configPathIdx !== -1 ? process.argv[configPathIdx + 1] :
    process.env['CONFIG_PATH'] ?? '/app/config.json';
  return { runOnce, configPath };
}

async function main(): Promise<void> {
  const { runOnce, configPath } = parseArgs();

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
