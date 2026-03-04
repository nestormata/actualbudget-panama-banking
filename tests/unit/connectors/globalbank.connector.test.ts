import { describe, it, expect } from '@jest/globals';
import { GlobalBankConnector } from '../../../src/connectors/globalbank/globalbank.connector.js';
import { ConnectorStateError } from '../../../src/shared/errors.js';
import type { RawTransaction } from '../../../src/shared/types.js';

const makeRaw = (overrides: Partial<RawTransaction> = {}): RawTransaction => ({
  accountId: '50332008399',
  rawDate: '04-mar-2026',
  rawAmount: '$ 16.63',
  isDebit: true,
  payee: 'COMPRA POS REY PASEO ALBROOK',
  notes: undefined,
  ...overrides,
});

describe('GlobalBankConnector.normalize()', () => {
  const connector = new GlobalBankConnector({ username: 'u', password: 'p' });

  it('converts DD-mon-YYYY date to ISO 8601', () => {
    const [tx] = connector.normalize([makeRaw()], '50332008399');
    expect(tx.date).toBe('2026-03-04');
  });

  it('converts debit amount to negative cents', () => {
    const [tx] = connector.normalize([makeRaw({ rawAmount: '$ 16.63', isDebit: true })], '50332008399');
    expect(tx.amount).toBe(-1663);
  });

  it('converts credit amount to positive cents', () => {
    const [tx] = connector.normalize([makeRaw({ rawAmount: '$ 0.57', isDebit: false })], '50332008399');
    expect(tx.amount).toBe(57);
  });

  it('sets bankId to "globalbank-pa"', () => {
    const [tx] = connector.normalize([makeRaw()], '50332008399');
    expect(tx.bankId).toBe('globalbank-pa');
  });

  it('assigns stable IDs — same input produces same ID', () => {
    const raw = [makeRaw()];
    const [a] = connector.normalize(raw, '50332008399');
    const [b] = connector.normalize(raw, '50332008399');
    expect(a.id).toBe(b.id);
  });

  it('assigns different IDs to duplicate same-day transactions', () => {
    const raw = [makeRaw(), makeRaw()];
    const [a, b] = connector.normalize(raw, '50332008399');
    expect(a.id).not.toBe(b.id);
  });

  it('returns empty array for empty input', () => {
    expect(connector.normalize([], '50332008399')).toEqual([]);
  });
});

describe('GlobalBankConnector lifecycle guards', () => {
  it('throws ConnectorStateError when getAccounts() called before connect()', async () => {
    const connector = new GlobalBankConnector({ username: 'u', password: 'p' });
    await expect(connector.getAccounts()).rejects.toBeInstanceOf(ConnectorStateError);
  });

  it('throws ConnectorStateError when getTransactions() called before connect()', async () => {
    const connector = new GlobalBankConnector({ username: 'u', password: 'p' });
    await expect(connector.getTransactions('50332008399', new Date(), new Date())).rejects.toBeInstanceOf(ConnectorStateError);
  });
});
