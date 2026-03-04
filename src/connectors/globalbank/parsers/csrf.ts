import type { Page } from 'playwright';
import { ParseError } from '../../../shared/errors.js';

const BANK_ID = 'globalbank-pa';

/**
 * Extract the CSRF token from the login form.
 * The token is stored in a hidden input field named `_csrf`.
 */
export async function extractCsrfToken(page: Page): Promise<string> {
  const input = page.locator('input[name="_csrf"]').first();
  const count = await input.count();
  if (count === 0) {
    throw new ParseError(BANK_ID, 'CSRF token input not found', 'input[name="_csrf"]');
  }
  const value = await input.getAttribute('value');
  if (!value) {
    throw new ParseError(BANK_ID, 'CSRF token input has empty value', 'input[name="_csrf"]');
  }
  return value;
}
