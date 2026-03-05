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
  /** Cached after first successful fetch to avoid repeated dashboard reloads. */
  private cachedAccounts: BankAccount[] | null = null;

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
        viewport: { width: 1280, height: 800 },
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
    if (this.cachedAccounts) return this.cachedAccounts;

    const page = this.page!;
    // Only navigate if not already on the dashboard (avoids reload after login redirect)
    if (!page.url().includes('/group/guest/dashboard')) {
      try {
        await page.goto(SEL.ACCOUNTS_URL, { timeout: 60000, waitUntil: 'domcontentloaded' });
      } catch (e) {
        // ERR_ABORTED can occur if a redirect is already in-flight — wait for it to settle
        if ((e as Error).message.includes('ERR_ABORTED')) {
          await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
        } else {
          throw e;
        }
      }
    }

    // Extract account data directly inside waitForFunction to avoid the race condition
    // where Angular's digest cycle clears scope data between two separate page.evaluate calls.
    // Returns serialized account data when Angular has fully bound it, or null to keep polling.
    type RawAccountData = {
      number: string; maskedNumber: string; name: string;
      classType: string; currentBalance: number; href: string;
    };

    let rawAccounts: RawAccountData[] | null = null;
    try {
      const handle = await page.waitForFunction(
        (sel) => {
          type Win = { angular?: { element: (el: Element) => { scope?: () => Record<string, unknown> } } };
          const win = window as unknown as Win;
          if (!win.angular) return null;
          const items = document.querySelectorAll(sel);
          if (items.length === 0) return null;
          const results: Array<{ number: string; maskedNumber: string; name: string; classType: string; currentBalance: number; href: string }> = [];
          Array.from(items).forEach((item) => {
            const sc = win.angular!.element(item).scope?.();
            const a = sc?.['account'] as Record<string, unknown> | undefined;
            if (!a?.['number']) return;
            // Use link.href (DOM property, always absolute) — live portal uses relative href attributes
            const link = Array.from(item.querySelectorAll('a')).find(
              (el) => (el as HTMLAnchorElement).href.includes('/group/guest/'),
            ) as HTMLAnchorElement | undefined;
            if (!link?.href) return; // skip items where ng-include partial hasn't rendered links yet
            results.push({
              number: (a['number'] as string) ?? '',
              maskedNumber: (a['maskedNumber'] as string) ?? '',
              name: (a['name'] as string) ?? '',
              classType: (a['classType'] as string) ?? '',
              currentBalance: (a['currentBalance'] as number) ?? 0,
              href: link.href,
            });
          });
          return results.length > 0 ? results : null;
        },
        SEL.DASHBOARD_SENTINEL,
        { timeout: 120000, polling: 1000 },
      );
      rawAccounts = await handle.jsonValue();
    } catch {
      const url = page.url();
      const diag = await page.evaluate((sel) => {
        type Win = { angular?: { element: (el: Element) => { scope?: () => Record<string, unknown> } } };
        const win = window as unknown as Win;
        const items = document.querySelectorAll(sel);
        const firstScopeKeys = items.length > 0 && win.angular
          ? Object.keys(win.angular.element(items[0]).scope?.() ?? {}).filter(k => !k.startsWith('$'))
          : [];
        return {
          itemCount: items.length,
          hasAngular: !!win.angular,
          firstScopeKeys,
          html: document.documentElement.outerHTML.slice(0, 200000),
        };
      }, SEL.DASHBOARD_SENTINEL).catch((e) => ({ itemCount: -1, hasAngular: false, firstScopeKeys: [], html: String(e) }));
      this.logger.error({ url, ...diag }, 'Dashboard Angular items never had scope data — full page HTML attached');
      throw new AuthError(BANK_ID, `Dashboard accounts did not load. URL: ${url}, angular: ${diag.hasAngular}, items: ${diag.itemCount}`);
    }

    // Map raw data to BankAccount (same logic as parseAccounts but from in-browser extracted data)
    const accountTypeMap: Record<string, BankAccount['type']> = {
      SavingsAccount: 'savings', CheckingAccount: 'checking',
      CreditCard: 'credit', LoanAccount: 'loan',
    };
    this.cachedAccounts = (rawAccounts ?? [])
      .filter((a) => a.classType !== 'BGProfuture' && a.maskedNumber && a.href)
      .filter((a, i, arr) => arr.findIndex(b => b.maskedNumber === a.maskedNumber) === i) // deduplicate mobile/desktop rows
      .map((a): BankAccount => ({
        id: a.maskedNumber,
        name: a.name || a.maskedNumber,
        type: accountTypeMap[a.classType] ?? 'unknown',
        balance: Math.round(a.currentBalance * 100),
        currency: 'USD',
        rawBalance: `$${a.currentBalance.toFixed(2)}`,
        uniqueId: a.href,
      }));

    if (this.cachedAccounts.length === 0) {
      const url = page.url();
      this.logger.error({ url, rawAccounts, html: await page.evaluate(() => document.documentElement.outerHTML.slice(0, 200000)).catch(String) },
        'Accounts extraction returned 0 after filtering — raw data and page HTML attached');
      throw new ConnectorStateError(BANK_ID, `parseAccounts returned 0 accounts after filtering. URL: ${url}`);
    }

    this.logger.info(
      { accountCount: this.cachedAccounts.length, accounts: this.cachedAccounts.map(a => ({ id: a.id, type: a.type })) },
      'Accounts loaded from portal',
    );
    return this.cachedAccounts;

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
      await page.waitForSelector(SEL.CC_ROW_SENTINEL, { timeout: 60000 });
      return parseCreditCardTransactions(page, accountId);
    }

    await page.waitForSelector(SEL.TRANSACTION_ROW_SENTINEL, { timeout: 60000 });
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
    this.cachedAccounts = null;
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

    // Confirm post-login: wait for URL to reach the Liferay dashboard (not just leave /login)
    // then wait for the page to fully settle — prevents ERR_ABORTED race in getAccounts()
    try {
      await page.waitForURL(
        (url) => url.pathname.startsWith('/group/guest/'),
        { timeout: 60000 },
      );
      // Let the page finish loading before any subsequent navigation attempts
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    } catch {
      const currentUrl = page.url();
      throw new AuthError(BANK_ID, `Login did not reach dashboard. Current URL: ${currentUrl}`);
    }
  }

  private async answerSecurityQuestion(page: Page): Promise<void> {
    // Wait for the question to appear
    try {
      await page.waitForSelector(SEL.SECURITY_QUESTION_TEXT, { timeout: 60000 });
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
      await page.waitForSelector(SEL.PASSWORD_INPUT, { timeout: 60000 });
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
