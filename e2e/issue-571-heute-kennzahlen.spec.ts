import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { Heute } from '../apps/web/src/heute/api';
import { expect as baseExpect, sampleTest as test } from './sample';

/**
 * #571: Heute shows three Kennzahlen (Zu verteilen · Verfügbar im Budget · Nettovermögen), each with
 * value, bar and one context line (at most 40 characters). "Bis Gehalt" replaces the middle one by
 * "Frei bis Gehalt". Every value is the figure that Plan, the Plan inspector and Vermögen show.
 * Sample server, "today" is 17.09.2026.
 */
const expect = baseExpect.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 90_000 });

const EVIDENCE = 'docs/evidence/issue-571-heute-kennzahlen';
const value = (page: Page, kennzahl: string) =>
  page.locator(`[data-kennzahl="${kennzahl}"]`).first();

test.beforeEach(async ({ page }) => {
  // The "Mehr zum Monat" fold is closed on the phone by default.
  await page.addInitScript(() => localStorage.setItem('budget-heute-more-phone', '1'));
});

test('three Kennzahlen with the names of the owner decision; Bis Gehalt renames the middle one', async ({
  page,
}) => {
  await page.goto('/?period=month');
  const grid = page.getByTestId('heute-kennzahlen');
  await expect(grid.getByRole('heading', { level: 2 })).toHaveText([
    'Zu verteilen',
    'Verfügbar im Budget',
    'Nettovermögen',
  ]);
  await page.getByRole('button', { name: 'Bis Gehalt', exact: true }).click();
  await expect(grid.getByRole('heading', { level: 2 })).toHaveText([
    'Zu verteilen',
    'Frei bis Gehalt',
    'Nettovermögen',
  ]);
  await page.getByRole('button', { name: 'Monat', exact: true }).click();
  await expect(grid.getByRole('heading', { name: 'Verfügbar im Budget' })).toBeVisible();
});

test('each value equals the same figure on Plan, the Plan inspector and Vermögen', async ({
  page,
  isMobile,
}) => {
  await page.goto('/?period=month');
  const zuVerteilen = (await value(page, 'zu-verteilen').textContent())!.trim();
  const verfuegbar = (await value(page, 'verfuegbar').textContent())!.trim();
  const netto = (await value(page, 'nettovermoegen').textContent())!.trim();
  for (const text of [zuVerteilen, verfuegbar, netto])
    expect(text).toMatch(/^[−-]?[\d.]+,\d{2} €$/);

  await page.goto('/plan/monat?monat=2026-09');
  await expect(page.getByTestId('to-be-assigned')).toHaveText(zuVerteilen);
  if (!isMobile) {
    const inspector = page.locator('.insp-total').filter({ hasText: 'Verfügbar in Envelopes' });
    await expect(inspector.locator('dd')).toHaveText(verfuegbar);
  }

  await page.goto('/vermoegen/nettovermoegen');
  await expect(page.getByTestId('nw-figure')).toHaveText(netto);
});

test('Frei bis Gehalt is the existing lead figure of the API', async ({ page }) => {
  const response = await page.request.get('/api/heute?period=payday&month=2026-09');
  expect(response.ok()).toBe(true);
  const heute = (await response.json()) as Heute;
  await page.goto('/?period=payday');
  const lead = page.getByTestId('heute-lead-value');
  await expect(lead).toBeVisible();
  const cents = heute.lead.freeCents;
  const expected = `${cents < 0 ? '−' : ''}${new Intl.NumberFormat('de-AT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100)} €`;
  await expect(lead).toHaveText(expected);
});

test('value, bar and one context line of at most 40 characters per Kennzahl', async ({
  page,
  isMobile,
}) => {
  await page.goto('/?period=month');
  const grid = page.getByTestId('heute-kennzahlen');
  await expect(value(page, 'nettovermoegen')).toBeVisible();
  const tiles = grid.locator('.heute-kennzahl');
  await expect(tiles).toHaveCount(3);
  const lines = await grid.locator('.heute-kennzahl-line').allTextContents();
  expect(lines).toHaveLength(3);
  for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(40);
  // The phone shows a compact list: the bars and lines come back behind the info buttons.
  if (!isMobile) await expect(grid.getByRole('img')).toHaveCount(3);
});

test('the derivation sits behind the info button', async ({ page }) => {
  await page.goto('/');
  const info = page.getByRole('button', { name: 'Herleitung Zu verteilen', exact: true });
  await expect(info).toHaveAttribute('aria-expanded', 'false');
  await info.click();
  await expect(info).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText(/Dieselbe Zahl wie im Plan/)).toBeVisible();
  await info.click();
  await expect(page.getByText(/Dieselbe Zahl wie im Plan/)).toHaveCount(0);
});

test('phone list: the three Kennzahlen (the section "Monat im Blick") end inside the first 390×844 screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(value(page, 'nettovermoegen')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const tiles = page.getByTestId('heute-kennzahlen').locator('.heute-kennzahl');
  await expect(tiles).toHaveCount(3);
  const bottoms = await tiles.evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().bottom),
  );
  expect(Math.max(...bottoms), 'the last Kennzahl ends below 844 px').toBeLessThanOrEqual(844);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    test('first viewport shows Titelblatt and the three Kennzahlen; Axe, no scrollbar, touch targets', async ({
      page,
      isMobile,
    }, info) => {
      await page.goto('/');
      const head = page.locator('header.titleblock-heute');
      await expect(head).toBeVisible();
      await expect(value(page, 'nettovermoegen')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const viewport = page.viewportSize()!;
      const tiles = page.getByTestId('heute-kennzahlen').locator('.heute-kennzahl');
      for (const box of await tiles.evaluateAll((els) =>
        els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect),
      )) {
        expect(box.bottom, 'a Kennzahl starts below the first screen').toBeLessThanOrEqual(
          viewport.height,
        );
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      if (isMobile) {
        for (const selector of ['.heute-kennzahl .heute-info', '.heute-kennzahl a']) {
          const sizes = await page.locator(selector).evaluateAll((els) =>
            els.map((e) => ({
              w: e.getBoundingClientRect().width,
              h: e.getBoundingClientRect().height,
            })),
          );
          for (const s of sizes) {
            expect(s.h, selector).toBeGreaterThanOrEqual(44);
            expect(s.w, selector).toBeGreaterThanOrEqual(44);
          }
        }
      }
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
      // Evidence (synthetic data): desktop light and phone dark.
      if ((colorScheme === 'light') === !isMobile) {
        await page.screenshot({
          path: `${EVIDENCE}/heute-${isMobile ? 'phone' : 'desktop'}-${colorScheme}.png`,
        });
      }
      await page.screenshot({ path: info.outputPath(`heute-${colorScheme}.png`) });
    });
  });
}
