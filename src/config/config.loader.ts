import * as fs from 'node:fs';
import type { Config } from './config.types.js';
import { ConfigError } from '../shared/errors.js';

/**
 * Load and validate the JSON configuration file.
 * @param filePath Absolute path to config.json
 * @throws {ConfigError} if the file is missing or invalid
 */
export function loadConfig(filePath: string): Config {
  if (!fs.existsSync(filePath)) {
    throw new ConfigError(`Config file not found: ${filePath}`, 'filePath');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    throw new ConfigError(`Failed to parse config file: ${(e as Error).message}`, 'filePath');
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new ConfigError('Config must be a JSON object');
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj['syncIntervalCron'] !== 'string') {
    throw new ConfigError('Missing required field: syncIntervalCron', 'syncIntervalCron');
  }

  if (!Array.isArray(obj['banks'])) {
    throw new ConfigError('Missing required field: banks (must be an array)', 'banks');
  }

  return obj as unknown as Config;
}
