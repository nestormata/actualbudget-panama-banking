import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CanonicalTransaction } from '../shared/types.js';

const MAX_ENTRIES = 2000;

/**
 * A single entry stored in the registry file.
 * Persisted as a pipe-separated line so the file is human-readable for debugging.
 * Format:  date|amount_cents|payee|bank_tx_id
 * Example: 2026-03-03|-91300|SUPERMERCADO REY|800346461
 */
export interface RegistryEntry {
  date: string;
  amount: number;
  payee: string;
  bankTxId: string | null;
}

/**
 * Serialize a RegistryEntry to a single file line.
 * The `|` character is replaced with `¦` (U+00A6, broken bar) in payee to avoid
 * splitting issues, since `|` is extremely unlikely to appear in bank descriptions.
 */
function entryToLine(e: RegistryEntry): string {
  const safePay = e.payee.replace(/\|/g, '¦');
  return `${e.date}|${e.amount}|${safePay}|${e.bankTxId ?? ''}`;
}

/**
 * Parse a single file line into a RegistryEntry.
 * Returns null for comment lines, blank lines, or old-format SHA-256 lines.
 */
function lineToEntry(line: string): RegistryEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  // Ignore old SHA-256 format (64 hex chars, no pipes)
  if (/^[0-9a-f]{64}$/.test(trimmed)) return null;

  const parts = trimmed.split('|');
  if (parts.length < 4) return null;

  const [date, amountStr, payee, bankTxIdRaw] = parts;
  const amount = parseInt(amountStr, 10);
  if (!date || isNaN(amount)) return null;

  return {
    date,
    amount,
    payee: payee.replace(/¦/g, '|'),
    bankTxId: bankTxIdRaw || null,
  };
}

/**
 * Normalize a payee string for use in dedup keys.
 * Collapses repeated whitespace, lowercases, and truncates to avoid
 * mismatches caused by portal-side text truncation across runs.
 */
function normalizePayeeForKey(payee: string): string {
  return payee.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 50);
}

/**
 * Build a lookup key for an entry under the given deduplication mode.
 *
 * "loose":  date + amount + normalizedPayee  (bankTxId ignored)
 * "strict": date + amount + normalizedPayee + bankTxId  (all fields must match)
 *           If either side has no bankTxId, falls back to loose matching.
 */
function entryKey(e: RegistryEntry, mode: 'strict' | 'loose'): string {
  const normPayee = normalizePayeeForKey(e.payee);
  if (mode === 'strict' && e.bankTxId) {
    return `s|${e.date}|${e.amount}|${normPayee}|${e.bankTxId}`;
  }
  return `l|${e.date}|${e.amount}|${normPayee}`;
}

/**
 * Per-account registry of imported transactions.
 *
 * Stored as a plain text file — one human-readable pipe-separated line per transaction:
 *   date|amount_cents|payee|bank_tx_id
 *   2026-03-03|-91300|SUPERMERCADO REY|800346461
 *
 * The bank_tx_id column is empty when the portal does not provide one.
 *
 * Deduplication modes (configured per-bank in config.json):
 *   "loose"  (default): duplicate if date + amount + payee all match.
 *   "strict":           duplicate if date + amount + payee + bankTxId all match;
 *                       falls back to loose matching when bankTxId is absent on either side.
 *
 * Capped at MAX_ENTRIES (2000) lines — oldest entries are rotated out.
 * Writes are atomic: data is written to a .tmp file then renamed.
 */
export class ImportRegistry {
  private readonly filePath: string;
  private entries: RegistryEntry[] = [];
  private looseIndex = new Set<string>();
  private strictIndex = new Set<string>();
  /** Index of bankTxId values — enables matching by portal ID alone. */
  private txIdIndex = new Set<string>();
  private loaded = false;

  constructor(dataDir: string, bankId: string, accountId: string) {
    this.filePath = path.join(dataDir, bankId, `${accountId}.txt`);
  }

  /** Load registry from disk (idempotent — reads only once per instance). */
  load(): void {
    if (this.loaded) return;
    this.loaded = true;

    if (!fs.existsSync(this.filePath)) return;

    const lines = fs.readFileSync(this.filePath, 'utf8').split('\n');
    for (const line of lines) {
      const entry = lineToEntry(line);
      if (!entry) continue;
      this.entries.push(entry);
      this.looseIndex.add(entryKey(entry, 'loose'));
      this.strictIndex.add(entryKey(entry, 'strict'));
      if (entry.bankTxId) this.txIdIndex.add(entry.bankTxId);
    }
  }

  /**
   * Check whether a canonical transaction is already in the registry.
   * @param tx   The transaction to look up.
   * @param mode "strict" or "loose" — controls which fields must match.
   *
   * Match priority:
   * 1. bankTxId-only match (if tx has bankTxId and it exists in registry) — always wins.
   *    This handles date-shift and payee-change scenarios.
   * 2. Loose match: date + amount + normalizedPayee.
   * 3. Strict match: date + amount + normalizedPayee + bankTxId (only in strict mode).
   */
  has(tx: CanonicalTransaction, mode: 'strict' | 'loose' = 'loose'): boolean {
    this.load();

    // Priority 1: bankTxId-only match — handles date/payee instability
    if (tx.bankTxId && this.txIdIndex.has(tx.bankTxId)) return true;

    const entry: RegistryEntry = {
      date: tx.date,
      amount: tx.amount,
      payee: tx.payee,
      bankTxId: tx.bankTxId,
    };
    return this.looseIndex.has(entryKey(entry, 'loose')) ||
      (mode === 'strict' && !!tx.bankTxId && this.strictIndex.has(entryKey(entry, 'strict')));
  }

  /** Add multiple transactions to the registry and persist to disk. */
  addAll(txs: CanonicalTransaction[]): void {
    this.load();
    for (const tx of txs) {
      const entry: RegistryEntry = {
        date: tx.date,
        amount: tx.amount,
        payee: tx.payee,
        bankTxId: tx.bankTxId,
      };
      this.entries.push(entry);
      this.looseIndex.add(entryKey(entry, 'loose'));
      this.strictIndex.add(entryKey(entry, 'strict'));
      if (entry.bankTxId) this.txIdIndex.add(entry.bankTxId);
    }
    this.save();
  }

  /** Persist the current entries to disk, rotating to the last MAX_ENTRIES. */
  private save(): void {
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
      // Rebuild indexes after rotation
      this.looseIndex = new Set(this.entries.map((e) => entryKey(e, 'loose')));
      this.strictIndex = new Set(this.entries.map((e) => entryKey(e, 'strict')));
    }

    const header = [
      '# Import registry — human-readable deduplication log',
      '# Format: date|amount_cents|payee|bank_tx_id',
      '# amount_cents: integer, negative=debit. bank_tx_id: portal ID or empty.',
      '',
    ].join('\n');

    const body = this.entries.map(entryToLine).join('\n');

    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });

    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, header + body + '\n', 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }

  /**
   * Delete registry files.
   * - No args: delete all files under dataDir
   * - bankId only: delete all files under dataDir/bankId/
   * - bankId + accountId: delete dataDir/bankId/accountId.txt
   */
  static clear(dataDir: string, bankId?: string, accountId?: string): void {
    if (!fs.existsSync(dataDir)) return;

    if (bankId && accountId) {
      const file = path.join(dataDir, bankId, `${accountId}.txt`);
      if (fs.existsSync(file)) fs.rmSync(file);
      return;
    }

    if (bankId) {
      const dir = path.join(dataDir, bankId);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
      return;
    }

    for (const entry of fs.readdirSync(dataDir)) {
      const entryPath = path.join(dataDir, entry);
      if (fs.statSync(entryPath).isDirectory()) {
        fs.rmSync(entryPath, { recursive: true });
      }
    }
  }
}
