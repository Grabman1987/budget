import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yauzl from 'yauzl';
import { openDatabase } from '@budget/db';
import { expectScreenshot } from './visual';
import { SoftAuthenticator } from '../apps/server/src/auth/testing/authenticator';
import { E2E_SETUP_TOKEN } from '../playwright.config';
import { HEUTE_HEADING } from './routes';

/**
 * Passkey login end to end on an empty server: the browser's virtual authenticator performs real
 * WebAuthn ceremonies (Chromium DevTools protocol), the server verifies them for real.
 */
async function addVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

async function zipEntries(bytes: Buffer): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error ?? new Error('Export ZIP could not be parsed'));
      const names: string[] = [];
      zip.on('error', reject);
      zip.on('entry', (entry) => {
        names.push(entry.fileName);
        zip.readEntry();
      });
      zip.on('end', () => resolve(names));
      zip.readEntry();
    });
  });
}

test('bootstrap, login, recovery, device management and CSRF on a fresh server', async ({
  page,
  baseURL,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const origin = baseURL as string;
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(msg.text());
  });
  await addVirtualAuthenticator(page);
  let codes: string[] = [];

  await test.step('nothing but the setup page is reachable before the first passkey', async () => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Einrichten' })).toBeVisible();
    // The API refuses everything without a session, the shell never renders.
    expect((await page.request.get('/api/debug/summary')).status()).toBe(401);
    const exportResponse = await page.request.get('/api/export/csv.zip');
    expect(exportResponse.status()).toBe(401);
    expect(exportResponse.headers()['content-type']).not.toContain('application/zip');
    await page.goto('/plan/monat');
    await expect(page).toHaveURL(/\/setup$/);
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    await expectScreenshot(page, 'setup-page.png');
  });

  await test.step('a wrong setup token is rejected with a message', async () => {
    await page.getByLabel('Einrichtungscode').fill('not-the-token');
    await page.getByRole('button', { name: 'Passkey anlegen' }).click();
    await expect(page.getByRole('alert')).toContainText(/Einrichtungscode/);
    await expect(page).toHaveURL(/\/setup$/);
  });

  await test.step('the right token registers the first passkey and shows ten recovery codes once', async () => {
    await page.getByLabel('Einrichtungscode').fill(E2E_SETUP_TOKEN);
    await page.getByLabel('Gerätename').fill('E2E-Gerät');
    await page.getByRole('button', { name: 'Passkey anlegen' }).click();
    const list = page.getByRole('list', { name: 'Wiederherstellungscodes' });
    await expect(list.getByRole('listitem')).toHaveCount(10);
    codes = (await list.getByRole('listitem').allTextContents()).map((t) => t.trim());
    expect(codes.every((c) => /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(c))).toBe(true);
    const next = page.getByRole('button', { name: 'Weiter zu Budget' });
    await expect(next).toBeDisabled();
    await page.getByLabel('Ich habe die Codes sicher gespeichert').check();
    await next.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: HEUTE_HEADING })).toBeVisible();
  });

  await test.step('the session cookie is HttpOnly, SameSite=Strict, lasts 30 days and never reaches scripts', async () => {
    const cookie = (await page.context().cookies()).find((c) => c.name.endsWith('budget_session'));
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Strict');
    const days = ((cookie?.expires ?? 0) - Date.now() / 1000) / 86_400;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30);
    expect(await page.evaluate(() => document.cookie)).toBe('');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: HEUTE_HEADING })).toBeVisible();
  });

  await test.step('the setup page is gone for good once a passkey exists', async () => {
    await page.goto('/setup');
    await expect(page).toHaveURL(/\/$/);
  });

  await test.step('CSV export asks for a fresh passkey and downloads a parseable archive', async () => {
    const databasePath = join(process.cwd(), 'test-results', `e2e-${testInfo.project.name}.sqlite`);
    const opened = openDatabase(databasePath);
    opened.sqlite
      .prepare('UPDATE auth_session SET step_up_at = ? WHERE revoked_at IS NULL')
      .run('2000-01-01T00:00:00.000Z');
    opened.close();
    const staleResponse = await page.request.get('/api/export/csv.zip');
    expect(staleResponse.status()).toBe(403);
    expect(staleResponse.headers()['content-type']).not.toContain('application/zip');
    expect(await staleResponse.json()).toMatchObject({ error: 'step_up_required' });

    let stepUpChallenges = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/auth/step-up/options')) stepUpChallenges += 1;
    });
    await page.goto('/einstellungen/export');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'ZIP-Export herunterladen' }).click();
    const download = await downloadPromise;
    expect(stepUpChallenges).toBe(1);
    expect(download.suggestedFilename()).toMatch(/^budget-export-\d{4}-\d{2}-\d{2}\.zip$/);
    const path = await download.path();
    expect(path).toBeTruthy();
    const names = await zipEntries(readFileSync(path as string));
    expect(names.sort()).toEqual([
      'accounts.csv',
      'asset_class_targets.csv',
      'asset_classes.csv',
      'bookings.csv',
      'fx_rates.csv',
      'holdings.csv',
      'positions.csv',
      'prices.csv',
      'savings_plans.csv',
      'securities.csv',
      'trades.csv',
      'valuations.csv',
    ]);
  });

  await test.step('sign out from Einstellungen › Sicherheit, then log in again with the passkey', async () => {
    await page.goto('/einstellungen/sicherheit');
    await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sicherheit' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText('E2E-Gerät')).toBeVisible();
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/plan/monat');
    await expect(page).toHaveURL(/\/login$/);
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    await expectScreenshot(page, 'login-page.png');

    await page.getByRole('button', { name: 'Mit Passkey anmelden' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: HEUTE_HEADING })).toBeVisible();
  });

  await test.step('a recovery code logs in exactly once', async () => {
    await page.goto('/einstellungen/sicherheit');
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole('button', { name: 'Wiederherstellungscode verwenden' }).click();
    await page.getByLabel('Wiederherstellungscode').fill((codes[0] as string).toLowerCase());
    await page.getByRole('button', { name: 'Mit Code anmelden' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/einstellungen/sicherheit');
    await expect(page.getByText(/9 von 10/)).toBeVisible();
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await page.getByRole('button', { name: 'Wiederherstellungscode verwenden' }).click();
    await page.getByLabel('Wiederherstellungscode').fill(codes[0] as string);
    await page.getByRole('button', { name: 'Mit Code anmelden' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  await test.step('devices: a second passkey is listed, can be revoked, the last one cannot', async () => {
    await page.getByRole('button', { name: 'Zurück zum Passkey' }).click();
    await page.getByRole('button', { name: 'Mit Passkey anmelden' }).click();
    await expect(page).toHaveURL(/\/$/);

    // A second device is registered through the API (session and fresh step-up from the login).
    const headers = { origin, 'content-type': 'application/json' };
    const second = new SoftAuthenticator({ rpID: 'localhost', origin });
    const options = (await (
      await page.request.post('/api/auth/register/options', { headers, data: {} })
    ).json()) as { options: { challenge: string } };
    const verify = await page.request.post('/api/auth/register/verify', {
      headers,
      data: { response: second.register(options.options), deviceName: 'Zweites Gerät' },
    });
    expect(verify.ok()).toBe(true);

    await page.goto('/einstellungen/sicherheit');
    await expect(page.getByText('Zweites Gerät')).toBeVisible();
    await page.getByRole('button', { name: 'Passkey Zweites Gerät entfernen' }).click();
    await page.getByRole('button', { name: 'Endgültig entfernen' }).click();
    await expect(page.getByText('Zweites Gerät')).toHaveCount(0);

    await page.getByRole('button', { name: 'Passkey E2E-Gerät entfernen' }).click();
    await page.getByRole('button', { name: 'Endgültig entfernen' }).click();
    await expect(page.getByText(/letzte|mindestens ein/i)).toBeVisible();
    await expect(page.getByText('E2E-Gerät')).toBeVisible();
  });

  await test.step('"Alle anderen Sitzungen beenden" signs out another browser, this one stays', async () => {
    // A second browser logs in with a recovery code (such sessions belong to no passkey).
    const other = await browser.newContext({ baseURL: origin });
    const otherPage = await other.newPage();
    const headers = { origin, 'content-type': 'application/json' };
    const recovery = await otherPage.request.post('/api/auth/recovery/login', {
      headers,
      data: { code: codes[1] },
    });
    expect(recovery.ok()).toBe(true);

    await page.goto('/einstellungen/sicherheit');
    await expect(page.getByText(/weitere Sitzung/)).toBeVisible();
    await page.getByRole('button', { name: 'Alle anderen Sitzungen beenden' }).click();
    await expect(page.getByText(/andere Sitzung(en)? beendet/)).toBeVisible();
    await expect(page.getByText('Keine anderen Sitzungen aktiv.')).toBeVisible();
    const status = (await (await otherPage.request.get('/api/auth/status')).json()) as {
      authenticated: boolean;
    };
    expect(status.authenticated).toBe(false);
    await other.close();
  });

  await test.step('CSRF: state-changing calls from a foreign origin are refused, foreign sites get no session', async () => {
    const foreign = await page.request.post('/api/auth/logout', {
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      data: {},
    });
    expect(foreign.status()).toBe(403);
    expect((await page.request.get('/api/auth/status')).ok()).toBe(true);
    // A brand-new browser context has no cookie: protected data is not reachable.
    const stranger = await browser.newContext();
    expect((await stranger.request.get(`${origin}/api/debug/summary`)).status()).toBe(401);
    const status = (await (await stranger.request.get(`${origin}/api/auth/status`)).json()) as {
      authenticated: boolean;
    };
    expect(status.authenticated).toBe(false);
    await stranger.close();
  });

  expect(problems.filter((p) => !/401|403|429|Failed to load resource/.test(p))).toEqual([]);
});

test('the login page works on the phone: 44 px targets, no horizontal scroll', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, '44 px targets are a phone requirement (DESIGN.md)');
  await page.goto('/login');
  await page.goto('/setup'); // whichever applies for the server state
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, input, a')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({
        text: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim(),
        h: el.getBoundingClientRect().height,
      }))
      .filter((el) => el.h < 43.5),
  );
  expect(small).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
