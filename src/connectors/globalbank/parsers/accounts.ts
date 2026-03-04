import type { Page } from 'playwright';
import type { BankAccount } from '../../../shared/types.js';
import { ParseError } from '../../../shared/errors.js';

const BANK_ID = 'globalbank-pa';

/**
 * Parse the accounts overview table on the consolidated position page.
 * The table id is `table_1`; data rows have class `odd` or `even`.
 * Columns (0-indexed): 0=Tipo, 1=Nro.cuenta, 2=Referencia, 3=Moneda, 4=Saldo, 5=Movimientos
 */
export async function parseAccounts(page: Page): Promise<BankAccount[]> {
  const rows = page.locator('table#table_1 tr.odd, table#table_1 tr.even');
  const rowCount = await rows.count();

  if (rowCount === 0) {
    throw new ParseError(BANK_ID, 'No account rows found in accounts table', 'table#table_1 tr.odd,tr.even');
  }

  const accounts: BankAccount[] = [];

  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);
    const cells = row.locator('td');

    const accountNumber = (await cells.nth(1).innerText()).trim();
    const currency = (await cells.nth(3).innerText()).trim();
    const rawBalance = (await cells.nth(4).innerText()).trim();
    const name = (await cells.nth(0).innerText()).trim();

    // Extract uniqueID from the onclick attribute for later transaction navigation
    const onclick = (await row.getAttribute('onclick')) ?? '';
    const uniqueIdMatch = onclick.match(/uniqueID=(-?\d+)/);
    const uniqueId = uniqueIdMatch ? uniqueIdMatch[1] : accountNumber;

    accounts.push({
      id: accountNumber,
      name,
      currency,
      rawBalance,
      uniqueId,
    });
  }

  return accounts;
}
