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

function makeTx(id: string, accountId = 'acc-1'): CanonicalTransaction {
  return { id, bankId: 'test-bank', accountId, date: '2026-03-01', amount: -1000, payee: 'Shop', notes: null, bankTxId: null };
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
    const tx = makeTx('some-id');
    mockImportTransactions.mockResolvedValue({ added: [tx.id] });

    const result = await importer.importTransactions([tx], accountMapping);

    expect(mockImportTransactions).toHaveBeenCalledTimes(1);
    expect(result.added).toBe(1);
    expect(result.deduplicated).toBe(0);
  });

  it('skips transactions already in the registry', async () => {
    // Pre-seed the registry with new human-readable format
    const regDir = path.join(tmpDir, 'registry', 'test-bank');
    fs.mkdirSync(regDir, { recursive: true });
    fs.writeFileSync(
      path.join(regDir, 'acc-1.txt'),
      '# Import registry\n# Format: date|amount_cents|payee|bank_tx_id\n\n2026-03-01|-1000|Shop|\n',
    );

    const tx = makeTx('any-id');
    const result = await importer.importTransactions([tx], accountMapping);

    expect(mockImportTransactions).not.toHaveBeenCalled();
    expect(result.deduplicated).toBe(1);
    expect(result.added).toBe(0);
  });

  it('imports only the new transactions when some are already in the registry', async () => {
    // Pre-seed one transaction (date/amount/payee match for first tx)
    const regDir = path.join(tmpDir, 'registry', 'test-bank');
    fs.mkdirSync(regDir, { recursive: true });
    fs.writeFileSync(
      path.join(regDir, 'acc-1.txt'),
      '# Import registry\n# Format: date|amount_cents|payee|bank_tx_id\n\n2026-03-01|-1000|Shop|\n',
    );

    const newId = 'new-id';
    const newTx = makeTx(newId, 'acc-1');
    // Make the new tx distinct by different amount
    const distinctTx: CanonicalTransaction = { ...newTx, id: newId, amount: -2000, payee: 'OtherShop' };
    mockImportTransactions.mockResolvedValue({ added: [newId] });

    const result = await importer.importTransactions([makeTx('old-id'), distinctTx], accountMapping);

    expect(result.deduplicated).toBe(1);
    expect(result.added).toBe(1);
    const payload = mockImportTransactions.mock.calls[0]?.[1] as { imported_id: string }[];
    expect(payload).toHaveLength(1);
    expect(payload[0]?.imported_id).toBe(newId);
  });
});
