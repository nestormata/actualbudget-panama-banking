import * as fs from 'node:fs';
import * as path from 'node:path';

const MAX_IDS = 1000;
const VALID_ID = /^[0-9a-f]{64}$/;

/**
 * Per-account registry of imported transaction IDs.
 * Stored as a plain text file: one SHA-256 hex ID per line.
 * Capped at the last MAX_IDS (1000) entries — oldest are rotated out.
 * Writes are atomic (write to .tmp then rename).
 */
export class ImportRegistry {
  private readonly filePath: string;
  private ids: Set<string> = new Set();
  private loaded = false;

  constructor(dataDir: string, bankId: string, accountId: string) {
    this.filePath = path.join(dataDir, bankId, `${accountId}.txt`);
  }

  /** Load IDs from disk (idempotent — only reads once per instance). */
  load(): Set<string> {
    if (this.loaded) return this.ids;
    this.loaded = true;

    if (!fs.existsSync(this.filePath)) return this.ids;

    const lines = fs.readFileSync(this.filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (VALID_ID.test(trimmed)) {
        this.ids.add(trimmed);
      }
    }
    return this.ids;
  }

  /** Whether the given ID exists in the registry. Loads first if needed. */
  has(id: string): boolean {
    this.load();
    return this.ids.has(id);
  }

  /** Merge new IDs into the registry and persist to disk. */
  addAll(ids: string[]): void {
    this.load();
    for (const id of ids) {
      this.ids.add(id);
    }
    this.save(this.ids);
  }

  /** Persist the set to disk, rotating to the last MAX_IDS entries. */
  save(ids: Set<string>): void {
    const entries = Array.from(ids);
    const trimmed = entries.slice(-MAX_IDS);
    this.ids = new Set(trimmed);

    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });

    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, trimmed.join('\n') + '\n', 'utf8');
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

    // Clear all — remove each bank subdirectory
    for (const entry of fs.readdirSync(dataDir)) {
      const entryPath = path.join(dataDir, entry);
      if (fs.statSync(entryPath).isDirectory()) {
        fs.rmSync(entryPath, { recursive: true });
      }
    }
  }
}
