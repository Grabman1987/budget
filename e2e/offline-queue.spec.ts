import { captureSaveControl } from './ledger-helpers';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { pickCategory } from './ledger-helpers';
import { MAIN_URL } from '../playwright.config';

test.use({ serviceWorkers: 'allow' });
test.setTimeout(90_000);
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-02T12:00:00+02:00'));
});

async function prepare(page: Page, info: TestInfo) {
  const response = await page.request.post('/api/accounts', {
    headers: { origin: MAIN_URL },
    data: {
      name: `Queue ${info.project.name} ${info.testId.slice(-10)}`,
      type: 'cash',
      openingDate: '2026-10-01',
      openingBalanceCents: 10000,
    },
  });
  expect(response.status()).toBe(201);
  const { account } = await response.json();
  await page.goto(`/konten/${account.id}?panel=buchung`);
  const panel = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
  await expect(panel.getByLabel('Bezahlt von', { exact: true })).toHaveValue(account.id);
  await pickCategory(panel, 'Essen');
  await panel.getByLabel('Betrag', { exact: true }).fill('12,50');
  await panel.getByLabel('Empfänger', { exact: true }).fill('Queue shop');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  return { accountId: account.id as string, panel };
}
const waiting = (page: Page) =>
  page.getByRole('region', { name: 'Wartet auf Verbindung', exact: true });
async function bookings(page: Page, accountId: string) {
  const response = await page.request.get(`/api/bookings?accountId=${accountId}`);
  expect(response.status()).toBe(200);
  return (await response.json()).items.filter(
    (b: { payeeName: string | null }) => b.payeeName === 'Queue shop',
  );
}

test('offline capture survives reload, edits/deletes locally and sends on reconnect', async ({
  page,
  context,
}, info) => {
  const { accountId, panel } = await prepare(page, info);
  await context.setOffline(true);
  await captureSaveControl(panel).click();
  await expect(panel).toBeHidden();
  await expect(waiting(page)).toContainText('12,50 €');
  expect(await bookings(page, accountId)).toEqual([]);
  await expect(page.locator('.offline-chip')).toHaveText('1 offline gespeichert');
  await expect(page.locator('.tabbar .count, .sheetlist .count')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Budget ist offline' })).toBeVisible();
  await expect(waiting(page)).toContainText('Queue shop');
  await waiting(page).getByRole('button', { name: 'Bearbeiten' }).click();
  const edit = page.getByRole('dialog', { name: 'Wartende Buchung bearbeiten' });
  await edit.getByLabel('Betrag', { exact: true }).fill('13,75');
  await captureSaveControl(edit).click();
  await expect(edit).toBeHidden();
  await expect(waiting(page)).toContainText('13,75 €');
  // Capture also works after a cold offline restart, using form choices without balances.
  await page.getByRole('button', { name: 'Buchung erfassen', exact: true }).click();
  const next = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
  await next.getByLabel('Bezahlt von', { exact: true }).selectOption(accountId);
  await next.getByLabel('Betrag', { exact: true }).fill('2,00');
  await pickCategory(next, 'Essen');
  await captureSaveControl(next).click();
  await expect(waiting(page).locator('li')).toHaveCount(2);
  await waiting(page).locator('li').last().getByRole('button', { name: 'Löschen' }).click();
  await expect(waiting(page).locator('li')).toHaveCount(1);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/queue-${info.project.name}-light.png`,
    fullPage: true,
  });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: `test-results/queue-${info.project.name}-dark.png`,
    fullPage: true,
  });
  await context.setOffline(false);
  await expect(waiting(page)).toHaveCount(0);
  await expect
    .poll(async () =>
      (await bookings(page, accountId)).map((b: { amountCents: number }) => b.amountCents),
    )
    .toEqual([-1375]);
});

test('lost POST response retries the same key with no duplicate booking', async ({
  page,
}, info) => {
  const { accountId, panel } = await prepare(page, info);
  const keys: string[] = [];
  let lose = true;
  let recovered = false;
  let checks = 0;
  await page.route('**/api/bookings/delivery/*', async (route) => {
    checks++;
    if (!recovered) await route.abort('failed');
    else await route.continue();
  });
  await page.route('**/api/bookings', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']!);
    if (lose) {
      lose = false;
      const answer = await route.fetch();
      expect(answer.status()).toBe(201);
      await route.abort('failed');
    } else if (!recovered) await route.abort('failed');
    else await route.continue();
  });
  await captureSaveControl(panel).click();
  await expect(waiting(page)).toContainText('Serverempfang unklar');
  await expect(waiting(page).getByRole('button', { name: 'Bearbeiten' })).toBeDisabled();
  recovered = true;
  await waiting(page).getByRole('button', { name: 'Jetzt senden' }).click();
  await expect(waiting(page)).toHaveCount(0);
  expect(checks).toBeGreaterThanOrEqual(1);
  expect(keys).toHaveLength(1);
  const confirmed = page.getByRole('region', { name: 'Buchungsstatus', exact: true });
  await expect(confirmed).toContainText('Auf dem Server gespeichert');
  await expect(confirmed).toContainText('Buchungs-ID:');
  await expect(confirmed.locator('time')).toHaveAttribute('datetime', /T/);
  expect(
    (await new AxeBuilder({ page }).include('[aria-label="Buchungsstatus"]').analyze()).violations,
  ).toEqual([]);
  await confirmed.screenshot({ path: `test-results/save-status-${info.project.name}-light.png` });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  expect(
    (await new AxeBuilder({ page }).include('[aria-label="Buchungsstatus"]').analyze()).violations,
  ).toEqual([]);
  await confirmed.screenshot({ path: `test-results/save-status-${info.project.name}-dark.png` });
  await page.reload();
  await expect(confirmed).toContainText('Buchungs-ID:');
  expect(new Set(keys).size).toBe(1);
  expect(await bookings(page, accountId)).toHaveLength(1);
});

test('a connection drop before commit retains one intent through reload and confirms recovery', async ({
  page,
}, info) => {
  const { accountId, panel } = await prepare(page, info);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const keys: string[] = [];
  let recovered = false;
  let checks = 0;
  await page.route('**/api/bookings/delivery/*', async (route) => {
    checks++;
    if (!recovered) await route.abort('failed');
    else await route.continue();
  });
  await page.route('**/api/bookings', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']!);
    if (!recovered) {
      await held;
      await route.abort('failed');
    } else await route.continue();
  });
  await captureSaveControl(panel).click();
  try {
    await expect(panel.locator('p[role="status"]')).toHaveText('Wird gesendet…');
    // A repeated save gesture during delivery cannot enqueue another intent.
    await panel.getByLabel('Betrag', { exact: true }).press('Control+Enter');
    expect(keys).toHaveLength(1);
  } finally {
    release();
  }
  await expect(panel).toBeHidden();
  await expect(waiting(page).getByRole('status')).toHaveText('Fehlgeschlagen');
  expect(await bookings(page, accountId)).toEqual([]);
  await page.reload();
  await expect(waiting(page)).toContainText('Serverempfang unklar');
  recovered = true;
  // Reload is itself a supported retry trigger; do not race its automatic sender with a click.
  await page.reload();
  const confirmed = page.getByRole('region', { name: 'Buchungsstatus', exact: true });
  await expect(confirmed).toContainText('Auf dem Server gespeichert');
  await expect(waiting(page)).toHaveCount(0);
  const rows = await bookings(page, accountId);
  expect(rows.map((row: { amountCents: number }) => row.amountCents)).toEqual([-1250]);
  await expect(confirmed).toContainText(rows[0].id);
  await expect(confirmed.locator('time')).toHaveAttribute('datetime', /T/);
  expect(checks).toBeGreaterThanOrEqual(1);
  expect(keys).toHaveLength(2);
  expect(new Set(keys).size).toBe(1);
});

test('closed-account conflict and expired session retain the capture until retry', async ({
  page,
  context,
}, info) => {
  const { accountId, panel } = await prepare(page, info);
  await context.setOffline(true);
  await captureSaveControl(panel).click();
  await expect(waiting(page)).toContainText('Queue shop');
  const close = await page.request.post(`/api/accounts/${accountId}/close`, {
    headers: { origin: MAIN_URL },
    data: { force: true },
  });
  expect(close.status()).toBe(200);
  await context.setOffline(false);
  await expect(waiting(page)).toContainText('Konto ist geschlossen');
  await page.request.post(`/api/accounts/${accountId}/reopen`, {
    headers: { origin: MAIN_URL },
    data: {},
  });
  const cookies = await context.cookies();
  await context.clearCookies();
  await waiting(page).getByRole('button', { name: 'Jetzt senden' }).click();
  await expect(waiting(page)).toContainText('Bitte erneut anmelden');
  // Restore a valid owner session; the real passkey ceremony is covered by auth.spec.ts.
  await context.addCookies(cookies);
  await page.reload();
  await expect.poll(async () => (await bookings(page, accountId)).length).toBe(1);
  await expect(waiting(page)).toHaveCount(0);
});
