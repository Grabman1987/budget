import AxeBuilder from '@axe-core/playwright';
import { createBooking, openDatabase } from '@budget/db';
import { expect } from '@playwright/test';
import { seedBasics } from '../packages/db/src/repos/test-helpers';
import { test } from './isolated-ledger';
import { openSpendingGroups } from './income-spending-controls';
import { redesignReportsOn } from './report-frame';
import { withShellControls } from './shell-actions';

test.use({ ledgerToday: '2026-09-17' });

test('1158 keeps both supported comparisons through the legacy alias, reload, themes and privacy', async ({
  page,
  isolatedLedger,
}, info) => {
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    const { ctx } = seedBasics(opened.db);
    for (const [date, categoryId, amountCents] of [
      ['2026-08-10', 'essen', -20_000],
      ['2025-07-31', 'essen', -70_000],
      ['2025-08-01', 'essen', -12_345],
      ['2025-08-31', 'reise', -2_105],
      ['2025-09-01', 'essen', -80_000],
      ['2026-07-10', 'essen', -10_001],
    ] as const) {
      createBooking(
        opened.db,
        { accountId: 'giro', date, amountCents, splits: [{ categoryId, amountCents }] },
        ctx,
      );
    }
  } finally {
    opened.close();
  }
  await page.goto('/reports/vergleich?zeitraum=1M&fokus=synthetic#details');
  if (!(await redesignReportsOn(page))) {
    await expect(page.getByTestId('vg-consumption')).toBeVisible();
    return;
  }
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/reports/ausgaben' &&
      url.searchParams.get('zeitraum') === '1M' &&
      url.searchParams.get('fokus') === 'synthetic' &&
      url.searchParams.get('vergleich') === 'vorjahr' &&
      url.hash === '#details',
  );
  const bookmark = page.url();
  await page.reload();
  await expect(page).toHaveURL(bookmark);
  await openSpendingGroups(page);
  const mode = page.getByRole('combobox', { name: 'Vergleich mit', exact: true });
  await expect(mode).toHaveValue('vorjahr');
  await expect(mode.getByRole('option')).toHaveText(['Vorperiode', 'Vorjahr']);
  const chain = page.getByRole('group', { name: 'Maßkette Veränderung', exact: true });
  for (const amount of ['144,50 €', '76,55 €', '21,05 €', '200,00 €']) {
    await expect(chain).toContainText(amount);
  }
  await expect(page.locator('.r8-spending-trend .r8-scope')).toContainText(
    'Vergleich: 01.08.2025 bis 31.08.2025',
  );
  if (info.project.name === 'desktop') expect(page.viewportSize()?.width).toBe(1440);
  else await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`spending-comparison-${theme}.png`),
      fullPage: true,
    });
  }
  await withShellControls(page, async ({ privacy }) => {
    await privacy.click();
  });
  await expect(chain).toContainText('•••');
  await expect(chain).not.toContainText(/\d[.,]\d{2}\s*€/);
  await withShellControls(page, async ({ privacy }) => {
    await privacy.click();
  });
  await mode.selectOption('vorperiode');
  await expect(mode).toHaveValue('vorperiode');
  await expect(page).toHaveURL((url) => !url.searchParams.has('vergleich'));
  await expect(chain).toContainText('100,01 €');
  await expect(chain).toContainText('99,99 €');
  await expect(chain).toContainText('200,00 €');

  await page.goto(
    '/reports/ausgaben?zeitraum=Alles&vergleich=eigen&vergleichVon=2025-08-01&vergleichBis=2025-08-31#details',
  );
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/reports/ausgaben' &&
      url.search === '?zeitraum=Alles' &&
      url.hash === '#details',
  );
  await openSpendingGroups(page);
  await expect(mode).toHaveValue('vorperiode');
  await expect(
    page.getByText(
      'Für diesen Zeitraum ist kein vollständig abgedeckter, gleich langer Vorzeitraum verfügbar.',
    ),
  ).toBeVisible();
  await expect(chain).toHaveCount(0);
  await expect(page.getByTestId('sa-consumption')).toHaveText('1.944,51 €');
});
