import { chromium, type Browser, type Page } from 'playwright';
import type { BankConnector } from '../../shared/connector.interface.js';
import type { BankAccount, RawTransaction, CanonicalTransaction } from '../../shared/types.js';
import { AuthError, ConnectorStateError, NetworkError } from '../../shared/errors.js';
import { normalizeTransactions } from '../../shared/normalize.js';
import { createLogger } from '../../shared/logger.js';
import { loadBgeneralCredentials, type BgeneralCredentials } from './bgeneral.credentials.js';
import { parseAccounts } from './parsers/accounts.js';
import { parseTransactions } from './parsers/transactions.js';
import { parseCreditCardTransactions } from './parsers/credit-card.js';

const BANK_ID = 'bgeneral-pa';
const PORTAL_BASE = 'https://zonasegura.bgeneral.com';

/**
 * DOM selectors for the login flow.
 * Captured from live portal via DevTools (see SELECTORS.md for full reference).
 */
const SEL = {
  /** <em> element containing the security question text */
  SECURITY_QUESTION_TEXT: 'p.fnt-size-20 em.ng-binding',
  /** Input field for the security question answer */
  SECURITY_ANSWER_INPUT: 'input[name="answer"]',
  /** Submit button on the security question step */
  SECURITY_SUBMIT: 'button[type="submit"].a-button',
  /** Password input field */
  PASSWORD_INPUT: 'input[name="password"]',
  /** Submit button on the password step (has stable id) */
  PASSWORD_SUBMIT: 'button#btn_enter',
  /** Sentinel element confirming successful post-login dashboard load */
  DASHBOARD_SENTINEL: '.bgp-dash-table-item',
  /** Dashboard (accounts overview) URL */
  ACCOUNTS_URL: `${PORTAL_BASE}/group/guest/dashboard`,
  /** Sentinel for savings/checking account transactions page */
  TRANSACTION_ROW_SENTINEL: '[ng-repeat="movement in accCtrl.product_movements"]',
  /** Sentinel for credit card page (current movements) */
  CC_ROW_SENTINEL: '[ng-repeat*="movement in cardCtrl.globalMovements.lastMovements.movements"]',
} as const;

/**
 * Playwright-based connector for Banco General's online banking portal.
 * Implements the BankConnector interface for multi-bank compatibility.
 *
 * Login flow (SPA with hash routing):
 *  1. Navigate to login URL with username pre-filled
 *  2. Match and answer the random security question (from BGENERAL_SECURITY_QA env var)
 *  3. Submit password
 */
export class BGeneralConnector implements BankConnector {
  readonly bankId = BANK_ID;

  private browser: Browser | null = null;
  private page: Page | null = null;
  private connected = false;
  private readonly credentials: BgeneralCredentials;
  private readonly logger = createLogger({ bankId: BANK_ID });

  constructor(credentials: BgeneralCredentials) {
    this.credentials = credentials;
  }

  // ── BankConnector.connect() ──────────────────────────────────────────────

  async connect(): Promise<void> {
    const headless = process.env['BROWSER_HEADLESS'] !== 'false';
    try {
      this.browser = await chromium.launch({ headless });
      const context = await this.browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        extraHTTPHeaders: { 'Accept-Language': 'es-PA,es;q=0.9,en;q=0.8' },
      });
      this.page = await context.newPage();
    } catch (e) {
      throw new NetworkError(BANK_ID, `Failed to launch browser: ${(e as Error).message}`);
    }

    await this.login();
    this.connected = true;
  }

  // ── BankConnector.getAccounts() ──────────────────────────────────────────

  async getAccounts(): Promise<BankAccount[]> {
    this.assertConnected('getAccounts');
    const page = this.page!;
    await page.goto(SEL.ACCOUNTS_URL, { timeout: 30000 });
    await page.waitForSelector(SEL.DASHBOARD_SENTINEL, { timeout: 30000 });
    return parseAccounts(page);
  }

  // ── BankConnector.getTransactions() ─────────────────────────────────────

  async getTransactions(accountId: string, _from: Date, _to: Date): Promise<RawTransaction[]> {
    this.assertConnected('getTransactions');
    const page = this.page!;

    const accounts = await this.getAccounts();
    const account = accounts.find((a) => a.id === accountId);

    if (!account) {
      throw new ConnectorStateError(BANK_ID, `Account "${accountId}" not found in portal`);
    }

    if (!account.uniqueId) {
      throw new ConnectorStateError(BANK_ID, `Account "${accountId}" has no navigation URL (uniqueId)`);
    }

    await page.goto(account.uniqueId, { timeout: 30000 });

    if (account.type === 'credit') {
      await page.waitForSelector(SEL.CC_ROW_SENTINEL, { timeout: 20000 });
      return parseCreditCardTransactions(page, accountId);
    }

    await page.waitForSelector(SEL.TRANSACTION_ROW_SENTINEL, { timeout: 20000 });
    return parseTransactions(page, accountId);
  }

  // ── BankConnector.normalize() ────────────────────────────────────────────

  normalize(raw: RawTransaction[], accountId: string): CanonicalTransaction[] {
    return normalizeTransactions(raw, BANK_ID, accountId);
  }

  // ── BankConnector.disconnect() ───────────────────────────────────────────

  async disconnect(): Promise<void> {
    if (this.page) {
      try {
        await this.page.goto(`${PORTAL_BASE}/c/portal/logout`, { timeout: 10000 });
      } catch {
        // Best-effort logout — ignore errors
      }
    }
    if (this.browser) {
      await this.browser.close();
    }
    this.browser = null;
    this.page = null;
    this.connected = false;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private assertConnected(method: string): void {
    if (!this.connected || !this.page) {
      throw new ConnectorStateError(
        BANK_ID,
        `${method}() called before connect(). Call connect() first.`,
      );
    }
  }

  private async login(): Promise<void> {
    const page = this.page!;
    const loginUrl = `${PORTAL_BASE}/web/guest/home#!/login/username?username=${encodeURIComponent(this.credentials.username)}`;

    try {
      await page.goto(loginUrl, { timeout: 30000 });
    } catch (e) {
      throw new NetworkError(BANK_ID, `Failed to load login page: ${(e as Error).message}`);
    }

    // Step 1 — Security question
    await this.answerSecurityQuestion(page);

    // Step 2 — Password
    await this.submitPassword(page);

    // Confirm post-login dashboard
    const dashboard = page.locator(SEL.DASHBOARD_SENTINEL);
    try {
      await dashboard.waitFor({ state: 'visible', timeout: 20000 });
    } catch {
      const currentUrl = page.url();
      throw new AuthError(BANK_ID, `Login did not reach dashboard. Current URL: ${currentUrl}`);
    }
  }

  private async answerSecurityQuestion(page: Page): Promise<void> {
    // Wait for the question to appear
    try {
      await page.waitForSelector(SEL.SECURITY_QUESTION_TEXT, { timeout: 15000 });
    } catch {
      throw new AuthError(BANK_ID, 'Security question step did not appear');
    }

    const questionEl = page.locator(SEL.SECURITY_QUESTION_TEXT);
    const questionText = (await questionEl.innerText()).trim();

    // Log the question text — safe (not sensitive) and crucial for updating patterns
    const match = this.credentials.securityQA.find((qa) =>
      new RegExp(qa.pattern, 'i').test(questionText),
    );

    this.logger.info(
      { step: 'security-question', securityQuestion: questionText, matched: match !== undefined },
      match
        ? 'Security question matched — filling answer'
        : 'Security question did not match any configured pattern',
    );

    if (!match) {
      // Log at warn so the operator can add the missing pattern
      this.logger.warn(
        { step: 'security-question', securityQuestion: questionText, matched: false },
        'No pattern matched — add this question to BGENERAL_SECURITY_QA',
      );
      throw new AuthError(BANK_ID, 'No matching security question answer found in BGENERAL_SECURITY_QA');
    }

    await page.fill(SEL.SECURITY_ANSWER_INPUT, match.answer);
    await page.click(SEL.SECURITY_SUBMIT);

    // Wait for the password step to render
    try {
      await page.waitForSelector(SEL.PASSWORD_INPUT, { timeout: 15000 });
    } catch {
      throw new AuthError(BANK_ID, 'Password step did not appear after answering security question');
    }
  }

  private async submitPassword(page: Page): Promise<void> {
    await page.fill(SEL.PASSWORD_INPUT, this.credentials.password);
    await page.click(SEL.PASSWORD_SUBMIT);
  }
}

/** Factory — loads credentials from env vars at instantiation time. */
export function createBGeneralConnector(): BGeneralConnector {
  return new BGeneralConnector(loadBgeneralCredentials());
}
