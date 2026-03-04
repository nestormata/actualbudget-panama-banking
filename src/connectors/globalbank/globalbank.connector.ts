import { chromium, type Browser, type Page } from 'playwright';
import type { BankConnector } from '../../shared/connector.interface.js';
import type { BankAccount, RawTransaction, CanonicalTransaction } from '../../shared/types.js';
import { AuthError, ConnectorStateError, NetworkError } from '../../shared/errors.js';
import { normalizeTransactions } from '../../shared/normalize.js';
import { parseAccounts } from './parsers/accounts.js';
import { parseTransactions, getPageCount } from './parsers/transactions.js';
import { isChallengedPage } from './parsers/challenge.js';

const BANK_ID = 'globalbank-pa';
const LOGIN_URL = 'https://globalonline.globalbank.com.pa/eBanking/seguridad/login.htm';
const BASE_URL = 'https://globalonline.globalbank.com.pa';

export interface GlobalBankCredentials {
  username: string;
  password: string;
}

/**
 * Playwright-based connector for GlobalBank Panama's online banking portal.
 * Implements the BankConnector interface for multi-bank compatibility.
 */
export class GlobalBankConnector implements BankConnector {
  readonly bankId = BANK_ID;

  private browser: Browser | null = null;
  private page: Page | null = null;
  private connected = false;

  constructor(private readonly credentials: GlobalBankCredentials) {}

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

    // Navigate to the consolidated position page
    const accountsUrl = `${BASE_URL}/eBanking/productos/posicionConsolidada.htm`;
    await page.goto(accountsUrl, { waitUntil: 'networkidle', timeout: 30000 });

    return parseAccounts(page);
  }

  // ── BankConnector.getTransactions() ─────────────────────────────────────

  async getTransactions(accountId: string, _from: Date, _to: Date): Promise<RawTransaction[]> {
    this.assertConnected('getTransactions');
    const page = this.page!;

    // First get the account list to find the uniqueId for this accountId
    const accounts = await this.getAccounts();
    const account = accounts.find((a) => a.id === accountId);

    if (!account) {
      throw new ConnectorStateError(BANK_ID, `Account "${accountId}" not found in portal`);
    }

    const uniqueId = account.uniqueId ?? accountId;

    // Navigate to the movements page for this account
    // The URL pattern uses the execution token from the current page
    const currentUrl = page.url();
    const execMatch = currentUrl.match(/execution=(e\d+s\d+)/);
    const execution = execMatch ? execMatch[1] : 'e1s1';

    const txUrl =
      `${BASE_URL}/eBanking/productos/posicionConsolidada.htm?execution=${execution}&_eventId=movimientos&idProducto=${uniqueId}`;
    await page.goto(txUrl, { waitUntil: 'networkidle', timeout: 30000 });

    const allTransactions: RawTransaction[] = [];
    const totalPages = await getPageCount(page);

    for (let p = 1; p <= totalPages; p++) {
      if (p > 1) {
        // Click the "next page" button
        const nextBtn = page.locator('img[alt="Página Siguiente"]').locator('..');
        await nextBtn.click();
        await page.waitForLoadState('networkidle', { timeout: 20000 });
      }
      const pageTxs = await parseTransactions(page, accountId);
      allTransactions.push(...pageTxs);
    }

    return allTransactions;
  }

  // ── BankConnector.normalize() ────────────────────────────────────────────

  normalize(raw: RawTransaction[], accountId: string): CanonicalTransaction[] {
    return normalizeTransactions(raw, BANK_ID, accountId);
  }

  // ── BankConnector.disconnect() ───────────────────────────────────────────

  async disconnect(): Promise<void> {
    if (this.page) {
      try {
        await this.page.goto(`${BASE_URL}/eBanking/usuario/eliminarToken.htm`, { timeout: 10000 });
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

    try {
      await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) {
      throw new NetworkError(BANK_ID, `Failed to load login page: ${(e as Error).message}`);
    }

    // Step 1: enter username
    await page.waitForSelector('input[name="j_username"]', { timeout: 10000 });
    await page.fill('input[name="j_username"]', this.credentials.username);
    await page.click('input#botonSendUsername');
    await page.waitForLoadState('networkidle', { timeout: 20000 });

    // Check for challenge after username step
    if (await isChallengedPage(page)) {
      throw new AuthError(BANK_ID, 'Security challenge detected after username step', {
        challengeDetected: true,
      });
    }

    // Step 2: enter password
    const pwInput = page.locator('input#password[name="j_password"]');
    const pwCount = await pwInput.count();
    if (pwCount === 0) {
      // Could be "session already active" error
      const bodyText = await page.textContent('body') ?? '';
      if (bodyText.includes('sesión anterior')) {
        throw new AuthError(BANK_ID, 'Another session is already active. Wait 5 minutes and retry.');
      }
      throw new AuthError(BANK_ID, 'Password input not found after username step');
    }

    await pwInput.fill(this.credentials.password);
    await page.click('input#botonSendPassword');
    await page.waitForLoadState('networkidle', { timeout: 20000 });

    // Check for challenge after password step
    if (await isChallengedPage(page)) {
      throw new AuthError(BANK_ID, 'Security challenge detected after password step', {
        challengeDetected: true,
      });
    }

    // Verify we landed on the main portal (not an error page)
    const postLoginUrl = page.url();
    if (!postLoginUrl.includes('/eBanking/')) {
      throw new AuthError(BANK_ID, `Login failed — unexpected URL after login: ${postLoginUrl}`);
    }

    // Check for authentication error messages
    const errorBox = page.locator('#errorBox[style*="visible"], .errorBox');
    if ((await errorBox.count()) > 0) {
      const errorText = await errorBox.innerText().catch(() => 'unknown error');
      throw new AuthError(BANK_ID, `Login failed: ${errorText.trim()}`);
    }
  }
}
