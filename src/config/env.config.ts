import type { EnvConfig } from './config.types.js';
import { ConfigError } from '../shared/errors.js';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new ConfigError(`Missing required environment variable: ${name}`, name);
  return val;
}

/**
 * Load and validate environment variable configuration.
 * @throws {ConfigError} if any required variable is missing
 */
export function loadEnvConfig(): EnvConfig {
  return {
    actualServerUrl: requireEnv('ACTUAL_SERVER_URL'),
    actualPassword: requireEnv('ACTUAL_PASSWORD'),
    actualSyncId: requireEnv('ACTUAL_SYNC_ID'),
    logLevel: process.env['LOG_LEVEL'] ?? 'info',
    browserHeadless: process.env['BROWSER_HEADLESS'] !== 'false',
  };
}
