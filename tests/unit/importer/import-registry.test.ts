import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ImportRegistry } from '../../../src/importer/import-registry.js';
import type { CanonicalTransaction } from '../../../src/shared/types.js';

function makeTx(overrides: Partial<CanonicalTransaction> = {}): CanonicalTransaction {
  return {
    id: 'test-id',
    bankId: 'test-bank',
    accountId: 'acc-1',
    date: '2026-03-01',
    amount: -1000,
    payee: 'Shop',
    notes: null,
    bankTxId: null,
    ...overrides,
  };
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── has() / addAll() — loose mode ─────────────────────────────────────────────

describe('ImportRegistry — loose mode (default)', () => {
  it('returns false for a transaction not in the registry', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    expect(reg.has(makeTx(), 'loose')).toBe(false);
  });

  it('returns true after adding a transaction', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    const tx = makeTx();
    reg.addAll([tx]);
    expect(reg.has(tx, 'loose')).toBe(true);
  });

  it('matches on date + amount + payee regardless of bankTxId', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([makeTx({ bankTxId: 'portal-111' })]);
    // Same date/amount/payee but different bankTxId — still a match in loose mode
    expect(reg.has(makeTx({ bankTxId: 'portal-999' }), 'loose')).toBe(true);
  });

  it('does not match different amount', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([makeTx({ amount: -1000 })]);
    expect(reg.has(makeTx({ amount: -2000 }), 'loose')).toBe(false);
  });

  it('does not match different payee', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([makeTx({ payee: 'Shop A' })]);
    expect(reg.has(makeTx({ payee: 'Shop B' }), 'loose')).toBe(false);
  });
});

// ── has() — strict mode ───────────────────────────────────────────────────────

describe('ImportRegistry — strict mode', () => {
  it('matches when date + amount + payee + bankTxId all match', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    const tx = makeTx({ bankTxId: 'portal-111' });
    reg.addAll([tx]);
    expect(reg.has(tx, 'strict')).toBe(true);
  });

  it('still matches via loose index when bankTxId differs (same date/amount/payee)', () => {
    // Strict mode always also checks the loose index; same date+amount+payee = dup
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([makeTx({ bankTxId: 'portal-111' })]);
    expect(reg.has(makeTx({ bankTxId: 'portal-999' }), 'strict')).toBe(true);
  });

  it('matches when bankTxId is null on incoming tx (loose fallback)', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([makeTx({ bankTxId: 'portal-111' })]);
    expect(reg.has(makeTx({ bankTxId: null }), 'strict')).toBe(true);
  });

  it('does not match when date+amount+payee all differ (no loose OR strict match)', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([makeTx({ date: '2026-01-01', amount: -500, payee: 'A', bankTxId: 'portal-111' })]);
    // Different on all fields — no match in either index
    expect(reg.has(makeTx({ date: '2026-02-01', amount: -999, payee: 'B', bankTxId: 'portal-222' }), 'strict')).toBe(false);
  });
});

// ── bankTxId-only matching (handles date/payee instability) ──────────────────

describe('ImportRegistry — bankTxId-only matching', () => {
  it('matches when bankTxId is the same but date has shifted (BGeneral pending→posted)', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([makeTx({ date: '2026-03-14', amount: -454, payee: 'UBER RIDES', bankTxId: 'MT260730111000010003873' })]);
    // Same bankTxId, different date (shifted by 1 day)
    expect(reg.has(makeTx({ date: '2026-03-15', amount: -454, payee: 'UBER RIDES', bankTxId: 'MT260730111000010003873' }), 'strict')).toBe(true);
    expect(reg.has(makeTx({ date: '2026-03-15', amount: -454, payee: 'UBER RIDES', bankTxId: 'MT260730111000010003873' }), 'loose')).toBe(true);
  });

  it('matches when bankTxId is the same but date AND payee differ (credit card migration)', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([makeTx({ date: '2026-03-06', amount: -22309, payee: 'WWW.LIDR.CO', bankTxId: 'REF123' })]);
    // Same bankTxId, different date AND potentially different payee
    expect(reg.has(makeTx({ date: '2026-03-18', amount: -22309, payee: 'WWW.LIDR.CO', bankTxId: 'REF123' }), 'strict')).toBe(true);
  });

  it('does NOT match when bankTxId differs (even if amount/payee match)', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([makeTx({ date: '2026-03-14', amount: -454, payee: 'UBER RIDES', bankTxId: 'TX-AAA' })]);
    // Different bankTxId, different date — no match (neither txIdIndex nor loose/strict)
    expect(reg.has(makeTx({ date: '2026-03-15', amount: -454, payee: 'UBER RIDES', bankTxId: 'TX-BBB' }), 'strict')).toBe(false);
  });

  it('bankTxId-only matching works after round-trip (save + reload)', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([makeTx({ date: '2026-03-14', amount: -454, payee: 'UBER RIDES', bankTxId: 'MT260730111000010003873' })]);

    const reg2 = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    expect(reg2.has(makeTx({ date: '2026-03-15', amount: -454, payee: 'UBER RIDES', bankTxId: 'MT260730111000010003873' }), 'strict')).toBe(true);
  });
});

// ── payee normalization for dedup keys ───────────────────────────────────────

describe('ImportRegistry — payee normalization', () => {
  it('matches payee case-insensitively', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([makeTx({ payee: 'SUPERMERCADO REY' })]);
    expect(reg.has(makeTx({ payee: 'supermercado rey' }), 'loose')).toBe(true);
  });

  it('matches payee with different whitespace', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([makeTx({ payee: 'FARMA  VALUE   ALBROOK' })]);
    expect(reg.has(makeTx({ payee: 'FARMA VALUE ALBROOK' }), 'loose')).toBe(true);
  });

  it('matches payee truncated beyond 50 chars (GlobalBank instability)', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    const longPayee = 'FARMA VALUE ALBROOK>TERRAZAS DE ALBROOPA PANAMA CITY DISTRICT';
    const truncatedPayee = 'FARMA VALUE ALBROOK>TERRAZAS DE ALBROOPA PANAMA CI';
    reg.addAll([makeTx({ payee: longPayee })]);
    expect(reg.has(makeTx({ payee: truncatedPayee }), 'loose')).toBe(true);
  });
});

// ── file format — human readable ─────────────────────────────────────────────

describe('ImportRegistry file format', () => {
  it('writes a human-readable pipe-separated file', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([makeTx({ date: '2026-03-03', amount: -91300, payee: 'SUPERMERCADO REY', bankTxId: '800346461' })]);

    const content = fs.readFileSync(path.join(tmpDir, 'test-bank', 'acc-1.txt'), 'utf8');
    expect(content).toContain('2026-03-03|-91300|SUPERMERCADO REY|800346461');
  });

  it('writes empty bankTxId column when null', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([makeTx({ bankTxId: null })]);

    const content = fs.readFileSync(path.join(tmpDir, 'test-bank', 'acc-1.txt'), 'utf8');
    // Last field is empty
    expect(content).toMatch(/2026-03-01\|-1000\|Shop\|$/m);
  });

  it('includes a comment header', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([makeTx()]);

    const content = fs.readFileSync(path.join(tmpDir, 'test-bank', 'acc-1.txt'), 'utf8');
    expect(content).toContain('# Import registry');
    expect(content).toContain('# Format:');
  });

  it('survives a round-trip (write then reload)', () => {
    const tx = makeTx({ date: '2026-03-05', amount: 50000, payee: 'FARMACIA ARROCHA', bankTxId: '999' });
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([tx]);

    const reg2 = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    expect(reg2.has(tx, 'loose')).toBe(true);
    expect(reg2.has(tx, 'strict')).toBe(true);
  });

  it('silently ignores old SHA-256 format lines', () => {
    const dir = path.join(tmpDir, 'test-bank');
    fs.mkdirSync(dir, { recursive: true });
    const oldHash = 'a'.repeat(64);
    fs.writeFileSync(path.join(dir, 'acc-1.txt'), `${oldHash}\n`);

    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    // No error, no entries loaded
    expect(reg.has(makeTx(), 'loose')).toBe(false);
  });

  it('writes atomically — no .tmp file left on success', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    reg.addAll([makeTx()]);
    expect(fs.existsSync(path.join(tmpDir, 'test-bank', 'acc-1.txt.tmp'))).toBe(false);
  });
});

// ── rotation ──────────────────────────────────────────────────────────────────

describe('ImportRegistry rotation', () => {
  it('keeps only the last 2000 entries when over limit', () => {
    const reg = new ImportRegistry(tmpDir, 'test-bank', 'acc-1');
    // Add 2100 distinct transactions
    const txs = Array.from({ length: 2100 }, (_, i) =>
      makeTx({ date: '2026-01-01', amount: -i - 1, payee: `Payee-${i}` }),
    );
    reg.addAll(txs);

    const lines = fs.readFileSync(path.join(tmpDir, 'test-bank', 'acc-1.txt'), 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'));
    expect(lines.length).toBeLessThanOrEqual(2000);
    // Last entries should be present, first should be rotated out
    expect(reg.has(txs[2099]!, 'loose')).toBe(true);
    expect(reg.has(txs[0]!, 'loose')).toBe(false);
  });
});

// ── clear() ───────────────────────────────────────────────────────────────────

describe('ImportRegistry.clear()', () => {
  beforeEach(() => {
    for (const [bank, acc] of [['bank-a', 'acc-1'], ['bank-a', 'acc-2'], ['bank-b', 'acc-1']]) {
      const dir = path.join(tmpDir, bank);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${acc}.txt`), '# test\n');
    }
  });

  it('clears all registries when called with no filters', () => {
    ImportRegistry.clear(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'bank-a'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'bank-b'))).toBe(false);
  });

  it('clears only the specified bank', () => {
    ImportRegistry.clear(tmpDir, 'bank-a');
    expect(fs.existsSync(path.join(tmpDir, 'bank-a'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'bank-b', 'acc-1.txt'))).toBe(true);
  });

  it('clears only the specified account', () => {
    ImportRegistry.clear(tmpDir, 'bank-a', 'acc-1');
    expect(fs.existsSync(path.join(tmpDir, 'bank-a', 'acc-1.txt'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'bank-a', 'acc-2.txt'))).toBe(true);
  });

  it('is a no-op when files do not exist', () => {
    expect(() => ImportRegistry.clear(tmpDir, 'nonexistent-bank', 'acc-x')).not.toThrow();
    expect(() => ImportRegistry.clear('/nonexistent-dir')).not.toThrow();
  });
});
