import type { CanonicalTransaction, RawTransaction } from './types.js';
import { generateTransactionId } from './transaction-id.js';

/** Spanish month abbreviation to 2-digit month number. */
const MONTH_MAP: Record<string, string> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
};

/** Parse a date string to ISO 8601 YYYY-MM-DD.
 *  Supports:
 *  - DD-mon-YYYY  (GlobalBank: "04-mar-2026")
 *  - DD/MM/YYYY   (Banco General: "04/03/2026")
 */
function parseDate(raw: string): string {
  const trimmed = raw.trim();

  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split('/');
    return `${year}-${month}-${day}`;
  }

  // DD-mon-YYYY
  const parts = trimmed.split('-');
  if (parts.length !== 3) throw new Error(`Cannot parse date: "${raw}"`);
  const [day, monStr, year] = parts;
  const month = MONTH_MAP[monStr.toLowerCase()];
  if (!month) throw new Error(`Unknown month abbreviation: "${monStr}" in date "${raw}"`);
  return `${year}-${month}-${day.padStart(2, '0')}`;
}

/** Parse an amount string to integer cents. Strips currency symbols, commas, spaces. */
function parseAmount(raw: string, isDebit: boolean): number {
  const cleaned = raw.trim().replace(/[^0-9.]/g, '');
  const float = parseFloat(cleaned);
  if (isNaN(float)) throw new Error(`Cannot parse amount: "${raw}"`);
  const cents = Math.round(float * 100);
  return isDebit ? -cents : cents;
}

/**
 * Normalize raw bank transactions into the canonical format.
 * Handles same-day duplicate tiebreaking via positional index.
 */
export function normalizeTransactions(
  raw: RawTransaction[],
  bankId: string,
  accountId: string,
): CanonicalTransaction[] {
  // Track per-day collision counters: key = date:amount:payee
  const collisionCounters = new Map<string, number>();

  return raw.map((r) => {
    const date = parseDate(r.rawDate);
    const amount = parseAmount(r.rawAmount, r.isDebit);
    const payee = r.payee.trim();

    const collisionKey = `${date}:${amount}:${payee}`;
    const index = collisionCounters.get(collisionKey) ?? 0;
    collisionCounters.set(collisionKey, index + 1);

    const id = generateTransactionId({ bankId, accountId, date, amount, payee }, index);

    return {
      id,
      bankId,
      accountId,
      date,
      amount,
      payee,
      notes: r.notes ?? null,
    };
  });
}
