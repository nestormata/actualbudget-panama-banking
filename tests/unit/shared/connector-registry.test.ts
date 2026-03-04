import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConnectorRegistry } from '../../../src/shared/connector-registry.js';
import type { BankConnector } from '../../../src/shared/connector.interface.js';
import type { BankAccount, RawTransaction, CanonicalTransaction } from '../../../src/shared/types.js';

const makeMockConnector = (bankId: string): BankConnector => ({
  bankId,
  connect: async (): Promise<void> => {},
  getAccounts: async (): Promise<BankAccount[]> => [],
  getTransactions: async (): Promise<RawTransaction[]> => [],
  normalize: (): CanonicalTransaction[] => [],
  disconnect: async (): Promise<void> => {},
});

describe('ConnectorRegistry', () => {
  let registry: ConnectorRegistry;

  beforeEach(() => {
    registry = new ConnectorRegistry();
  });

  it('retrieves a registered connector', () => {
    registry.register('globalbank-pa', () => makeMockConnector('globalbank-pa'));
    const connector = registry.get('globalbank-pa');
    expect(connector.bankId).toBe('globalbank-pa');
  });

  it('each get() call returns a new instance', () => {
    registry.register('globalbank-pa', () => makeMockConnector('globalbank-pa'));
    const a = registry.get('globalbank-pa');
    const b = registry.get('globalbank-pa');
    expect(a).not.toBe(b);
  });

  it('throws on unregistered bankId and lists registered IDs', () => {
    registry.register('bank-a', () => makeMockConnector('bank-a'));
    expect(() => registry.get('unknown-bank')).toThrow('bank-a');
  });

  it('registered connector satisfies BankConnector interface at runtime', () => {
    registry.register('test-bank', () => makeMockConnector('test-bank'));
    const connector: BankConnector = registry.get('test-bank');
    expect(typeof connector.connect).toBe('function');
    expect(typeof connector.getAccounts).toBe('function');
    expect(typeof connector.getTransactions).toBe('function');
    expect(typeof connector.normalize).toBe('function');
    expect(typeof connector.disconnect).toBe('function');
  });
});
