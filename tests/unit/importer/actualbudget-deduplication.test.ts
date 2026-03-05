import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Mock @actual-app/api before importing the importer
jest.mock('@actual-app/api', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  init: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  downloadBudget: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  importTransactions: jest.fn<() => Promise<any>>().mockResolvedValue({ added: [] }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shutdown: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
}));

import * as actualApi from '@actual-app/api';
import { ActualBudgetImporter } from '../../../src/importer/actualbudget.importer.js';
import type { CanonicalTransaction } from '../../../src/shared/types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockImportTransactions = actualApi.importTransactions as jest.MockedFunction<any>;

const VALID_ID = (n: number) => n.toString(16).padStart(64, '0');

function makeTx(id: string, accountId = 'acc-1'): CanonicalTransaction {
  return { id, bankId: 'test-bank', accountId, date: '2026-03-01', amount: -1000, payee: 'Shop', notes: null };
}

let tmpDir: string;
let importer: ActualBudgetImporter;
let accountMapping: Map<string, string>;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'importer-test-'));
  importer = new ActualBudgetImporter({
    serverUrl: 'http://localhost',
    password: 'test',
    syncId: 'test-sync',
    dataDir: path.join(tmpDir, 'actual'),
    registryDir: path.join(tmpDir, 'registry'),
  });
  accountMapping = new Map([['acc-1', 'ab-uuid-1']]);
  mockImportTransactions.mockResolvedValue({ added: [] });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  jest.clearAllMocks();
});

describe('ActualBudgetImporter deduplication', () => {
  it('imports new transactions and records them in the registry', async () => {
    const tx = makeTx(VALID_ID(1));
    mockImportTransactions.mockResolvedValue({ added: [tx.id] });

    const result = await importer.importTransactions([tx], accountMapping);

    expect(mockImportTransactions).toHaveBeenCalledTimes(1);
    expect(result.added).toBe(1);
    expect(result.deduplicated).toBe(0);
  });

  it('skips transactions already in the registry', async () => {
    const id = VALID_ID(1);
    // Pre-seed the registry
    const regDir = path.join(tmpDir, 'registry', 'test-bank');
    fs.mkdirSync(regDir, { recursive: true });
    fs.writeFileSync(path.join(regDir, 'acc-1.txt'), `${id}\n`);

    const result = await importer.importTransactions([makeTx(id)], accountMapping);

    expect(mockImportTransactions).not.toHaveBeenCalled();
    expect(result.deduplicated).toBe(1);
    expect(result.added).toBe(0);
  });

  it('imports only the new transactions when some are already in the registry', async () => {
    const oldId = VALID_ID(1);
    const newId = VALID_ID(2);
    // Pre-seed old ID
    const regDir = path.join(tmpDir, 'registry', 'test-bank');
    fs.mkdirSync(regDir, { recursive: true });
    fs.writeFileSync(path.join(regDir, 'acc-1.txt'), `${oldId}\n`);

    mockImportTransactions.mockResolvedValue({ added: [newId] });

    const result = await importer.importTransactions([makeTx(oldId), makeTx(newId)], accountMapping);

    expect(result.deduplicated).toBe(1);
    expect(result.added).toBe(1);
    // Only the new transaction should have been sent to ActualBudget
    const payload = mockImportTransactions.mock.calls[0]?.[1] as { imported_id: string }[];
    expect(payload).toHaveLength(1);
    expect(payload[0]?.imported_id).toBe(newId);
  });
});
