import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { loadConfig } from '../../../src/config/config.loader.js';
import { loadEnvConfig } from '../../../src/config/env.config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ConfigError } from '../../../src/shared/errors.js';

const validConfig = {
  syncIntervalCron: '0 8 * * *',
  banks: [
    {
      bankId: 'globalbank-pa',
      accounts: [
        { bankAccountId: '001-123456-7', actualBudgetAccountId: 'abc123', daysToFetch: 30 },
      ],
    },
  ],
};

describe('loadConfig', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `config-test-${Date.now()}.json`);
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('parses a valid config', () => {
    fs.writeFileSync(tmpFile, JSON.stringify(validConfig));
    const config = loadConfig(tmpFile);
    expect(config.syncIntervalCron).toBe('0 8 * * *');
    expect(config.banks).toHaveLength(1);
  });

  it('throws ConfigError for missing syncIntervalCron', () => {
    const bad = { banks: [] };
    fs.writeFileSync(tmpFile, JSON.stringify(bad));
    expect(() => loadConfig(tmpFile)).toThrow(ConfigError);
  });

  it('throws ConfigError for missing banks array', () => {
    const bad = { syncIntervalCron: '0 8 * * *' };
    fs.writeFileSync(tmpFile, JSON.stringify(bad));
    expect(() => loadConfig(tmpFile)).toThrow(ConfigError);
  });

  it('throws ConfigError for non-existent file', () => {
    expect(() => loadConfig('/nonexistent/path/config.json')).toThrow(ConfigError);
  });
});

describe('loadEnvConfig', () => {
  const saved: Record<string, string | undefined> = {};
  const vars = ['ACTUAL_SERVER_URL', 'ACTUAL_PASSWORD', 'ACTUAL_SYNC_ID'];

  beforeEach(() => {
    vars.forEach((v) => { saved[v] = process.env[v]; });
    process.env.ACTUAL_SERVER_URL = 'http://localhost:5006';
    process.env.ACTUAL_PASSWORD = 'secret';
    process.env.ACTUAL_SYNC_ID = 'budget-id';
  });

  afterEach(() => {
    vars.forEach((v) => {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    });
  });

  it('loads valid env config', () => {
    const cfg = loadEnvConfig();
    expect(cfg.actualServerUrl).toBe('http://localhost:5006');
    expect(cfg.actualPassword).toBe('secret');
    expect(cfg.actualSyncId).toBe('budget-id');
  });

  it('throws ConfigError with field name when ACTUAL_SERVER_URL missing', () => {
    delete process.env.ACTUAL_SERVER_URL;
    try {
      loadEnvConfig();
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as ConfigError).field).toBe('ACTUAL_SERVER_URL');
    }
  });

  it('throws ConfigError with field name when ACTUAL_PASSWORD missing', () => {
    delete process.env.ACTUAL_PASSWORD;
    try {
      loadEnvConfig();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as ConfigError).field).toBe('ACTUAL_PASSWORD');
    }
  });

  it('throws ConfigError with field name when ACTUAL_SYNC_ID missing', () => {
    delete process.env.ACTUAL_SYNC_ID;
    try {
      loadEnvConfig();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as ConfigError).field).toBe('ACTUAL_SYNC_ID');
    }
  });
});
