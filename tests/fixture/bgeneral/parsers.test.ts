import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAccounts } from '../../../src/connectors/bgeneral/parsers/accounts.js';
import { parseTransactions } from '../../../src/connectors/bgeneral/parsers/transactions.js';
import { parseCreditCardTransactions } from '../../../src/connectors/bgeneral/parsers/credit-card.js';

const FIXTURES_DIR = join(process.cwd(), 'src/connectors/bgeneral/fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
});

afterAll(async () => {
  await browser.close();
});

// ─── Account parsing ────────────────────────────────────────────────────────

describe('parseAccounts()', () => {
  it('returns at least one account from the accounts fixture', async () => {
    await page.setContent(loadFixture('accounts.html'));
    const accounts = await parseAccounts(page);
    expect(accounts.length).toBeGreaterThan(0);
  });

  it('each account has id, name, type, balance, currency, rawBalance, and uniqueId', async () => {
    await page.setContent(loadFixture('accounts.html'));
    const accounts = await parseAccounts(page);
    for (const account of accounts) {
      expect(typeof account.id).toBe('string');
      expect(account.id.length).toBeGreaterThan(0);
      expect(typeof account.name).toBe('string');
      expect(['checking', 'savings', 'credit', 'loan', 'unknown']).toContain(account.type);
      expect(typeof account.balance).toBe('number');
      expect(typeof account.currency).toBe('string');
      expect(typeof account.rawBalance).toBe('string');
      expect(typeof account.uniqueId).toBe('string');
      expect(account.uniqueId!.length).toBeGreaterThan(0);
    }
  });

  it('credit card is tagged type: "credit"', async () => {
    await page.setContent(loadFixture('accounts.html'));
    const accounts = await parseAccounts(page);
    const creditCards = accounts.filter((a) => a.type === 'credit');
    expect(creditCards.length).toBeGreaterThanOrEqual(1);
  });

  it('savings accounts are tagged type: "savings"', async () => {
    await page.setContent(loadFixture('accounts.html'));
    const accounts = await parseAccounts(page);
    const savings = accounts.filter((a) => a.type === 'savings');
    expect(savings.length).toBeGreaterThanOrEqual(1);
  });

  it('account id is the portal UUID (number field)', async () => {
    await page.setContent(loadFixture('accounts.html'));
    const [first] = await parseAccounts(page);
    expect(first.id).toBe('uuid-savings-001');
  });

  it('uniqueId contains the navigation href', async () => {
    await page.setContent(loadFixture('accounts.html'));
    const [first] = await parseAccounts(page);
    expect(first.uniqueId).toContain('/group/guest/');
  });

  it('returns empty array for a page with no account items', async () => {
    await page.setContent('<html><body><div class="portlet-body"></div></body></html>');
    const accounts = await parseAccounts(page);
    expect(accounts).toEqual([]);
  });
});

// ─── Account transaction parsing ────────────────────────────────────────────

describe('parseTransactions()', () => {
  it('returns at least one transaction from the transactions fixture', async () => {
    await page.setContent(loadFixture('transactions.html'));
    const txs = await parseTransactions(page, 'XXXX-XXXX-1');
    expect(txs.length).toBeGreaterThan(0);
  });

  it('all transactions have rawDate, rawAmount, payee, isDebit, and accountId', async () => {
    await page.setContent(loadFixture('transactions.html'));
    const txs = await parseTransactions(page, 'XXXX-XXXX-1');
    for (const tx of txs) {
      expect(typeof tx.rawDate).toBe('string');
      expect(tx.rawDate.length).toBeGreaterThan(0);
      expect(typeof tx.rawAmount).toBe('string');
      expect(typeof tx.payee).toBe('string');
      expect(typeof tx.isDebit).toBe('boolean');
      expect(tx.accountId).toBe('XXXX-XXXX-1');
    }
  });

  it('debit transactions have isDebit: true', async () => {
    await page.setContent(loadFixture('transactions.html'));
    const txs = await parseTransactions(page, 'XXXX-XXXX-1');
    const debits = txs.filter((t) => t.isDebit);
    expect(debits.length).toBeGreaterThan(0);
  });

  it('credit transactions have isDebit: false', async () => {
    await page.setContent(loadFixture('transactions.html'));
    const txs = await parseTransactions(page, 'XXXX-XXXX-1');
    const credits = txs.filter((t) => !t.isDebit);
    expect(credits.length).toBeGreaterThan(0);
  });

  it('date format is DD/MM/YYYY', async () => {
    await page.setContent(loadFixture('transactions.html'));
    const [first] = await parseTransactions(page, 'XXXX-XXXX-1');
    expect(first.rawDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('deduplicates rows with the same id', async () => {
    // The portal may render the same ng-repeat rows twice; we should only see unique movements
    await page.setContent(loadFixture('transactions.html'));
    const txs = await parseTransactions(page, 'XXXX-XXXX-1');
    // Fixture has 3 unique movements → expect exactly 3
    expect(txs.length).toBe(3);
  });

  it('returns empty array for a page with no transaction rows', async () => {
    await page.setContent('<html><body></body></html>');
    const txs = await parseTransactions(page, 'XXXX-XXXX-1');
    expect(txs).toEqual([]);
  });
});

// ─── Credit card statement parsing ──────────────────────────────────────────

describe('parseCreditCardTransactions()', () => {
  it('returns transactions from the current and statement fixture', async () => {
    await page.setContent(loadFixture('credit-card-current.html'));
    const txs = await parseCreditCardTransactions(page, 'XXXX-XXXX-CC');
    expect(txs.length).toBeGreaterThan(0);
  });

  it('all credit card transactions have required fields', async () => {
    await page.setContent(loadFixture('credit-card-current.html'));
    const txs = await parseCreditCardTransactions(page, 'XXXX-XXXX-CC');
    for (const tx of txs) {
      expect(typeof tx.rawDate).toBe('string');
      expect(tx.rawDate.length).toBeGreaterThan(0);
      expect(typeof tx.rawAmount).toBe('string');
      expect(typeof tx.payee).toBe('string');
      expect(tx.accountId).toBe('XXXX-XXXX-CC');
    }
  });

  it('includes both current and statement movements when statement tab exists', async () => {
    await page.setContent(loadFixture('credit-card-current.html'));
    const txs = await parseCreditCardTransactions(page, 'XXXX-XXXX-CC');
    // Fixture: 2 current + 2 statement = 4 total
    expect(txs.length).toBe(4);
  });

  it('returns only current movements when no statement tab exists', async () => {
    // Minimal page without the #menu2 tab
    await page.setContent(`
      <html><body>
      <script>
      window.angular = {
        element: function(el) {
          var rows = document.querySelectorAll('[ng-repeat*="movement in cardCtrl.globalMovements.lastMovements.movements"]');
          var idx = Array.from(rows).indexOf(el);
          return { scope: function() { return { movement: [
            { dateMovement: 1741046400000, natureMovement: 'D', amountMovement: 10, description: 'TEST', id: 'x1' }
          ][idx]; }; } };
        }
      };
      </script>
      <div ng-repeat="movement in cardCtrl.globalMovements.lastMovements.movements | filter:{}" class="ng-scope"></div>
      <!-- No #menu2 link -->
      </body></html>
    `);
    const txs = await parseCreditCardTransactions(page, 'XXXX-XXXX-CC');
    expect(txs.length).toBe(1);
  });

  it('date format is DD/MM/YYYY', async () => {
    await page.setContent(loadFixture('credit-card-current.html'));
    const [first] = await parseCreditCardTransactions(page, 'XXXX-XXXX-CC');
    expect(first.rawDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('debit transactions have isDebit: true', async () => {
    await page.setContent(loadFixture('credit-card-current.html'));
    const txs = await parseCreditCardTransactions(page, 'XXXX-XXXX-CC');
    const debits = txs.filter((t) => t.isDebit);
    expect(debits.length).toBeGreaterThan(0);
  });

  it('credit (payment) transactions have isDebit: false', async () => {
    await page.setContent(loadFixture('credit-card-current.html'));
    const txs = await parseCreditCardTransactions(page, 'XXXX-XXXX-CC');
    const credits = txs.filter((t) => !t.isDebit);
    expect(credits.length).toBeGreaterThan(0);
  });
});
