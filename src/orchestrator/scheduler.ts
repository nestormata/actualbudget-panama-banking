import cron from 'node-cron';
import type { Config } from '../config/config.types.js';
import type { EnvConfig } from '../config/config.types.js';
import type { ConnectorRegistry } from '../shared/connector-registry.js';
import { runSyncCycle } from './sync.pipeline.js';
import { createLogger } from '../shared/logger.js';

const logger = createLogger();

/**
 * Start the cron-based sync scheduler.
 * Runs a sync cycle on the given schedule and handles graceful shutdown.
 */
export function startScheduler(
  config: Config,
  envConfig: EnvConfig,
  registry: ConnectorRegistry,
): void {
  const cronExpression = config.syncIntervalCron;

  logger.info({ cronExpression }, 'Starting sync scheduler');

  const task = cron.schedule(cronExpression, async () => {
    logger.info('Starting scheduled sync cycle...');
    try {
      const result = await runSyncCycle(config, envConfig, registry);
      if (result.success) {
        logger.info({ bankResults: result.bankResults }, 'Sync cycle completed successfully');
      } else {
        logger.warn({ bankResults: result.bankResults }, 'Sync cycle completed with errors');
      }
    } catch (err) {
      logger.error({ err }, 'Unhandled error in sync cycle');
    }
  });

  // Graceful shutdown on SIGTERM (Docker stop) and SIGINT (Ctrl+C)
  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Received shutdown signal — stopping scheduler');
    task.stop();
    process.exit(0);
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  logger.info(`Scheduler running. Next run: ${cronExpression}`);
}
