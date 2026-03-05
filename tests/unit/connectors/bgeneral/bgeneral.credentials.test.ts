import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ConfigError } from '../../../../src/shared/errors.js';

// Dynamically import so we can reset module state between tests
async function load(): Promise<typeof import('../../../../src/connectors/bgeneral/bgeneral.credentials.js').loadBgeneralCredentials> {
  // Clear module cache so env var changes take effect
  const mod = await import('../../../../src/connectors/bgeneral/bgeneral.credentials.js');
  return mod.loadBgeneralCredentials;
}

const VALID_QA = JSON.stringify([{ pattern: 'escuela.*primaria', answer: 'mi escuela' }]);

describe('loadBgeneralCredentials()', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env['BGENERAL_USER'] = 'testuser';
    process.env['BGENERAL_PASS'] = 'testpass';
    process.env['BGENERAL_SECURITY_QA'] = VALID_QA;
  });

  afterEach(() => {
    for (const key of ['BGENERAL_USER', 'BGENERAL_PASS', 'BGENERAL_SECURITY_QA']) {
      if (original[key] !== undefined) {
        process.env[key] = original[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it('returns credentials when all env vars are valid', async () => {
    const loadBgeneralCredentials = await load();
    const creds = loadBgeneralCredentials();
    expect(creds.username).toBe('testuser');
    expect(creds.password).toBe('testpass');
    expect(creds.securityQA).toHaveLength(1);
    expect(creds.securityQA[0].pattern).toBe('escuela.*primaria');
  });

  it('throws ConfigError when BGENERAL_USER is missing', async () => {
    delete process.env['BGENERAL_USER'];
    const loadBgeneralCredentials = await load();
    expect(() => loadBgeneralCredentials()).toThrow(ConfigError);
    expect(() => loadBgeneralCredentials()).toThrow('BGENERAL_USER');
  });

  it('throws ConfigError when BGENERAL_PASS is missing', async () => {
    delete process.env['BGENERAL_PASS'];
    const loadBgeneralCredentials = await load();
    expect(() => loadBgeneralCredentials()).toThrow(ConfigError);
    expect(() => loadBgeneralCredentials()).toThrow('BGENERAL_PASS');
  });

  it('throws ConfigError when BGENERAL_SECURITY_QA is missing', async () => {
    delete process.env['BGENERAL_SECURITY_QA'];
    const loadBgeneralCredentials = await load();
    expect(() => loadBgeneralCredentials()).toThrow(ConfigError);
    expect(() => loadBgeneralCredentials()).toThrow('BGENERAL_SECURITY_QA');
  });

  it('throws ConfigError when BGENERAL_SECURITY_QA is not valid JSON', async () => {
    process.env['BGENERAL_SECURITY_QA'] = 'not-json';
    const loadBgeneralCredentials = await load();
    expect(() => loadBgeneralCredentials()).toThrow(ConfigError);
  });

  it('error message for malformed JSON shows expected format but not the raw value', async () => {
    const rawValue = 'not-json-secret-data';
    process.env['BGENERAL_SECURITY_QA'] = rawValue;
    const loadBgeneralCredentials = await load();
    let errorMessage = '';
    try {
      loadBgeneralCredentials();
    } catch (e) {
      errorMessage = (e as Error).message;
    }
    expect(errorMessage).not.toContain(rawValue);
    expect(errorMessage).toMatch(/BGENERAL_SECURITY_QA/);
    expect(errorMessage).toMatch(/pattern.*answer/i);
  });

  it('throws ConfigError when BGENERAL_SECURITY_QA is not an array', async () => {
    process.env['BGENERAL_SECURITY_QA'] = '{"pattern":"x","answer":"y"}';
    const loadBgeneralCredentials = await load();
    expect(() => loadBgeneralCredentials()).toThrow(ConfigError);
  });

  it('throws ConfigError when a QA entry is missing pattern', async () => {
    process.env['BGENERAL_SECURITY_QA'] = JSON.stringify([{ answer: 'only-answer' }]);
    const loadBgeneralCredentials = await load();
    expect(() => loadBgeneralCredentials()).toThrow(ConfigError);
  });

  it('throws ConfigError when a QA entry is missing answer', async () => {
    process.env['BGENERAL_SECURITY_QA'] = JSON.stringify([{ pattern: 'only-pattern' }]);
    const loadBgeneralCredentials = await load();
    expect(() => loadBgeneralCredentials()).toThrow(ConfigError);
  });

  it('securityQA answer is accessible on the returned object (not stripped)', async () => {
    const loadBgeneralCredentials = await load();
    const creds = loadBgeneralCredentials();
    // Answers must be usable — just never logged or serialised
    expect(typeof creds.securityQA[0].answer).toBe('string');
    expect(creds.securityQA[0].answer.length).toBeGreaterThan(0);
  });
});
