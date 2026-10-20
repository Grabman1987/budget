import AxeBuilder from '@axe-core/playwright';
import { openDatabase, schema } from '@budget/db';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-20' });
const DAY = '2026-10-20';
interface Accounts {
  cash: string;
  checking: string;
  savings: string;
}
async function seed(page: Page, origin: string): Promise<Accounts> {
  const ids = { cash: '', checking: '', savings: '' };
  for (const [type, name, openingBalanceCents] of [
    ['cash', 'Bargeld Muster', 50000],
    ['checking', 'Giro Muster', 100000],
    ['savings', 'Sparen Muster', 100000],
  ] as const) {
    const response = await page.request.post('/api/accounts', {
      headers: { origin },
      data: {
        name,
        type,
        openingDate: '2026-01-01',
        openingBalanceCents,
      },
    });
    expect(response.status()).toBe(201);
    const result = (await response.json()) as { account: { id: string } };
    ids[type] = result.account.id;
  }
  return ids;
}
async function form(page: Page, from: string, to: string) {
  await page.goto(`/konten/${from}?panel=buchung`);
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Umbuchung', exact: true }).click();
  await dialog.getByLabel('Nach Konto', { exact: true }).selectOption(to);
  await dialog.getByLabel('Betrag', { exact: true }).fill('123,45');
  return dialog;
}
async function read(page: Page) {
  const response = await page.request.get('/api/accounts');
  expect(response.status()).toBe(200);
  return response.json() as Promise<{
    accounts: { id: string; balanceCents: number; clearedCents: number }[];
  }>;
}
function ledgerSnapshot(path: string) {
  const opened = openDatabase(path);
  try {
    return {
      booking: opened.db.select().from(schema.booking).all(),
      splits: opened.db.select().from(schema.bookingSplit).all(),
      transfer: opened.db.select().from(schema.transfer).all(),
      audit: opened.db.select().from(schema.auditLog).all(),
      delivery: opened.db.select().from(schema.bookingDelivery).all(),
    };
  } finally {
    opened.close();
  }
}

test('cash/bank transfer capture persists both directions and explicit confirmation with literal balances and grouped undo', async ({
  page,
  isolatedLedger,
}) => {
  const ids = await seed(page, isolatedLedger.origin);
  const patches: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && new URL(request.url()).pathname.startsWith('/api/bookings'))
      patches.push(request.url());
  });
  for (const bank of ['checking', 'savings'] as const) {
    const bankName = bank === 'checking' ? 'Giro Muster' : 'Sparen Muster';
    for (const reverse of [false, true])
      for (const confirm of [false, true]) {
        const dialog = await form(
          page,
          reverse ? ids[bank] : ids.cash,
          reverse ? ids.cash : ids[bank],
        );
        const cash = dialog.getByRole('textbox', { name: 'Bargeld Muster: Status', exact: true });
        await expect(cash).toHaveValue('Bestätigt');
        await expect(cash).toHaveAttribute('readonly', '');
        const status = dialog.getByRole('button', {
          name: `${bankName}: Status Vorgemerkt`,
          exact: true,
        });
        await expect(status).toBeEnabled();
        if (confirm) await status.click();
        const saved = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === '/api/bookings' &&
            response.request().method() === 'POST',
        );
        await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
        const response = await saved;
        expect(response.status()).toBe(201);
        const result = (await response.json()) as {
          groupId: string;
          transferId: string;
          bookings: {
            id: string;
            accountId: string;
            status: string;
            amountCents: number;
            transferId: string;
            splits: { amountCents: number }[];
          }[];
        };
        await expect(dialog).toBeHidden();
        expect(result.bookings).toHaveLength(2);
        expect(result.bookings.find((row) => row.accountId === ids.cash)).toMatchObject({
          amountCents: reverse ? 12345 : -12345,
          status: 'confirmed',
          transferId: result.transferId,
          splits: [{ amountCents: reverse ? 12345 : -12345 }],
        });
        expect(result.bookings.find((row) => row.accountId === ids[bank])).toMatchObject({
          amountCents: reverse ? -12345 : 12345,
          status: confirm ? 'confirmed' : 'pending',
          transferId: result.transferId,
          splits: [{ amountCents: reverse ? -12345 : 12345 }],
        });
        const current = await read(page);
        expect(current.accounts.find((row) => row.id === ids.cash)).toMatchObject({
          balanceCents: reverse ? 62345 : 37655,
          clearedCents: reverse ? 62345 : 37655,
        });
        expect(current.accounts.find((row) => row.id === ids[bank])).toMatchObject({
          balanceCents: reverse ? 87655 : 112345,
          clearedCents: confirm ? (reverse ? 87655 : 112345) : 100000,
        });
        expect(current.accounts.reduce((sum, row) => sum + row.balanceCents, 0)).toBe(250000);
        const undone = await page.request.post('/api/undo', {
          headers: { origin: isolatedLedger.origin },
          data: { groupId: result.groupId },
        });
        expect(undone.status()).toBe(200);
        const restored = await read(page);
        expect(restored.accounts.find((row) => row.id === ids.cash)).toMatchObject({
          balanceCents: 50000,
          clearedCents: 50000,
        });
        expect(restored.accounts.find((row) => row.id === ids[bank])).toMatchObject({
          balanceCents: 100000,
          clearedCents: 100000,
        });
      }
  }
  expect(patches).toEqual([]);
});

const resolvedTheme = (page: Page) =>
  page.evaluate(() => {
    const selected = document.documentElement.dataset['theme'];
    return selected === 'dark' || selected === 'light'
      ? selected
      : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  });
async function theme(page: Page, value: 'light' | 'dark') {
  if ((await resolvedTheme(page)) === value) return;
  if (page.viewportSize()!.width === 390) {
    const summary = page.locator('.m-profile > summary');
    await summary.click();
    await page
      .locator('.m-profile')
      .getByRole('button', {
        name: value === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
        exact: true,
      })
      .click();
    await summary.click();
  } else
    await page
      .locator('.sidebar-foot')
      .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true })
      .click();
  await expect.poll(() => resolvedTheme(page)).toBe(value);
}
async function capture(page: Page, ids: Accounts, info: TestInfo, label: string) {
  for (const selected of ['light', 'dark'] as const) {
    await page.goto('/');
    await theme(page, selected);
    const dialog = await form(page, ids.cash, ids.checking);
    const bank = dialog.getByRole('button', {
      name: 'Giro Muster: Status Vorgemerkt',
      exact: true,
    });
    const cash = dialog.getByRole('textbox', { name: 'Bargeld Muster: Status', exact: true });
    await expect(cash).toHaveValue('Bestätigt');
    await expect(cash).toHaveAttribute('readonly', '');
    await expect(dialog).toContainText('Bargeld ist sofort bestätigt.');
    const box = await bank.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await bank.focus();
    await page.keyboard.press('Space');
    await expect(
      dialog.getByRole('button', { name: 'Giro Muster: Status Bestätigt', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Space');
    await expect(bank).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
      [],
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.screenshot({
      path: info.outputPath(`cash-bank-${label}-${selected}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    const runtime = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      coarse: matchMedia('(pointer: coarse)').matches,
      deviceScaleFactor: devicePixelRatio,
      rawMaxTouchPoints: navigator.maxTouchPoints,
      theme: document.documentElement.dataset['theme'] ?? 'system',
    }));
    const path = info.outputPath(`cash-bank-${label}-${selected}.json`);
    await writeFile(
      path,
      JSON.stringify(
        {
          engine: page.context().browser()!.browserType().name(),
          project: info.project.name,
          label,
          configuredContext:
            label === 'desktop-layout'
              ? {
                  viewport: { width: 1440, height: 900 },
                  isMobile: false,
                  hasTouch: false,
                  deviceScaleFactor: 1,
                }
              : {
                  viewport: info.project.use.viewport,
                  isMobile: info.project.use.isMobile,
                  hasTouch: info.project.use.hasTouch,
                  deviceScaleFactor: info.project.use.deviceScaleFactor,
                },
          selected,
          resolvedTheme: await resolvedTheme(page),
          actions: 'Playwright click/focus/keyboard; no observed physical touch claim',
          ...runtime,
        },
        null,
        2,
      ),
    );
    await info.attach(`cash-bank-${label}-${selected}`, { path, contentType: 'application/json' });
  }
}
test('cash and bank leg controls stay accessible in true desktop and configured phone light/dark without ledger writes', async ({
  page,
  browser,
  isolatedLedger,
}, info) => {
  const ids = await seed(page, isolatedLedger.origin);
  const before = ledgerSnapshot(isolatedLedger.databasePath);
  const desktop = await browser.newContext({
    baseURL: isolatedLedger.origin,
    storageState: await page.context().storageState(),
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  try {
    const other = await desktop.newPage();
    await other.clock.setFixedTime(new Date(`${DAY}T12:00:00+02:00`));
    await capture(other, ids, info, 'desktop-layout');
  } finally {
    await desktop.close();
  }
  await capture(page, ids, info, 'configured-profile');
  expect(ledgerSnapshot(isolatedLedger.databasePath)).toEqual(before);
});
