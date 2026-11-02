import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
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

async function expectReadableSupport(page: Page, tiles: Locator) {
  const viewport = page.viewportSize()!;
  for (const tile of await tiles.all()) {
    await tile.evaluate((element) =>
      element.scrollIntoView({ block: 'center', inline: 'nearest' }),
    );
    await expect(tile).toBeVisible();
    const box = (await tile.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    const label = tile.getByRole('heading', { level: 2 });
    const figure = tile.locator('.heute-answer-value').first();
    const info = tile.locator(':scope > .heute-info');
    const parts = [];
    for (const target of [label, figure, info]) {
      await expect(target).toBeVisible();
      const part = (await target.boundingBox())!;
      expect(part.width).toBeGreaterThan(0);
      expect(part.height).toBeGreaterThan(0);
      expect(part.x).toBeGreaterThanOrEqual(box.x);
      expect(part.x + part.width).toBeLessThanOrEqual(box.x + box.width);
      expect(part.y).toBeGreaterThanOrEqual(box.y);
      expect(part.y + part.height).toBeLessThanOrEqual(box.y + box.height);
      expect(part.y).toBeGreaterThanOrEqual(0);
      expect(part.y + part.height).toBeLessThanOrEqual(viewport.height);
      parts.push(part);
    }
    const controls = await page
      .locator('.tabbar:visible, .fab:visible, .topbar:visible, .m-head:visible')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const b = element.getBoundingClientRect();
          return { x: b.x, y: b.y, width: b.width, height: b.height };
        }),
      );
    const separated = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
    ) =>
      a.x + a.width <= b.x ||
      b.x + b.width <= a.x ||
      a.y + a.height <= b.y ||
      b.y + b.height <= a.y;
    for (let index = 0; index < parts.length; index++) {
      for (const control of controls) expect(separated(parts[index]!, control)).toBe(true);
      for (const other of parts.slice(index + 1))
        expect(separated(parts[index]!, other)).toBe(true);
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

test.beforeEach(async ({ page }) => {
  // The "Mehr zum Monat" fold is closed on the phone by default.
  await page.addInitScript(() => localStorage.setItem('budget-heute-more-phone', '1'));
});

const redesign = process.env['VITE_BUDGET_REDESIGN'] === '1';

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
    redesign ? 'Verfügbar im Budget' : 'Frei bis Gehalt',
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
    const inspector = page.locator('.month-statement .insp-total').filter({ hasText: 'Verfügbar' });
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
  const primary = redesign
    ? page.locator('.heute-priorities .heute-lead, .heute-priorities .heute-attention')
    : tiles;
  const bottoms = await primary.evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().bottom),
  );
  expect(Math.max(...bottoms), 'the last primary section ends below 844 px').toBeLessThanOrEqual(
    844,
  );
  if (redesign) await expectReadableSupport(page, tiles);
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
      const primary = redesign
        ? page.locator(
            viewport.height < 844
              ? '.heute-priorities .heute-lead, .heute-priorities .attention-row:first-of-type'
              : '.heute-priorities .heute-lead, .heute-priorities .heute-attention',
          )
        : tiles;
      for (const box of await primary.evaluateAll((els) =>
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
      if (redesign) await expectReadableSupport(page, tiles);
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
