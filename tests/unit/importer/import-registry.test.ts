import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ImportRegistry } from '../../../src/importer/import-registry.js';

const VALID_ID = (n: number) => n.toString(16).padStart(64, '0');

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── load() ───────────────────────────────────────────────────────────────────

describe('ImportRegistry.load()', () => {
  it('returns empty set when file does not exist', () => {
    const reg = new ImportRegistry(tmpDir, 'bank-a', 'acc-1');
    expect(reg.load().size).toBe(0);
  });

  it('loads valid IDs from file', () => {
    const id1 = VALID_ID(1);
    const id2 = VALID_ID(2);
    const dir = path.join(tmpDir, 'bank-a');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'acc-1.txt'), `${id1}\n${id2}\n`);

    const reg = new ImportRegistry(tmpDir, 'bank-a', 'acc-1');
    const ids = reg.load();
    expect(ids.has(id1)).toBe(true);
    expect(ids.has(id2)).toBe(true);
  });

  it('ignores malformed lines', () => {
    const id = VALID_ID(1);
    const dir = path.join(tmpDir, 'bank-a');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'acc-1.txt'), `not-valid\n${id}\nshort\n`);

    const reg = new ImportRegistry(tmpDir, 'bank-a', 'acc-1');
    const ids = reg.load();
    expect(ids.size).toBe(1);
    expect(ids.has(id)).toBe(true);
  });

  it('is idempotent — reads file only once', () => {
    const dir = path.join(tmpDir, 'bank-a');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'acc-1.txt');
    fs.writeFileSync(file, `${VALID_ID(1)}\n`);

    const reg = new ImportRegistry(tmpDir, 'bank-a', 'acc-1');
    reg.load();
    // Write more IDs directly — second load() should NOT pick them up
    fs.appendFileSync(file, `${VALID_ID(2)}\n`);
    expect(reg.load().size).toBe(1);
  });
});

// ── save() ───────────────────────────────────────────────────────────────────

describe('ImportRegistry.save()', () => {
  it('creates directory and file on first save', () => {
    const reg = new ImportRegistry(tmpDir, 'bank-b', 'acc-2');
    reg.save(new Set([VALID_ID(1)]));
    expect(fs.existsSync(path.join(tmpDir, 'bank-b', 'acc-2.txt'))).toBe(true);
  });

  it('rotates to last 1000 entries', () => {
    const ids = new Set(Array.from({ length: 1100 }, (_, i) => VALID_ID(i)));
    const reg = new ImportRegistry(tmpDir, 'bank-b', 'acc-2');
    reg.save(ids);

    const lines = fs.readFileSync(path.join(tmpDir, 'bank-b', 'acc-2.txt'), 'utf8')
      .split('\n').filter(Boolean);
    expect(lines.length).toBe(1000);
    // Should keep the LAST 1000 (indices 100–1099)
    expect(lines).toContain(VALID_ID(1099));
    expect(lines).not.toContain(VALID_ID(0));
  });

  it('writes atomically — no .tmp file left on success', () => {
    const reg = new ImportRegistry(tmpDir, 'bank-b', 'acc-2');
    reg.save(new Set([VALID_ID(1)]));
    expect(fs.existsSync(path.join(tmpDir, 'bank-b', 'acc-2.txt.tmp'))).toBe(false);
  });
});

// ── addAll() ──────────────────────────────────────────────────────────────────

describe('ImportRegistry.addAll()', () => {
  it('merges new IDs and persists', () => {
    const reg = new ImportRegistry(tmpDir, 'bank-c', 'acc-3');
    reg.load();
    reg.addAll([VALID_ID(1), VALID_ID(2)]);

    const reg2 = new ImportRegistry(tmpDir, 'bank-c', 'acc-3');
    const ids = reg2.load();
    expect(ids.has(VALID_ID(1))).toBe(true);
    expect(ids.has(VALID_ID(2))).toBe(true);
  });

  it('triggers rotation when total exceeds 1000', () => {
    const initial = new Set(Array.from({ length: 999 }, (_, i) => VALID_ID(i)));
    const reg = new ImportRegistry(tmpDir, 'bank-c', 'acc-3');
    reg.save(initial);

    // Add 10 more — total 1009, should rotate to 1000
    reg.addAll(Array.from({ length: 10 }, (_, i) => VALID_ID(999 + i)));

    const lines = fs.readFileSync(path.join(tmpDir, 'bank-c', 'acc-3.txt'), 'utf8')
      .split('\n').filter(Boolean);
    expect(lines.length).toBe(1000);
  });
});

// ── clear() ───────────────────────────────────────────────────────────────────

describe('ImportRegistry.clear()', () => {
  beforeEach(() => {
    // Seed some registry files
    for (const [bank, acc] of [['bank-a', 'acc-1'], ['bank-a', 'acc-2'], ['bank-b', 'acc-1']]) {
      const dir = path.join(tmpDir, bank);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${acc}.txt`), `${VALID_ID(1)}\n`);
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
