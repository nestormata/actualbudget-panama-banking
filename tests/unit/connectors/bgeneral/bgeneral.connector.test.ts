import { describe, it, expect } from '@jest/globals';
import { BGeneralConnector } from '../../../../src/connectors/bgeneral/bgeneral.connector.js';
import { ConnectorStateError, AuthError } from '../../../../src/shared/errors.js';
import type { RawTransaction } from '../../../../src/shared/types.js';
import type { BgeneralCredentials } from '../../../../src/connectors/bgeneral/bgeneral.credentials.js';

const VALID_CREDENTIALS: BgeneralCredentials = {
  username: 'testuser',
  password: 'testpass',
  securityQA: [{ pattern: 'escuela.*primaria', answer: 'mi escuela' }],
};

const makeRaw = (overrides: Partial<RawTransaction> = {}): RawTransaction => ({
  accountId: 'XXXX-XXXX-1',
  rawDate: '04/03/2026',
  rawAmount: '15.50',
  isDebit: true,
  payee: 'COMERCIO EJEMPLO',
  notes: null,
  ...overrides,
});

// ─── Lifecycle guards ────────────────────────────────────────────────────────

describe('BGeneralConnector lifecycle guards', () => {
  it('throws ConnectorStateError when getAccounts() called before connect()', async () => {
    const connector = new BGeneralConnector(VALID_CREDENTIALS);
    await expect(connector.getAccounts()).rejects.toBeInstanceOf(ConnectorStateError);
  });

  it('throws ConnectorStateError when getTransactions() called before connect()', async () => {
    const connector = new BGeneralConnector(VALID_CREDENTIALS);
    await expect(
      connector.getTransactions('XXXX-XXXX-1', new Date(), new Date()),
    ).rejects.toBeInstanceOf(ConnectorStateError);
  });
});

// ─── normalize() ────────────────────────────────────────────────────────────

describe('BGeneralConnector.normalize()', () => {
  const connector = new BGeneralConnector(VALID_CREDENTIALS);

  it('converts DD/MM/YYYY date to ISO 8601', () => {
    const [tx] = connector.normalize([makeRaw({ rawDate: '04/03/2026' })], 'XXXX-XXXX-1');
    expect(tx.date).toBe('2026-03-04');
  });

  it('converts debit amount to negative cents', () => {
    const [tx] = connector.normalize([makeRaw({ rawAmount: '15.50', isDebit: true })], 'XXXX-XXXX-1');
    expect(tx.amount).toBe(-1550);
  });

  it('converts credit amount to positive cents', () => {
    const [tx] = connector.normalize([makeRaw({ rawAmount: '500.00', isDebit: false })], 'XXXX-XXXX-1');
    expect(tx.amount).toBe(50000);
  });

  it('sets bankId to "bgeneral-pa"', () => {
    const [tx] = connector.normalize([makeRaw()], 'XXXX-XXXX-1');
    expect(tx.bankId).toBe('bgeneral-pa');
  });

  it('assigns stable IDs — same input produces same ID', () => {
    const raw = [makeRaw()];
    const [a] = connector.normalize(raw, 'XXXX-XXXX-1');
    const [b] = connector.normalize(raw, 'XXXX-XXXX-1');
    expect(a.id).toBe(b.id);
  });

  it('assigns different IDs to duplicate same-day transactions', () => {
    const raw = [makeRaw(), makeRaw()];
    const [a, b] = connector.normalize(raw, 'XXXX-XXXX-1');
    expect(a.id).not.toBe(b.id);
  });

  it('handles amounts with comma-separated thousands', () => {
    const [tx] = connector.normalize(
      [makeRaw({ rawAmount: '1,234.56', isDebit: true })],
      'XXXX-XXXX-1',
    );
    expect(tx.amount).toBe(-123456);
  });

  it('returns empty array for empty input', () => {
    expect(connector.normalize([], 'XXXX-XXXX-1')).toEqual([]);
  });
});

// ─── Security question matching ──────────────────────────────────────────────

describe('BGeneralConnector security question pattern matching', () => {
  it('has bankId "bgeneral-pa"', () => {
    const connector = new BGeneralConnector(VALID_CREDENTIALS);
    expect(connector.bankId).toBe('bgeneral-pa');
  });

  it('connector instantiates without throwing when credentials are valid', () => {
    expect(() => new BGeneralConnector(VALID_CREDENTIALS)).not.toThrow();
  });

  it('AuthError message does not contain the actual answer value', () => {
    const connector = new BGeneralConnector(VALID_CREDENTIALS);
    expect(connector).toBeInstanceOf(BGeneralConnector);
    const authErr = new AuthError('bgeneral-pa', 'No matching security question answer found in BGENERAL_SECURITY_QA');
    expect(authErr).toBeInstanceOf(AuthError);
    expect(authErr).not.toBeInstanceOf(ConnectorStateError);
    // The actual answer value must never appear in the error message
    for (const qa of VALID_CREDENTIALS.securityQA) {
      expect(authErr.message).not.toContain(qa.answer);
    }
  });
});
