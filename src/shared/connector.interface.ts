import type { BankAccount, CanonicalTransaction, RawTransaction } from './types.js';

/**
 * Interface that every bank connector must implement.
 * Connectors are stateful: call connect() before any data methods, disconnect() when done.
 */
export interface BankConnector {
  /** The unique bank identifier this connector handles (e.g. "globalbank-pa"). */
  readonly bankId: string;

  /**
   * Authenticate against the bank portal and establish a session.
   * @throws {AuthError} on invalid credentials or security challenge
   * @throws {NetworkError} on connectivity failure
   */
  connect(): Promise<void>;

  /**
   * Return all accounts visible in the authenticated session.
   * @throws {ConnectorStateError} if called before connect()
   * @throws {ParseError} if the accounts page cannot be parsed
   */
  getAccounts(): Promise<BankAccount[]>;

  /**
   * Return raw transactions for a given account within a date range.
   * @param accountId Bank-side account identifier (from getAccounts().id)
   * @param from Start date (inclusive)
   * @param to End date (inclusive)
   * @throws {ConnectorStateError} if called before connect()
   * @throws {ParseError} if the transaction page cannot be parsed
   */
  getTransactions(accountId: string, from: Date, to: Date): Promise<RawTransaction[]>;

  /**
   * Normalize raw bank transactions into the canonical format.
   * @param raw Raw transactions from getTransactions()
   * @param accountId The bank-side account identifier
   */
  normalize(raw: RawTransaction[], accountId: string): CanonicalTransaction[];

  /**
   * Close the browser session and release all resources.
   * Safe to call even if connect() was never called or already disconnected.
   */
  disconnect(): Promise<void>;
}
