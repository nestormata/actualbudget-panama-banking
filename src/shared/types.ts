/** A normalized transaction in the canonical format shared across all bank connectors. */
export interface CanonicalTransaction {
  /** Stable content-based SHA-256 hash used as ActualBudget importedId. */
  id: string;
  /** Bank identifier, e.g. "globalbank-pa". */
  bankId: string;
  /** Bank-side account identifier. */
  accountId: string;
  /** ISO 8601 date string: YYYY-MM-DD. */
  date: string;
  /** Amount in integer cents. Negative = debit, positive = credit. */
  amount: number;
  /** Merchant or counterparty name. */
  payee: string;
  /** Raw description from the bank portal, or null. */
  notes: string | null;
}

/** Raw transaction as returned directly by a bank connector before normalization. */
export interface RawTransaction {
  /** Bank-side account identifier. */
  accountId: string;
  /** Raw date string as returned by the portal (e.g. "04/03/2026"). */
  rawDate: string;
  /** Raw amount string as returned by the portal (e.g. "-1,234.56" or "200.00"). */
  rawAmount: string;
  /** Whether this is a debit (true) or credit (false), if determinable from portal markup. */
  isDebit: boolean;
  /** Merchant / description text as shown in the portal. */
  payee: string;
  /** Full raw description, or null/undefined. */
  notes: string | null | undefined;
}

/** A bank account as returned by a connector. */
export interface BankAccount {
  /** Bank-side account identifier. */
  id: string;
  /** Display name shown in the portal. */
  name: string;
  /** Account type. */
  type?: 'checking' | 'savings' | 'credit' | 'loan' | 'unknown';
  /** Current balance in integer cents, if available. */
  balance?: number;
  /** ISO 4217 currency code (e.g. "USD"). */
  currency?: string;
  /** Raw balance string from the portal (e.g. "$ 104.36"). */
  rawBalance?: string;
  /** Bank-internal unique identifier used for navigation (e.g. portal uniqueID parameter). */
  uniqueId?: string;
}
