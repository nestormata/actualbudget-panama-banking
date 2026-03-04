import type { Page } from 'playwright';
import type { RawTransaction } from '../../../shared/types.js';
import { ParseError } from '../../../shared/errors.js';

const BANK_ID = 'globalbank-pa';

/**
 * Parse transaction rows from the movements page.
 * Table id: `table_1`; columns: Fecha(0), Concepto(1), Débitos(2), Créditos(3), Saldo(4)
 * Data rows have class `odd` or `even`.
 */
export async function parseTransactions(page: Page, accountId: string): Promise<RawTransaction[]> {
  const rows = page.locator('table#table_1 tr.odd, table#table_1 tr.even');
  const rowCount = await rows.count();

  if (rowCount === 0) {
    throw new ParseError(BANK_ID, 'No transaction rows found', 'table#table_1 tr.odd,tr.even');
  }

  const transactions: RawTransaction[] = [];

  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);
    const cells = row.locator('td');
    const cellCount = await cells.count();

    // Skip rows that don't have the expected 5 columns (e.g., pagination rows)
    if (cellCount < 5) continue;

    const rawDate = (await cells.nth(0).innerText()).trim();
    const rawPayee = (await cells.nth(1).innerText()).trim();
    const rawDebit = (await cells.nth(2).innerText()).trim();
    const rawCredit = (await cells.nth(3).innerText()).trim();

    // Skip summary rows (no valid date)
    if (!rawDate || rawDate.toLowerCase().includes('página')) continue;

    const hasDebit = rawDebit.length > 0 && rawDebit !== '$' && rawDebit !== '$ ';
    const hasCredit = rawCredit.length > 0 && rawCredit !== '$' && rawCredit !== '$ ';

    if (!hasDebit && !hasCredit) continue; // skip rows with no amount

    transactions.push({
      accountId,
      rawDate,
      rawAmount: hasDebit ? rawDebit : rawCredit,
      isDebit: hasDebit,
      payee: rawPayee.replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&lt;/g, '<'),
      notes: undefined,
    });
  }

  return transactions;
}

/**
 * Returns the total page count from the pagination toolbar.
 * Format: "Página X de Y"
 */
export async function getPageCount(page: Page): Promise<number> {
  const paginationText = await page.locator('tr.toolbar').filter({ hasText: /Página/ }).innerText().catch(() => '');
  const match = paginationText.match(/P[áa]gina\s+\d+\s+de\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : 1;
}
