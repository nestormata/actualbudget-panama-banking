import type { Page } from 'playwright';
import type { BankAccount } from '../../../shared/types.js';

const BANK_ID = 'bgeneral-pa';

/**
 * CSS selector for account item rows on the dashboard.
 * Each row binds an Angular `account` scope variable.
 */
const SEL = {
  ACCOUNT_ROW: '.bgp-dash-table-item',
} as const;

/** Map portal classType to a canonical account type. */
function mapAccountType(classType: string): BankAccount['type'] {
  switch (classType) {
    case 'SavingsAccount': return 'savings';
    case 'CheckingAccount': return 'checking';
    case 'CreditCard': return 'credit';
    case 'LoanAccount': return 'loan';
    default: return 'unknown';
  }
}

/**
 * Parse the dashboard accounts overview page using Angular scope data.
 * Skips pension/profuture accounts (classType BGProfuture) which have no transaction view.
 */
export async function parseAccounts(page: Page): Promise<BankAccount[]> {
  type RawAccount = {
    number: string;
    maskedNumber: string;
    name: string;
    classType: string;
    currentBalance: number;
    href: string;
  };

  const rawAccounts = await page.evaluate((selector): RawAccount[] => {
    const items = document.querySelectorAll(selector);
    const result: RawAccount[] = [];

    items.forEach((item) => {
      const win = window as unknown as { angular?: { element: (el: Element) => { scope?: () => Record<string, unknown> } } };
      if (!win.angular) return;
      const sc = win.angular.element(item).scope?.();
      const a = sc?.['account'] as Record<string, unknown> | undefined;
      if (!a) return;

      // Use link.href (DOM property, always absolute) — live portal uses relative href attributes
      const link = Array.from(item.querySelectorAll('a')).find(
        (a): a is HTMLAnchorElement => (a as HTMLAnchorElement).href.includes('/group/guest/'),
      ) as HTMLAnchorElement | undefined;
      result.push({
        number: (a['number'] as string) ?? '',
        maskedNumber: (a['maskedNumber'] as string) ?? '',
        name: (a['name'] as string) ?? '',
        classType: (a['classType'] as string) ?? '',
        currentBalance: (a['currentBalance'] as number) ?? 0,
        href: link?.href ?? '',
      });
    });

    return result;
  }, SEL.ACCOUNT_ROW);

  return rawAccounts
    .filter((a) => a.classType !== 'BGProfuture' && a.number && a.href)
    .map((a): BankAccount => ({
      id: a.number,
      name: a.name || a.maskedNumber,
      type: mapAccountType(a.classType),
      balance: Math.round(a.currentBalance * 100),
      currency: 'USD',
      rawBalance: `$${a.currentBalance.toFixed(2)}`,
      uniqueId: a.href,
    }));
}
