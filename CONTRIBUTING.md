# Contributing: Adding a New Bank Connector

This guide explains how to add a new bank to the sync system.

---

## Overview

Each bank is implemented as a `BankConnector` class. The connector is responsible for:

1. Logging into the bank portal (typically via Playwright browser automation)
2. Fetching account list and balances
3. Fetching raw transactions for a given account and date range
4. Normalizing raw transactions into canonical form

The shared pipeline handles deduplication, normalization, and import into ActualBudget.

---

## Step 1: Create the directory structure

```
src/connectors/
└── mybank/
    ├── mybank.connector.ts        # Main connector class
    ├── parsers/
    │   ├── accounts.ts            # Parse accounts list HTML
    │   ├── transactions.ts        # Parse transactions table HTML
    │   └── challenge.ts           # Detect MFA/OTP challenge (if applicable)
    └── fixtures/                  # Saved HTML pages for tests
        ├── login.html
        ├── accounts.html
        └── transactions.html
```

---

## Step 2: Implement the `BankConnector` interface

```typescript
// src/connectors/mybank/mybank.connector.ts
import { chromium, type Browser, type Page } from 'playwright';
import type { BankConnector, BankAccount, RawTransaction, CanonicalTransaction } from '../../shared/types.js';
import { normalizeTransactions } from '../../shared/normalize.js';

export class MyBankConnector implements BankConnector {
  readonly bankId = 'mybank';
  private browser: Browser | null = null;
  private page: Page | null = null;
  private connected = false;

  constructor(
    private readonly username: string,
    private readonly password: string,
  ) {}

  async connect(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage();
    // Perform login steps
    this.connected = true;
  }

  async getAccounts(): Promise<BankAccount[]> {
    if (!this.connected || !this.page) throw new ConnectorStateError('Not connected');
    // Scrape and parse accounts page
    return [];
  }

  async getTransactions(accountId: string, from?: Date, to?: Date): Promise<RawTransaction[]> {
    if (!this.connected || !this.page) throw new ConnectorStateError('Not connected');
    // Scrape and parse transactions
    return [];
  }

  normalize(raw: RawTransaction[]): CanonicalTransaction[] {
    return normalizeTransactions(raw);
  }

  async disconnect(): Promise<void> {
    await this.browser?.close();
    this.connected = false;
  }
}
```

---

## Step 3: Capture real HTML fixtures

Write a capture script (model it after `scripts/capture-fixtures.mjs`) that:

1. Logs in to the portal with real credentials
2. Saves the login page, accounts page, and transactions page to `src/connectors/mybank/fixtures/`

Run it once:

```bash
MYBANK_USER=... MYBANK_PASS=... docker compose run --rm playwright node scripts/capture-mybank-fixtures.mjs
```

> **Important**: Never commit credentials into fixture HTML files. If the HTML contains session tokens, that is acceptable (they expire), but never hardcode usernames or passwords.

---

## Step 4: Write fixture tests (TDD)

Before implementing parsers, write tests against the saved fixtures:

```typescript
// tests/fixture/mybank/parsers.test.ts
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAccounts } from '../../../src/connectors/mybank/parsers/accounts.js';

const FIXTURES_DIR = join(process.cwd(), 'src/connectors/mybank/fixtures');

let browser, page;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); page = await browser.newPage(); });
afterAll(async () => { await browser.close(); });

it('parses accounts', async () => {
  await page.setContent(readFileSync(join(FIXTURES_DIR, 'accounts.html'), 'utf-8'));
  const accounts = await parseAccounts(page);
  expect(accounts).toHaveLength(1);
  expect(accounts[0].id).toBe('123456789');
});
```

Run fixture tests with:

```bash
docker compose run --rm playwright npm run test:fixture
```

---

## Step 5: Register the connector

Add the bank to `src/connectors/index.ts`:

```typescript
import { MyBankConnector } from './mybank/mybank.connector.js';

connectorRegistry.register('mybank', () => new MyBankConnector(
  process.env.MYBANK_USER!,
  process.env.MYBANK_PASS!,
));
```

---

## Step 6: Update config.example.json

Add an entry under `banks`:

```json
{
  "id": "mybank",
  "enabled": true,
  "credentials": {
    "username": "${MYBANK_USER}",
    "password": "${MYBANK_PASS}"
  },
  "accounts": [
    {
      "bankAccountId": "BANK_ACCOUNT_NUMBER",
      "actualAccountId": "ACTUALBUDGET_ACCOUNT_UUID"
    }
  ]
}
```

---

## Step 7: Add credentials to `.env`

```
MYBANK_USER=your_username
MYBANK_PASS=your_password
```

---

## Step 8: Verify end-to-end

```bash
# Run unit tests
docker compose run --rm dev npm run test:unit

# Run fixture tests
docker compose run --rm playwright npm run test:fixture

# Manual one-shot sync
docker compose run --rm bank-sync node dist/main.js --run-once
```

---

## Normalizing transactions

The `normalizeTransactions()` helper in `src/shared/normalize.ts` handles:

- Stable `imported_id` via SHA-256 of `(bankId, accountId, date, amount, description)`
- Collision tiebreaking with a numeric suffix
- Amount conversion to integer cents (positive = inflow, negative = outflow)

If the bank portal uses a non-standard date format, add a parser to `normalize.ts` or override `parseDate` in your connector's normalize method.

---

## Portal session hygiene

- Always call `disconnect()` even on error (use try/finally in your tests)
- Some portals block concurrent sessions — ensure only one instance runs at a time
- The `Scheduler` ensures no overlapping runs in production
