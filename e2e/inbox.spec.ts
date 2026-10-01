import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { INBOX_URLS } from '../playwright.config';
import { bootstrapPasskey } from './bootstrap';
import { SAMPLE_NOW } from './sample';
import { expectScreenshot } from './visual';

/**
 * Konten › Posteingang on a server seeded with the sample ledger plus the inbox demo (the items of
 * design/prototype/konten.js, `packages/fixtures/src/inbox-demo.ts`), "today" is 17.09.2026. One
 * server per viewport because the tests decide items. Every test that decides something undoes it
 * through the toast, so the tests do not depend on each other.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;
const row = (text: string | RegExp) => page.locator('tr.rev-row', { hasText: text });
const toast = () => page.locator('.toast.is-open');
const head = () => page.locator('.kinbox .head .aside');
const serious = (violations: Array<{ impact?: string | null }>) =>
  violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

test.beforeAll(async ({ browser }, info) => {
  const mobile = info.project.name === 'mobile';
  const baseURL = mobile ? INBOX_URLS.mobile : INBOX_URLS.desktop;
  const context = await browser.newContext({
    baseURL,
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce',
    colorScheme: 'light',
  });
  page = await context.newPage();
  await page.clock.setFixedTime(new Date(SAMPLE_NOW));
  await bootstrapPasskey(page.request, baseURL, info.outputPath('state.json'));
  // The first read evaluates the rule book (a couple of seconds); the tests start warm.
  expect((await page.request.get('/api/inbox', { timeout: 60_000 })).ok()).toBe(true);
});
test.afterAll(async () => page.context().close());

const openCount = async () => Number(/^(\d+) offen/.exec((await head().textContent()) ?? '')?.[1]);

async function undo() {
  await toast().getByRole('button', { name: 'Rückgängig' }).click();
  await expect(toast()).toContainText('Rückgängig gemacht.');
}

test('groups in the order of the design, letters run on, only Überziehung is Rotstift', async () => {
  await page.goto('/konten/posteingang');
  await expect(page.getByRole('heading', { name: 'Posteingang', level: 2 })).toBeVisible();
  const titles = await page.locator('tr.kgroup .grp-title').allTextContents();
  expect(titles).toEqual([
    'Überziehung',
    'Ohne Kategorie',
    'Mögliche Umbuchung',
    'Erwartete Zahlung weicht ab',
    'Veralteter Wert',
    'Bank-Einwilligung',
    'Regeln',
  ]);
  const counts = await page.locator('tr.kgroup .kgcount').allTextContents();
  expect(counts.slice(0, 6)).toEqual(['4', '4', '1', '3', '1', '1']);
  const total = counts.reduce((n, c) => n + Number(c), 0);
  await expect(head()).toHaveText(
    new RegExp(`^${total} offen · etwa ${Math.max(1, Math.round(total * 0.7))} Minuten$`),
  );
  const letters = await page.locator('tr.rev-row .rev-tri text').allTextContents();
  expect(letters.slice(0, 6)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  expect(letters).toHaveLength(total);
  // Red pencil: the four overspent rows only.
  await expect(page.locator('tr.rev-row.is-urgent')).toHaveCount(4);
  await expect(page.locator('a.btn-alert', { hasText: 'Im Plan decken' })).toHaveCount(4);
  await expect(row('Strom').getByRole('button')).toHaveText(['Ab August übernehmen', 'Ignorieren']);
});

test('the counters show the open items', async () => {
  await page.goto('/konten/posteingang');
  const total = await openCount();
  await expect(
    page
      .getByRole('link', { name: `Posteingang, ${total} offen` })
      .or(page.getByRole('link', { name: new RegExp(`^Posteingang ${total} offen`) })),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Register von Konten' }).getByRole('link', {
      name: new RegExp(`^Posteingang ${total}$`),
    }),
  ).toBeVisible();
  await page.goto('/konten');
  await expect(
    page.getByRole('navigation', { name: 'Register von Konten' }).getByRole('link', {
      name: new RegExp(`^Posteingang ${total}$`),
    }),
  ).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: axe and the baseline of konten-posteingang`, async () => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/konten/posteingang');
    await expect(page.locator('tr.rev-row').first()).toBeVisible();
    expect(serious((await new AxeBuilder({ page }).analyze()).violations)).toEqual([]);
    await expectScreenshot(page, `konten-posteingang-${scheme}.png`, { fullPage: true });
    await page.emulateMedia({ colorScheme: 'light' });
  });
}

test('Übernehmen sets the category, the row leaves, undo brings everything back', async () => {
  await page.goto('/konten/posteingang');
  const before = await openCount();
  await row('Restaurant').getByRole('button', { name: 'Übernehmen' }).click();
  await expect(toast()).toContainText('Restaurant → Essen gehen');
  await expect(row('Restaurant')).toHaveCount(0);
  await expect(head()).toContainText(`${before - 1} offen`);
  await undo();
  await expect(row('Restaurant')).toBeVisible();
  await expect(head()).toContainText(`${before} offen`);
});

test('a decided row slides out before it disappears', async () => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/konten/posteingang');
  // 220 ms are shorter than a polling interval on a busy machine: watch the class in the page.
  await page.evaluate(() => {
    const w = window as unknown as { leftSlid?: boolean };
    w.leftSlid = false;
    new MutationObserver(() => {
      const el = [...document.querySelectorAll('tr.rev-row.is-leaving')].find((r) =>
        r.textContent?.includes('Apotheke'),
      );
      if (el && getComputedStyle(el).transform !== 'none') w.leftSlid = true;
    }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
  });
  await row('Apotheke').getByRole('button', { name: 'Übernehmen' }).click();
  await expect(row('Apotheke')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { leftSlid: boolean }).leftSlid)).toBe(
    true,
  );
  await undo();
  await expect(row('Apotheke')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('"Immer so zuordnen" creates a rule and decides the open bookings of the payee', async () => {
  await page.goto('/konten/posteingang');
  const before = await openCount();
  await row('Supermarkt').getByRole('button', { name: 'Immer so zuordnen' }).click();
  await expect(toast()).toContainText(
    'Regel angelegt: Supermarkt → Lebensmittel. 1 Buchung zugeordnet.',
  );
  await expect(row('Supermarkt')).toHaveCount(0);
  await expect(head()).toContainText(`${before - 1} offen`);
  await undo();
  await expect(row('Supermarkt')).toBeVisible();
});

test('"Alle 4 übernehmen" decides every suggestion in one undo', async () => {
  await page.goto('/konten/posteingang');
  const before = await openCount();
  await page.getByRole('button', { name: 'Alle 4 übernehmen' }).click();
  await expect(toast()).toContainText('4 Buchungen zugeordnet.');
  await expect(page.getByRole('button', { name: 'Übernehmen', exact: true })).toHaveCount(0);
  await expect(head()).toContainText(`${before - 4} offen`);
  await undo();
  await expect(page.getByRole('button', { name: 'Alle 4 übernehmen' })).toBeVisible();
  await expect(head()).toContainText(`${before} offen`);
});

test('a new version of a payment is taken over and undone', async () => {
  await page.goto('/konten/posteingang');
  await row('Strom').getByRole('button', { name: 'Ab August übernehmen' }).click();
  await expect(toast()).toContainText('Strom: 118,00 € als neue Version gespeichert.');
  await expect(row('Strom')).toHaveCount(0);
  await undo();
  await expect(row('Strom')).toBeVisible();
});

test('the stale value takes an amount; a bad amount is refused', async () => {
  await page.goto('/konten/posteingang');
  const input = row('P2P-Kredite').getByLabel('Neuer Wert');
  await input.fill('abc');
  await row('P2P-Kredite').getByRole('button', { name: 'Speichern' }).click();
  await expect(toast()).toContainText('Bitte einen Betrag eingeben');
  await expect(row('P2P-Kredite')).toBeVisible();
  await input.fill('4.300,00');
  await row('P2P-Kredite').getByRole('button', { name: 'Speichern' }).click();
  await expect(toast()).toContainText('P2P-Kredite: Wert 4.300,00 € gespeichert.');
  await expect(row('P2P-Kredite')).toHaveCount(0);
  await undo();
  await expect(row('P2P-Kredite')).toBeVisible();
});

test('a generic item is just closed', async () => {
  await page.goto('/konten/posteingang');
  await row('Einwilligung').getByRole('button', { name: 'Erledigt' }).click();
  await expect(toast()).toContainText('Erledigt, ohne Änderung.');
  await expect(row('Einwilligung')).toHaveCount(0);
  await undo();
  await expect(row('Einwilligung')).toBeVisible();
});
