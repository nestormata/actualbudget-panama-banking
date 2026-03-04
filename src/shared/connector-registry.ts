import type { BankConnector } from './connector.interface.js';

type ConnectorFactory = () => BankConnector;

/** Registry that maps bankId strings to connector factory functions. */
export class ConnectorRegistry {
  private readonly factories = new Map<string, ConnectorFactory>();

  /**
   * Register a connector factory under the given bankId.
   * @param bankId Unique identifier for the bank (e.g. "globalbank-pa")
   * @param factory Function that produces a new BankConnector instance
   */
  register(bankId: string, factory: ConnectorFactory): void {
    this.factories.set(bankId, factory);
  }

  /**
   * Retrieve a new connector instance for the given bankId.
   * @throws Error if bankId is not registered, listing all registered IDs
   */
  get(bankId: string): BankConnector {
    const factory = this.factories.get(bankId);
    if (!factory) {
      const registered = [...this.factories.keys()].join(', ') || '(none)';
      throw new Error(
        `No connector registered for bankId "${bankId}". Registered banks: ${registered}`,
      );
    }
    return factory();
  }

  /** Return all registered bankIds. */
  registeredIds(): string[] {
    return [...this.factories.keys()];
  }
}

/** Singleton registry — connectors register themselves against this instance. */
export const connectorRegistry = new ConnectorRegistry();
