import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expectMatchesReference, type Rect, type RegionCheck } from './reference';
import { sampleTest as test, expect } from './sample';
import { expectScreenshot } from './visual';

/**
 * Vermögen › Nettovermögen on the seeded sample server (17.09.2026): the prototype figure, the
 * Maßkette adding up, the Zeitraum in the URL, a layout comparison with `design/screens` and own
 * baselines at 1440 and 390 px in both themes.
 */
const PATH = '/vermoegen/nettovermoegen';
const NET_WORTH_EUROS = 84_730;

/** "84.730 €" / "−1.234 €" / "+11.110 €" as whole euros. */
const euros = (text: string) => Number(text.replace(/[^\d−-]/g, '').replace('−', '-'));

async function ready(page: Page, path = PATH) {
  await page.goto(path);
  await expect(page.getByTestId('networth-chart')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

async function chain(page: Page) {
  const group = page.getByRole('group', { name: 'Maßkette Nettovermögen im Zeitraum' });
  const values = await group.locator('.ct-val').allTextContents();
  const ops = await group.locator('.ct-op').allTextContents();
  const [start, ownAbs, marketAbs, now] = values.map(euros) as [number, number, number, number];
  // A loss is shown as "− 1.234 €": the operator carries the sign.
  const own = ops[0] === '−' ? -ownAbs : ownAbs;
  const market = ops[1] === '−' ? -marketAbs : marketAbs;
  return { start, own, market, now, ops };
}

test('shows the prototype figure and the chain adds up', async ({ page }) => {
  await ready(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Vermögen' })).toBeVisible();
  await expect(page.getByTestId('nw-figure')).toHaveText('84.730,00 €');
  const { start, own, market, now, ops } = await chain(page);
  expect(ops).toHaveLength(3);
  expect(now).toBe(NET_WORTH_EUROS);
  expect(start + own + market).toBe(now);
  // YTD is the default; the change in the head is the chain's difference.
  await expect(page.getByRole('button', { name: 'YTD' })).toHaveAttribute('aria-pressed', 'true');
  const state = await page.getByTestId('nw-state').textContent();
  expect(state).toContain('seit Jahresbeginn');
  // The head shows the exact change, the chain the balanced euro parts: at most 1 € apart.
  expect(Math.abs(euros(state ?? '') - (now - start))).toBeLessThanOrEqual(1);
  await expect(page.getByText('Anfang Dez 2025')).toBeVisible();
});

test('jetzt equals the net worth on Konten (same function)', async ({ page }) => {
  await page.goto('/konten');
  await expect(page.getByTestId('net-worth')).toHaveText('84.730,00 €');
  await ready(page);
  expect((await chain(page)).now).toBe(NET_WORTH_EUROS);
});

test('Stand shows the day of the newest prices', async ({ page }) => {
  await ready(page);
  await expect(page.locator('.titleblock')).toContainText(/17\.09\.(2026)? · Kurse/);
});

test('"Woraus es besteht": assets by size, debts dashed and subtracted', async ({ page }) => {
  await ready(page);
  const values = await page.locator('.vbars li .vb-val').allTextContents();
  const debts = await page.locator('.vbars li.is-debt .vb-val').allTextContents();
  expect(debts.length).toBeGreaterThanOrEqual(2);
  expect(debts.every((d) => d.startsWith('−'))).toBe(true);
  const assets = values.slice(0, values.length - debts.length).map(euros);
  expect(assets).toEqual([...assets].sort((a, b) => b - a));
  await expect(page.getByText('Gestrichelt: Schulden, werden abgezogen.')).toBeVisible();
  // The parts add up to the net worth (whole euros, so within rounding of the rows).
  const sum = values.map(euros).reduce((a, b) => a + b, 0);
  expect(Math.abs(sum - NET_WORTH_EUROS)).toBeLessThanOrEqual(values.length);
});

test('the Zeitraum switch updates the URL, the figures and travels to Portfolio', async ({
  page,
}) => {
  await ready(page);
  const ytd = await chain(page);
  await page.getByRole('button', { name: '3M' }).click();
  await expect(page).toHaveURL(/zeitraum=3M/);
  await expect(page.getByTestId('nw-state')).toContainText('letzte 3 Monate');
  await expect(page.getByRole('button', { name: '3M' })).toHaveAttribute('aria-pressed', 'true');
  const m3 = await chain(page);
  expect(m3.now).toBe(ytd.now);
  expect(m3.start).not.toBe(ytd.start);
  expect(m3.start + m3.own + m3.market).toBe(m3.now);
  await expect(page.getByTestId('networth-chart')).toContainText('Veränderung je Woche');

  await page
    .getByRole('navigation', { name: 'Register von Vermögen' })
    .getByRole('link', { name: 'Portfolio' })
    .click();
  await expect(page).toHaveURL(/vermoegen\/portfolio\?zeitraum=3M/);
  await expect(page.getByRole('button', { name: '3M' })).toHaveAttribute('aria-pressed', 'true');

  await ready(page, `${PATH}?zeitraum=1J`);
  await expect(page.getByRole('button', { name: '1J' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('nw-state')).toContainText('letzte 12 Monate');
  const year = await chain(page);
  expect(year.start + year.own + year.market).toBe(year.now);
  await ready(page, `${PATH}?zeitraum=Alles`);
  await expect(page.getByTestId('nw-state')).toContainText('seit Okt 2023');
});

test('axe: no serious or critical violations (light and dark)', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await ready(page);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(
      bad.map((v) => v.id),
      scheme,
    ).toEqual([]);
  }
});

// ---------------------------------------------------------------------------------------------
// Layout against design/screens/*/vermoegen-netto.webp and own baselines (Linux rasterisation).
// ---------------------------------------------------------------------------------------------
test.describe('layout', () => {
  test.skip(process.platform !== 'linux', 'font rasterisation differs off Linux');

  const text = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
  const check = (base: RegionCheck): RegionCheck => ({
    blur: 3,
    threshold: 40,
    maxDiff: 0.02,
    ...base,
  });
  const REGISTER_LABELS = text(260, 188, 1160, 26);

  test('desktop: title block and registers, the two columns', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop layout');
    await ready(page);
    const reference = 'desktop/vermoegen-netto.webp';
    await expectMatchesReference(
      page,
      check({
        name: 'netto-head',
        reference,
        region: { x: 260, y: 80, w: 1160, h: 160 },
        // Stand has no time here, and the title is text.
        masks: [text(860, 84, 250, 84), text(290, 96, 300, 60), REGISTER_LABELS],
      }),
    );
    await expectMatchesReference(
      page,
      check({
        name: 'netto-verlauf',
        reference,
        region: { x: 260, y: 262, w: 660, h: 620 },
        // The daily line is the sample's own prices; the state text differs by a euro or two.
        masks: [text(330, 420, 580, 190), text(690, 276, 230, 24)],
      }),
    );
    await expectMatchesReference(
      page,
      check({
        name: 'netto-bestandteile',
        reference,
        region: { x: 940, y: 262, w: 480, h: 370 },
        // The account names and amounts are data; the bars and rules are compared.
        masks: [text(940, 316, 150, 270), text(1300, 316, 100, 270)],
      }),
    );
  });

  test('phone: figure, chart and chain', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone layout');
    await ready(page);
    await expectMatchesReference(
      page,
      check({
        name: 'netto-phone',
        reference: 'mobile/vermoegen-netto.webp',
        // The title strip is taller here (44 px touch targets), so the live page sits lower.
        region: { x: 0, y: 215, w: 390, h: 430 },
        live: { x: 0, y: 232 },
        // Masks (reference coordinates): the daily line, the head row and the "heute" label.
        masks: [text(60, 350, 310, 190), text(10, 218, 370, 32), text(320, 616, 50, 22)],
      }),
    );
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`own baseline, ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await ready(page);
      await expectScreenshot(page, `vermoegen-netto-${scheme}.png`, { fullPage: true });
    });
  }
});
