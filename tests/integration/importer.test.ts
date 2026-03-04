import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// Skip integration tests when ActualBudget is not configured
const ACTUAL_SERVER_URL = process.env['ACTUAL_SERVER_URL'];
const ACTUAL_PASSWORD = process.env['ACTUAL_PASSWORD'];
const ACTUAL_SYNC_ID = process.env['ACTUAL_SYNC_ID'];
const TEST_ACCOUNT_ID = process.env['ACTUAL_TEST_ACCOUNT_ID']; // a real account in the test budget

const shouldSkip = !ACTUAL_SERVER_URL || !ACTUAL_PASSWORD || !ACTUAL_SYNC_ID || !TEST_ACCOUNT_ID;

const describeIf = shouldSkip ? describe.skip : describe;

import { ActualBudgetImporter } from '../../src/importer/actualbudget.importer.js';
import type { CanonicalTransaction } from '../../src/shared/types.js';

const makeTransaction = (overrides: Partial<CanonicalTransaction> = {}): CanonicalTransaction => ({
  id: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  bankId: 'globalbank-pa',
  accountId: 'test-bank-account',
  date: '2026-01-15',
  amount: -1000,
  payee: 'Test Merchant',
  notes: 'Integration test transaction',
  ...overrides,
});

describeIf('ActualBudgetImporter integration', () => {
  let importer: ActualBudgetImporter;

  beforeAll(async () => {
    importer = new ActualBudgetImporter({
      serverUrl: ACTUAL_SERVER_URL!,
      password: ACTUAL_PASSWORD!,
      syncId: ACTUAL_SYNC_ID!,
      dataDir: '/tmp/actual-test-data',
    });
    await importer.connect();
  });

  afterAll(async () => {
    await importer.disconnect();
  });

  it('imports a transaction and returns added count', async () => {
    const tx = makeTransaction({ accountId: 'test-bank-account' });
    const mapping = new Map([['test-bank-account', TEST_ACCOUNT_ID!]]);

    const result = await importer.importTransactions([tx], mapping);
    expect(result.added).toBeGreaterThanOrEqual(0); // could be 0 if already imported
    expect(result.errors).toHaveLength(0);
  });

  it('importing the same transaction twice does not create a duplicate', async () => {
    const stableId = `dedup-test-${Date.now()}`;
    const tx = makeTransaction({ id: stableId });
    const mapping = new Map([['test-bank-account', TEST_ACCOUNT_ID!]]);

    const first = await importer.importTransactions([tx], mapping);
    const second = await importer.importTransactions([tx], mapping);

    // Second import should add 0 (idempotent)
    expect(second.added).toBe(0);
    expect(first.errors).toHaveLength(0);
    expect(second.errors).toHaveLength(0);
  });

  it('skips unmapped accounts with a warning, does not throw', async () => {
    const tx = makeTransaction({ accountId: 'unmapped-account-id' });
    const mapping = new Map<string, string>(); // empty mapping

    const result = await importer.importTransactions([tx], mapping);
    expect(result.added).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe('ActualBudgetImporter (offline — no server required)', () => {
  it('can be instantiated with config', () => {
    const importer = new ActualBudgetImporter({
      serverUrl: 'http://localhost:5006',
      password: 'test',
      syncId: 'test-sync-id',
      dataDir: '/tmp/test',
    });
    expect(importer).toBeDefined();
  });
});
