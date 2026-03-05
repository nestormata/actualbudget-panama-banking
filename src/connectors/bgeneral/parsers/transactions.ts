import type { Page } from 'playwright';
import type { RawTransaction } from '../../../shared/types.js';

/**
 * CSS selector for individual transaction rows.
 * Each row binds an Angular `movement` scope variable via ng-repeat.
 */
const SEL = {
  TRANSACTION_ROW: '[ng-repeat="movement in accCtrl.product_movements"]',
} as const;

type Movement = {
  dateMovement: number;
  natureMovement: string;
  amountMovement: number;
  description: string;
  id: string;
};

/**
 * Parse the recent-transactions view for a checking or savings account.
 * Reads data from Angular scope — no date filter is applied (portal default).
 */
export async function parseTransactions(page: Page, accountId: string): Promise<RawTransaction[]> {
  const movements = await page.evaluate((selector): Movement[] => {
    const rows = document.querySelectorAll(selector);
    const seen = new Set<string>();
    const result: Movement[] = [];

    rows.forEach((row) => {
      const win = window as unknown as { angular?: { element: (el: Element) => { scope?: () => Record<string, unknown> } } };
      if (!win.angular) return;
      const sc = win.angular.element(row).scope?.();
      const m = sc?.['movement'] as Record<string, unknown> | undefined;
      if (!m) return;

      const id = (m['id'] as string) ?? '';
      if (id && seen.has(id)) return; // deduplicate (portal may render rows twice)
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
  }, SEL.TRANSACTION_ROW);

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
