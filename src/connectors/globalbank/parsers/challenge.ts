import type { Page } from 'playwright';

/**
 * Detect if the current page is a security challenge (OTP/Token entry) page.
 * A challenge page has an input field specifically for entering an OTP or token code.
 * This is distinct from the normal portal pages which may mention "Token" in FAQ nav links.
 */
export async function isChallengedPage(page: Page): Promise<boolean> {
  const challengeInputCount = await page
    .locator('input[name="j_otp"], input[name="otp"], input[name="token"], input[id*="token"], input[id*="otp"]')
    .count();
  return challengeInputCount > 0;
}
