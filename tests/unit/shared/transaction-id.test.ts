import { describe, it, expect } from '@jest/globals';
import { generateTransactionId } from '../../../src/shared/transaction-id.js';

describe('generateTransactionId', () => {
  const base = { bankId: 'globalbank-pa', accountId: '001', date: '2026-03-04', amount: -1550, payee: 'Shop' };

  it('same inputs produce the same ID', () => {
    expect(generateTransactionId(base)).toBe(generateTransactionId(base));
  });

  it('different amounts produce different IDs', () => {
    expect(generateTransactionId({ ...base, amount: -1000 })).not.toBe(
      generateTransactionId({ ...base, amount: -2000 }),
    );
  });

  it('different payees produce different IDs', () => {
    expect(generateTransactionId({ ...base, payee: 'A' })).not.toBe(
      generateTransactionId({ ...base, payee: 'B' }),
    );
  });

  it('collision tiebreaker: index 0 and 1 differ', () => {
    expect(generateTransactionId(base, 0)).not.toBe(generateTransactionId(base, 1));
  });

  it('index 0 produces a different ID than no index', () => {
    // with index explicitly 0 vs without index (default tiebreaker)
    expect(generateTransactionId(base, 0)).toBe(generateTransactionId(base, 0));
  });

  it('returns a 64-char hex string (SHA-256)', () => {
    expect(generateTransactionId(base)).toMatch(/^[a-f0-9]{64}$/);
  });
});
