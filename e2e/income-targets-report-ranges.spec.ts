import AxeBuilder from '@axe-core/playwright';
import { eur } from '../apps/web/src/ledger/format';
import { sampleTest as test, expect } from './sample';

test.describe.configure({ timeout: 90_000 });
test('Plan income estimate, targets and unfunded category navigation', async ({ page }, info) => {
  await page.goto('/plan/monat?monat=2026-09');
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
    await expect(select).toBeVisible();
    await expect(select.locator('option')).toHaveCount(9);
    await select.selectOption('6');
    if (id !== 'explorer') await expect(page).toHaveURL(/zeitraum=2026-03.*2026-08/);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  await page.goto('/reports/peinzahlungen');
  await expect(page.getByTestId('contributions-chart')).toBeVisible();
  await expect(page.getByTestId('report-trend-line')).toHaveCount(0);
  await page.getByLabel('Zeitraum-Schnellauswahl', { exact: true }).selectOption('custom');
  await page.getByLabel('Von', { exact: true }).fill('2026-03');
  await page.getByLabel('Bis', { exact: true }).fill('2026-05');
  await page.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await page.getByLabel('Trendlinie', { exact: true }).check();
  await expect(page.getByTestId('report-trend-line').first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Trendlinie', { exact: true })).toBeChecked();
  await expect(page.getByTestId('contributions-chart')).toBeVisible();
  await expect(page.getByLabel('Von', { exact: true })).toHaveValue('2026-03');
  await expect(page.getByLabel('Bis', { exact: true })).toHaveValue('2026-05');
  const headerFits = await page.locator('.titleblock').evaluate((header) => {
    const cells = [...header.querySelectorAll<HTMLElement>('.tb-cell')];
    return cells.every((cell) => {
      const box = cell.getBoundingClientRect();
      return [...cell.querySelectorAll<HTMLElement>('h1, input, select')].every((node) => {
        const inner = node.getBoundingClientRect();
        return inner.left >= box.left && inner.right <= box.right;
      });
    });
  });
  expect(headerFits).toBe(true);
  if (info.project.name === 'desktop') {
    const row = page.locator('.report-period-control');
    const presets = await row.locator('.seg').first().boundingBox();
    const select = await row.getByLabel('Zeitraum-Schnellauswahl', { exact: true }).boundingBox();
    expect(presets).not.toBeNull();
    expect(select).not.toBeNull();
    expect(Math.abs(presets!.y - select!.y)).toBeLessThan(8);
    expect(select!.x).toBeGreaterThanOrEqual(presets!.x + presets!.width);
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
  await page.getByLabel('Trendlinie', { exact: true }).uncheck();
  await expect(page.getByTestId('report-trend-line')).toHaveCount(0);
});
