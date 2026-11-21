import AxeBuilder from '@axe-core/playwright';
import { createBooking, openDatabase } from '@budget/db';
import { expect } from '@playwright/test';
import { seedBasics } from '../packages/db/src/repos/test-helpers';
import { test } from './isolated-ledger';
import { openSpendingGroups } from './income-spending-controls';
import { redesignReportsOn } from './report-frame';
import { withShellControls } from './shell-actions';

test.use({ ledgerToday: '2026-09-17' });

test('1158 compares exact dates at literal cents through aliases, reload, themes and privacy', async ({
  page,
  isolatedLedger,
}, info) => {
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    const { ctx } = seedBasics(opened.db);
    for (const [date, categoryId, amountCents] of [
      ['2026-08-10', 'essen', -20_000],
      ['2025-03-02', 'essen', -70_000],
      ['2025-03-03', 'essen', -12_345],
      ['2025-03-08', 'reise', -2_105],
      ['2025-03-09', 'essen', -80_000],
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
  expect(new URL(page.url()).pathname).toBe('/reports/ausgaben');
  expect(new URL(page.url()).searchParams.get('fokus')).toBe('synthetic');
  expect(new URL(page.url()).hash).toBe('#details');
  await openSpendingGroups(page);
  await page.getByRole('combobox', { name: 'Vergleich mit', exact: true }).selectOption('eigen');
  const from = page.getByLabel('Vergleich von', { exact: true });
  const to = page.getByLabel('Vergleich bis', { exact: true });
  const submit = page.getByRole('button', { name: 'Vergleich übernehmen', exact: true });
  await from.fill('2025-03-08');
  await to.fill('2025-03-03');
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('gültigen Vergleichszeitraum');
  expect(new URL(page.url()).searchParams.get('vergleich')).toBe('vorjahr');
  await from.fill('2025-03-03');
  await to.fill('2025-03-08');
  await submit.click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('vergleich') === 'eigen' &&
      url.searchParams.get('vergleichVon') === '2025-03-03' &&
      url.searchParams.get('vergleichBis') === '2025-03-08',
  );
  const bookmark = page.url();
  await page.reload();
  await expect(page).toHaveURL(bookmark);
  await openSpendingGroups(page);
  await expect(from).toHaveValue('2025-03-03');
  await expect(to).toHaveValue('2025-03-08');
  const chain = page.getByRole('group', { name: 'Maßkette Veränderung', exact: true });
  for (const amount of ['144,50 €', '76,55 €', '21,05 €', '200,00 €']) {
    await expect(chain).toContainText(amount);
  }
  await expect(page.locator('.r8-spending-trend .r8-scope')).toContainText(
    'Vergleich: 03.03.2025 bis 08.03.2025',
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
  await from.fill('2023-09-30');
  await to.fill('2023-10-01');
  await submit.click();
  await expect(
    page.getByText(
      'Für den eigenen Vergleichszeitraum sind keine vollständig abgedeckten Buchungsdaten verfügbar.',
    ),
  ).toBeVisible();
  await expect(chain).toHaveCount(0);
  await expect(page.getByTestId('sa-consumption')).toHaveText('200,00 €');
});
