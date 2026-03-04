import { createHash } from 'node:crypto';

export interface TransactionIdFields {
  bankId: string;
  accountId: string;
  date: string;
  amount: number;
  payee: string;
}

/**
 * Generate a stable, deterministic SHA-256 transaction ID.
 * @param fields - The transaction fields to hash
 * @param index - Optional tiebreaker index for same-day duplicate transactions
 */
export function generateTransactionId(fields: TransactionIdFields, index = 0): string {
  const raw = `${fields.bankId}:${fields.accountId}:${fields.date}:${fields.amount}:${fields.payee}:${index}`;
  return createHash('sha256').update(raw).digest('hex');
}
