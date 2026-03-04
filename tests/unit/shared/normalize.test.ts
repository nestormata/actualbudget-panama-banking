import { describe, it, expect } from '@jest/globals';
import { normalizeTransactions } from '../../../src/shared/normalize.js';
import type { RawTransaction } from '../../../src/shared/types.js';

const makeRaw = (overrides: Partial<RawTransaction> = {}): RawTransaction => ({
  accountId: '001-123456-7',
  rawDate: '04-mar-2026',
  rawAmount: '15.50',
  isDebit: true,
  payee: 'Starbucks',
  notes: 'Coffee purchase',
  ...overrides,
});

describe('normalizeTransactions', () => {
  it('converts DD-mon-YYYY date (Spanish) to ISO 8601', () => {
    const [tx] = normalizeTransactions([makeRaw({ rawDate: '04-mar-2026' })], 'globalbank-pa', '001');
    expect(tx.date).toBe('2026-03-04');
  });

  it('handles all 12 Spanish month abbreviations', () => {
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    months.forEach((mon, i) => {
      const [tx] = normalizeTransactions([makeRaw({ rawDate: `01-${mon}-2026` })], 'globalbank-pa', '001');
      const expectedMonth = String(i + 1).padStart(2, '0');
      expect(tx.date).toBe(`2026-${expectedMonth}-01`);
    });
  });

  it('converts debit amount to negative cents', () => {
    const [tx] = normalizeTransactions([makeRaw({ rawAmount: '15.50', isDebit: true })], 'globalbank-pa', '001');
    expect(tx.amount).toBe(-1550);
  });

  it('converts credit amount to positive cents', () => {
    const [tx] = normalizeTransactions([makeRaw({ rawAmount: '200.00', isDebit: false })], 'globalbank-pa', '001');
    expect(tx.amount).toBe(20000);
  });

  it('strips currency symbol and spaces (GlobalBank format "$ 16.63")', () => {
    const [tx] = normalizeTransactions([makeRaw({ rawAmount: '$ 16.63', isDebit: true })], 'globalbank-pa', '001');
    expect(tx.amount).toBe(-1663);
  });

  it('strips comma-thousands separator', () => {
    const [tx] = normalizeTransactions([makeRaw({ rawAmount: '1,234.56', isDebit: true })], 'globalbank-pa', '001');
    expect(tx.amount).toBe(-123456);
  });

  it('sets bankId and accountId', () => {
    const [tx] = normalizeTransactions([makeRaw()], 'globalbank-pa', '001-123456-7');
    expect(tx.bankId).toBe('globalbank-pa');
    expect(tx.accountId).toBe('001-123456-7');
  });

  it('assigns stable IDs — same input same ID', () => {
    const raw = [makeRaw()];
    const [a] = normalizeTransactions(raw, 'globalbank-pa', '001');
    const [b] = normalizeTransactions(raw, 'globalbank-pa', '001');
    expect(a.id).toBe(b.id);
  });

  it('assigns different IDs to identical same-day transactions via tiebreaker', () => {
    const raw = [makeRaw(), makeRaw()]; // identical
    const [a, b] = normalizeTransactions(raw, 'globalbank-pa', '001');
    expect(a.id).not.toBe(b.id);
  });

  it('returns empty array for empty input', () => {
    expect(normalizeTransactions([], 'globalbank-pa', '001')).toEqual([]);
  });
});
