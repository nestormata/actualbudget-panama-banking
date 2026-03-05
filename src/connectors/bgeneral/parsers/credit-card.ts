import type { Page } from 'playwright';
import type { RawTransaction } from '../../../shared/types.js';
import { createLogger } from '../../../shared/logger.js';

const BANK_ID = 'bgeneral-pa';
const logger = createLogger({ bankId: BANK_ID });

/**
 * CSS selectors for the credit card detail page.
 * The page has two tabs:
 *  - "Últimos movimientos" (#menu1) — current billing period, ng-var: movement
 *  - "Estado de cuenta"   (#menu2) — last closed statement, ng-var: statementMovements
 */
const SEL = {
  /** Current (open period) transaction rows */
  CURRENT_TX_ROW:
    '[ng-repeat*="movement in cardCtrl.globalMovements.lastMovements.movements"]',
  /** Tab link that switches to the closed statement view */
  STATEMENT_TAB: 'a[href*="#menu2"]',
  /** Closed-statement transaction rows */
  STATEMENT_TX_ROW:
    '[ng-repeat*="statementMovements in cardCtrl.statementMovements.movements"]',
} as const;

type CcMovement = {
  dateMovement: number;
  natureMovement: string;
  amountMovement: number;
  description: string;
  id: string;
};

/** Extract CC movements from rows identified by `selector`, using `scopeVar` name. */
async function extractMovements(
  page: Page,
  selector: string,
  scopeVar: string,
): Promise<CcMovement[]> {
  return page.evaluate(
    ({ sel, scopeKey }): CcMovement[] => {
      const rows = document.querySelectorAll(sel);
      const seen = new Set<string>();
      const result: CcMovement[] = [];

      rows.forEach((row) => {
        const win = window as unknown as {
          angular?: { element: (el: Element) => { scope?: () => Record<string, unknown> } };
        };
        if (!win.angular) return;
        const sc = win.angular.element(row).scope?.();
        const m = sc?.[scopeKey] as Record<string, unknown> | undefined;
        if (!m) return;

        const id = (m['id'] as string) ?? '';
        if (id && seen.has(id)) return; // deduplicate
        if (id) seen.add(id);

        result.push({
          dateMovement: (m['dateMovement'] as number) ?? 0,
          natureMovement: (m['natureMovement'] as string) ?? '',
          amountMovement: (m['amountMovement'] as number) ?? 0,
          description: (m['description'] as string) ?? '',
          id,
        });
      });

      return result;
    },
    { sel: selector, scopeKey: scopeVar },
  );
}

/** Convert a CcMovement array to RawTransaction[]. */
function toRawTransactions(movements: CcMovement[], accountId: string): RawTransaction[] {
  return movements.map((m): RawTransaction => {
    const d = new Date(m.dateMovement);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    return {
      accountId,
      rawDate: `${day}/${month}/${year}`,
      rawAmount: String(m.amountMovement),
      isDebit: m.natureMovement === 'D',
      payee: m.description,
      notes: m.id ? `ref:${m.id}` : null,
    };
  });
}

/**
 * Scrape credit card transactions: current open-period movements + last closed statement.
 */
export async function parseCreditCardTransactions(
  page: Page,
  accountId: string,
): Promise<RawTransaction[]> {
  // Current open-period movements (tab 1 — default view)
  const currentMovements = await extractMovements(page, SEL.CURRENT_TX_ROW, 'movement');
  const currentTxs = toRawTransactions(currentMovements, accountId);

  // Navigate to the closed statement tab
  const stmtTabEl = page.locator(SEL.STATEMENT_TAB);
  if ((await stmtTabEl.count()) === 0) {
    logger.info(
      { accountId, statement: 'previous' },
      'No statement tab found — returning current movements only',
    );
    return currentTxs;
  }

  await stmtTabEl.first().click();
  await page
    .waitForSelector(SEL.STATEMENT_TX_ROW, { timeout: 15000 })
    .catch(() => {
      // Statement may be empty — continue
    });

  const stmtMovements = await extractMovements(page, SEL.STATEMENT_TX_ROW, 'statementMovements');
  const stmtTxs = toRawTransactions(stmtMovements, accountId);

  return [...currentTxs, ...stmtTxs];
}
