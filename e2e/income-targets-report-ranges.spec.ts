import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { eur } from '../apps/web/src/ledger/format';
import { sampleTest as test, expect } from './sample';

test.describe.configure({ timeout: 90_000 });
test('Plan income estimate, targets and unfunded category navigation', async ({ page }, info) => {
  await page.goto('/plan/monat?monat=2026-09');
  await page.locator('#inspector-income > summary').click();
  const card = page.getByTestId('income-targets');
  await expect(card).toBeVisible();
  const response = await page.request.get('/api/budget/2026-09');
  const { incomeTargets: data } = await response.json();
  await expect(card).toContainText('Quelle: Wiederkehrende Zahlungen');
  await expect(card.getByTestId('income-targets-difference')).toHaveText(
    eur(data.differenceCents, { sign: true }),
  );
  const buttons = card
    .getByRole('list', { name: 'Kategorien mit offenen Monatszielen' })
    .getByRole('button');
  await expect(buttons).toHaveCount(data.unfundedCategoryIds.length);
  await buttons.first().focus();
  await page.keyboard.press('Enter');
  // Selecting the category opens it in the inspector; its history link leads to the detail page.
  const inspector = page.getByRole('complementary', { name: 'Plan-Inspektor' });
  await inspector.getByRole('link', { name: 'Verlauf und Buchungen' }).click();
  await expect(page).toHaveURL(/\/plan\/monat\/envelope\//);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goBack();
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`income-targets-${theme}.png`), fullPage: true });
  }
});

/** The 9 ranges live in the popover of the one period control; the explorer shows its select directly. */
const openRange = async (page: Page) => {
  const button = page.getByRole('button', { name: 'Zeitraum wählen' });
  const select = page.getByLabel('Zeitraum-Schnellauswahl', { exact: true });
  await expect(async () => {
    if ((await button.count()) && (await button.getAttribute('aria-expanded')) === 'false')
      await button.click({ timeout: 2000 });
    await expect(select).toBeVisible({ timeout: 1000 });
  }).toPass();
};
test('shared ranges, custom URL reload and optional trend', async ({ page }, info) => {
  for (const id of [
    'ausgaben',
    'empfaenger',
    'kategorien',
    'sparquote',
    'cashflow',
    'vermoegen',
    'peinzahlungen',
    'pdepots',
    'prendite',
    'explorer',
  ]) {
    await page.goto(`/reports/${id}`);
    const select = page.getByLabel('Zeitraum-Schnellauswahl', { exact: true });
    await openRange(page);
    await expect(select).toBeVisible();
    await expect(select.locator('option')).toHaveCount(9);
    await select.selectOption('6');
    if (id !== 'explorer') await expect(page).toHaveURL(/zeitraum=2026-03.*2026-08/);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  await page.goto('/reports/peinzahlungen');
  await expect(page.getByTestId('contributions-chart')).toBeVisible();
  await expect(page.getByTestId('report-trend-line')).toHaveCount(0);
  await openRange(page);
  await page.getByLabel('Zeitraum-Schnellauswahl', { exact: true }).selectOption('custom');
  await page.getByLabel('Von', { exact: true }).fill('2026-03');
  await page.getByLabel('Bis', { exact: true }).fill('2026-05');
  await page.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await openRange(page);
  await page.getByRole('switch', { name: 'Trendlinie' }).click();
  await expect(page.getByTestId('report-trend-line').first()).toBeVisible();
  await page.reload();
  await openRange(page);
  await expect(page.getByRole('switch', { name: 'Trendlinie' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByTestId('contributions-chart')).toBeVisible();
  await expect(page.getByLabel('Von', { exact: true })).toHaveValue('2026-03');
  await expect(page.getByLabel('Bis', { exact: true })).toHaveValue('2026-05');
  await page.keyboard.press('Escape'); // the popover floats over the head by design
  await expect(page.getByRole('heading', { level: 1, name: 'Portfolio-Auswertung' })).toBeVisible();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/reports/pallocation' &&
      url.searchParams.get('darstellung') === 'einzahlungen' &&
      url.searchParams.get('zeitraum') === '2026-03..2026-05',
  );
  await expect(
    page.getByRole('button', { name: 'Einzahlungen und Wert', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('navigation', { name: 'Weitere Berichte' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zeitraum wählen' })).toBeVisible();
  const headerFits = await page.locator('.titleblock').evaluate((header) => {
    const cells = [...header.querySelectorAll<HTMLElement>('.tb-cell')];
    return cells.every((cell) => {
      const box = cell.getBoundingClientRect();
      return [...cell.querySelectorAll<HTMLElement>('h1, input, select')]
        .filter((node) => node.checkVisibility())
        .every((node) => {
          const inner = node.getBoundingClientRect();
          return inner.left >= box.left && inner.right <= box.right;
        });
    });
  });
  expect(headerFits).toBe(true);
  if (info.project.name === 'desktop') {
    const row = page.locator('.report-period-control');
    const presets = await row.locator('.seg').first().boundingBox();
    const range = await row.getByRole('button', { name: 'Zeitraum wählen' }).boundingBox();
    expect(presets).not.toBeNull();
    expect(range).not.toBeNull();
    expect(
      Math.abs(presets!.y + presets!.height / 2 - (range!.y + range!.height / 2)),
    ).toBeLessThan(8);
    expect(range!.x).toBeGreaterThanOrEqual(presets!.x + presets!.width);
  }
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`report-ranges-${theme}.png`), fullPage: true });
  }
  await page.keyboard.press('Escape');
  await openRange(page);
  await page.getByRole('switch', { name: 'Trendlinie' }).click();
  await expect(page.getByTestId('report-trend-line')).toHaveCount(0);
});
