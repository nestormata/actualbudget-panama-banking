/**
 * One-shot fixture capture script.
 * Usage: GLOBALBANK_USER=xxx GLOBALBANK_PASS=xxx node --experimental-vm-modules scripts/capture-fixtures.mjs
 * Run via: docker compose run --rm fixture-capture
 * Saves HTML snapshots to src/connectors/globalbank/fixtures/
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'src', 'connectors', 'globalbank', 'fixtures');
mkdirSync(FIXTURES_DIR, { recursive: true });

const USERNAME = process.env.GLOBALBANK_USER;
const PASSWORD = process.env.GLOBALBANK_PASS;

if (!USERNAME || !PASSWORD) {
  console.error('ERROR: GLOBALBANK_USER and GLOBALBANK_PASS env vars required');
  process.exit(1);
}

const LOGIN_URL = 'https://globalonline.globalbank.com.pa/eBanking/seguridad/login.htm';

async function save(name, content) {
  const dest = join(FIXTURES_DIR, name);
  writeFileSync(dest, content, 'utf-8');
  console.log(`Saved ${dest} (${content.length} bytes)`);
}

/** A challenge page has an input for entering an OTP/token code — not just nav links mentioning "Token". */
async function isChallengePage(page) {
  return await page.locator(
    'input[name="j_otp"], input[name="otp"], input[name="token"], input[id*="token"], input[id*="otp"]'
  ).count() > 0;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  extraHTTPHeaders: { 'Accept-Language': 'es-PA,es;q=0.9,en;q=0.8' },
});
const page = await context.newPage();

try {
  // ── Step 1: Load login page ────────────────────────────────────────────────
  console.log('Navigating to login page...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await save('login.html', await page.content());

  // ── Step 2: Enter username ─────────────────────────────────────────────────
  console.log('Entering username...');
  await page.waitForSelector('input[name="j_username"]', { timeout: 10000 });
  await page.fill('input[name="j_username"]', USERNAME);
  await page.click('input#botonSendUsername');
  await page.waitForLoadState('networkidle', { timeout: 20000 });
  await save('password-step.html', await page.content());

  // ── Check for challenge after username step ────────────────────────────────
  if (await isChallengePage(page)) {
    await save('challenge.html', await page.content());
    console.log('WARNING: OTP/Token challenge page detected after username — saved as challenge.html');
    await browser.close();
    process.exit(0);
  }

  // ── Step 3: Enter password ─────────────────────────────────────────────────
  console.log('Entering password...');
  // Use the visible password input (not the "password-breaker" hidden one)
  await page.waitForSelector('input#password[name="j_password"]', { timeout: 10000 });
  await page.fill('input#password[name="j_password"]', PASSWORD);
  await page.click('input#botonSendPassword');
  await page.waitForLoadState('networkidle', { timeout: 20000 });
  await save('post-login.html', await page.content());

  // ── Check for "session already active" error ───────────────────────────────
  const postLoginText = await page.textContent('body') ?? '';
  if (postLoginText.includes('sesión anterior') || postLoginText.includes('finalizar la sesión')) {
    console.log('Active session detected — closing it and retrying login...');
    // Close the existing session
    await page.goto('https://globalonline.globalbank.com.pa/eBanking/usuario/eliminarToken.htm', { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    // Wait briefly for session to clear
    await page.waitForTimeout(3000);
    // Navigate back to login
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('input[name="j_username"]', { timeout: 10000 });
    await page.fill('input[name="j_username"]', USERNAME);
    await page.click('input#botonSendUsername');
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    // Enter password again
    await page.waitForSelector('input#password[name="j_password"]', { timeout: 10000 });
    await page.fill('input#password[name="j_password"]', PASSWORD);
    await page.click('input#botonSendPassword');
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await save('post-login.html', await page.content());
  }

  // ── Check for challenge after password step ────────────────────────────────
  if (await isChallengePage(page)) {
    await save('challenge.html', await page.content());
    console.log('WARNING: OTP/Token challenge page detected after password — saved as challenge.html');
    await browser.close();
    process.exit(0);
  }

  // ── At this point we should be in the main portal ─────────────────────────
  console.log(`Current URL: ${page.url()}`);
  await save('accounts.html', await page.content());
  console.log('Saved accounts/home page.');

  // ── Navigate to first account's transaction history ───────────────────────
  // The "Últimos 20 movimientos" link uses javascript: href — click it directly
  const movLink = page.locator('a').filter({ hasText: /movimientos/i }).first();
  const movCount = await movLink.count();
  console.log(`Found ${movCount} "movimientos" link(s)`);

  if (movCount > 0) {
    // These links use javascript: — extract idProducto and navigate directly
    const href = await movLink.getAttribute('href') ?? '';
    const match = href.match(/setEvento\('movimientos','(-?\d+)'\)/);
    if (match) {
      const idProducto = match[1];
      const txUrl = `https://globalonline.globalbank.com.pa/eBanking/productos/posicionConsolidada.htm?execution=e1s1&_eventId=movimientos&idProducto=${idProducto}`;
      console.log(`Navigating to transactions: ${txUrl}`);
      await page.goto(txUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await save('transactions.html', await page.content());
      console.log(`Saved transactions page from: ${page.url()}`);
    } else {
      console.log(`Could not parse idProducto from href: ${href}`);
    }
  } else {
    // Fallback: navigate directly using the uniqueID from the row onclick
    const rowOnclick = await page.locator('table#table_1 tr[onclick]').first().getAttribute('onclick');
    console.log(`Row onclick: ${rowOnclick}`);
    if (rowOnclick) {
      const match = rowOnclick.match(/uniqueID=(-?\d+)/);
      if (match) {
        const uniqueId = match[1];
        const txUrl = `/eBanking/productos/posicionConsolidada.htm?execution=e1s1&_eventId=movimientos&idProducto=${uniqueId}`;
        await page.goto(`https://globalonline.globalbank.com.pa${txUrl}`, { waitUntil: 'networkidle', timeout: 20000 });
        await save('transactions.html', await page.content());
        console.log(`Saved transactions page from: ${page.url()}`);
      }
    }
  }

  console.log('\nFixture capture complete! Files saved to:', FIXTURES_DIR);

  // Always logout cleanly so the next run doesn't hit "session already active"
  console.log('Logging out...');
  try {
    await page.goto('https://globalonline.globalbank.com.pa/eBanking/usuario/eliminarToken.htm', { timeout: 10000 });
    console.log('Logged out successfully.');
  } catch (e) {
    console.log('Logout attempt failed (non-critical):', e.message);
  }
} catch (err) {
  console.error('Error during capture:', err.message);
  try { await save('error-state.html', await page.content()); } catch (_) {}
  process.exitCode = 1;
} finally {
  await browser.close();
}
