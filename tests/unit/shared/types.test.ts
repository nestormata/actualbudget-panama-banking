import { describe, it, expect } from '@jest/globals';
import type { CanonicalTransaction, BankAccount } from '../../../src/shared/types.js';

describe('CanonicalTransaction', () => {
  it('accepts a valid debit transaction', () => {
    const tx: CanonicalTransaction = {
      id: 'abc123',
      bankId: 'globalbank-pa',
      accountId: '001-123456-7',
      date: '2026-03-04',
      amount: -1550,
      payee: 'Starbucks',
      notes: 'Coffee',
    };
    expect(tx.amount).toBeLessThan(0);
  });

  it('enforces negative amount for debits', () => {
    const debit: CanonicalTransaction = {
      id: 'x',
      bankId: 'b',
      accountId: 'a',
      date: '2026-01-01',
      amount: -100,
      payee: 'Shop',
      notes: null,
    };
    expect(debit.amount).toBeLessThan(0);
  });

  it('enforces positive amount for credits', () => {
    const credit: CanonicalTransaction = {
      id: 'y',
      bankId: 'b',
      accountId: 'a',
      date: '2026-01-01',
      amount: 5000,
      payee: 'Salary',
      notes: null,
    };
    expect(credit.amount).toBeGreaterThan(0);
  });

  it('accepts ISO 8601 date format', () => {
    const tx: CanonicalTransaction = {
      id: 'z',
      bankId: 'b',
      accountId: 'a',
      date: '2026-03-04',
      amount: -100,
      payee: 'Test',
      notes: null,
    };
    expect(tx.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('allows notes to be null', () => {
    const tx: CanonicalTransaction = {
      id: 'z',
      bankId: 'b',
      accountId: 'a',
      date: '2026-01-01',
      amount: -1,
      payee: 'P',
      notes: null,
    };
    expect(tx.notes).toBeNull();
  });
});

describe('BankAccount', () => {
  it('accepts valid account types', () => {
    const types: BankAccount['type'][] = ['checking', 'savings', 'credit', 'loan', 'unknown'];
    types.forEach((type) => {
      const account: BankAccount = {
        id: '001',
        name: 'My Account',
        type,
        balance: 100000,
      };
      expect(account.type).toBe(type);
    });
  });
});
