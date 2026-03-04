import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractCsrfToken } from '../../../src/connectors/globalbank/parsers/csrf.js';
import { parseAccounts } from '../../../src/connectors/globalbank/parsers/accounts.js';
import { parseTransactions, getPageCount } from '../../../src/connectors/globalbank/parsers/transactions.js';
import { isChallengedPage } from '../../../src/connectors/globalbank/parsers/challenge.js';

const FIXTURES_DIR = join(process.cwd(), 'src/connectors/globalbank/fixtures');

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

describe('CSRF token extraction', () => {
  it('extracts CSRF token from login page fixture', async () => {
    await page.setContent(loadFixture('login.html'));
    const token = await extractCsrfToken(page);
    expect(token).toBeTruthy();
    expect(token).toMatch(/^[a-f0-9-]{36}$/i); // UUID format
  });

  it('extracts CSRF token from password-step page fixture', async () => {
    await page.setContent(loadFixture('password-step.html'));
    const token = await extractCsrfToken(page);
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(10);
  });
});

describe('Account list parsing', () => {
  it('parses accounts from the consolidated position page', async () => {
    await page.setContent(loadFixture('accounts.html'));
    const accounts = await parseAccounts(page);
    expect(accounts.length).toBeGreaterThan(0);
  });

  it('account has id, name, currency', async () => {
    await page.setContent(loadFixture('accounts.html'));
    const [account] = await parseAccounts(page);
    expect(account.id).toBeTruthy();
    expect(account.name).toBeTruthy();
    expect(account.currency).toBeTruthy();
  });

  it('account id matches the account number in fixtures (50332008399)', async () => {
    await page.setContent(loadFixture('accounts.html'));
    const [account] = await parseAccounts(page);
    expect(account.id).toBe('50332008399');
  });

  it('account name is "AHORRA MAS"', async () => {
    await page.setContent(loadFixture('accounts.html'));
    const [account] = await parseAccounts(page);
    expect(account.name).toBe('AHORRA MAS');
  });

  it('account uniqueId is extracted from onclick', async () => {
    await page.setContent(loadFixture('accounts.html'));
    const [account] = await parseAccounts(page);
    expect(account.uniqueId).toMatch(/^-?\d+$/);
  });
});

describe('Transaction parsing', () => {
  it('parses transactions from the movements page', async () => {
    await page.setContent(loadFixture('transactions.html'));
    const txs = await parseTransactions(page, '50332008399');
    expect(txs.length).toBeGreaterThan(0);
  });

  it('all transactions have date, amount, and payee', async () => {
    await page.setContent(loadFixture('transactions.html'));
    const txs = await parseTransactions(page, '50332008399');
    for (const tx of txs) {
      expect(tx.rawDate).toBeTruthy();
      expect(tx.rawAmount).toBeTruthy();
      expect(tx.payee).toBeTruthy();
    }
  });

  it('debit transactions have isDebit=true', async () => {
    await page.setContent(loadFixture('transactions.html'));
    const txs = await parseTransactions(page, '50332008399');
    const debits = txs.filter((t) => t.isDebit);
    expect(debits.length).toBeGreaterThan(0);
  });

  it('credit transactions have isDebit=false', async () => {
    await page.setContent(loadFixture('transactions.html'));
    const txs = await parseTransactions(page, '50332008399');
    const credits = txs.filter((t) => !t.isDebit);
    expect(credits.length).toBeGreaterThan(0); // INTERESES/RENDIMIENTOS is a credit
  });

  it('date format is DD-mon-YYYY (e.g. "04-mar-2026")', async () => {
    await page.setContent(loadFixture('transactions.html'));
    const [first] = await parseTransactions(page, '50332008399');
    expect(first.rawDate).toMatch(/^\d{2}-[a-z]{3}-\d{4}$/i);
  });

  it('amount format includes dollar sign (e.g. "$ 16.63")', async () => {
    await page.setContent(loadFixture('transactions.html'));
    const [first] = await parseTransactions(page, '50332008399');
    expect(first.rawAmount).toMatch(/\$/);
  });

  it('getPageCount returns 1 for single-page fixture', async () => {
    await page.setContent(loadFixture('transactions.html'));
    const count = await getPageCount(page);
    expect(count).toBe(1);
  });
});

describe('Challenge page detection', () => {
  it('returns false for login page (no OTP input)', async () => {
    await page.setContent(loadFixture('login.html'));
    expect(await isChallengedPage(page)).toBe(false);
  });

  it('returns false for password-step page (no OTP input)', async () => {
    await page.setContent(loadFixture('password-step.html'));
    expect(await isChallengedPage(page)).toBe(false);
  });

  it('returns false for accounts page', async () => {
    await page.setContent(loadFixture('accounts.html'));
    expect(await isChallengedPage(page)).toBe(false);
  });

  it('returns true when page contains OTP input field', async () => {
    await page.setContent('<html><body><input name="j_otp" type="text"/></body></html>');
    expect(await isChallengedPage(page)).toBe(true);
  });
});
