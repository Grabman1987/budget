import { sampleTest as test, expect } from './sample';
import AxeBuilder from '@axe-core/playwright';
import { retainExplorerReaders } from './explorer-controls';

test('report periods persist through the catalog and reload', async ({ page }) => {
  await page.goto('/reports/ausgaben');
  await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
  const period = page.getByRole('group', { name: 'Zeitraum', exact: true });
  await period.getByRole('button', { name: '3M', exact: true }).click();
  await expect(page).toHaveURL(/zeitraum=3M/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('budget.reports.period')))
    .toBe('3M');

  await page.getByRole('link', { name: 'Reports', exact: true }).last().click();
  await page.locator('.report-hub-list > li > a[href="/reports/sparquote"]').click();
  await expect(page).toHaveURL(/\/reports\/sparquote\?.*zeitraum=3M/);
  await expect(period.getByRole('button', { name: '3M', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await expect(period.getByRole('button', { name: '3M', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('explicit links override the device period and fixed reports keep their boundaries', async ({
  page,
}, info) => {
  await page.goto('/reports/ausgaben?zeitraum=3M');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('budget.reports.period')))
    .toBe('3M');
  await page.goto('/reports/pdepots?zeitraum=2026-01..2026-03');
  await expect(page).toHaveURL(/zeitraum=2026-01\.\.2026-03/);
  await expect(page.getByText('Jänner 2026 – März 2026', { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('budget.reports.period')))
    .toBe('2026-01..2026-03');
  await page.screenshot({ path: info.outputPath('remembered-period.png') });

  for (const id of ['kontakte', 'jahresreport', 'onepager']) {
    await page.goto(`/reports/${id}`);
    await expect(page.getByTestId('redesign-report-head')).toBeVisible();
    expect(new URL(page.url()).searchParams.has('zeitraum')).toBe(false);
    await expect(page.getByRole('button', { name: 'Zeitraum zurücksetzen' })).toHaveCount(0);
  }
});

test('one reset restores report defaults and preserves unrelated filters', async ({ page }) => {
  const period = page.getByRole('group', { name: 'Zeitraum', exact: true });
  await page.goto('/reports/ausgaben?darstellung=empfaenger&zeitraum=Alles');
  await expect(period.getByRole('button', { name: 'Alles', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Zeitraum zurücksetzen' }).click();
  await expect(period.getByRole('button', { name: '1J', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('budget.reports.period')))
    .toBeNull();
  expect(new URL(page.url()).searchParams.get('darstellung')).toBe('empfaenger');
  await page.goto('/reports/sparquote');
  await expect(period.getByRole('button', { name: 'YTD', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(new URL(page.url()).searchParams.has('zeitraum')).toBe(false);
});

test('free Explorer periods share the preference and survive reload', async ({ page }) => {
  await retainExplorerReaders(page);
  await page.goto('/reports/ausgaben?zeitraum=3M');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('budget.reports.period')))
    .toBe('3M');
  await page.goto('/reports/explorer?darstellung=eigene');
  const period = page.getByRole('group', { name: 'Zeitraum', exact: true });
  await expect(period.getByRole('button', { name: '3M', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await period.getByRole('button', { name: '1J', exact: true }).click();
  await expect(page).toHaveURL(/zeitraum=1J/);
  await page.reload();
  await expect(period.getByRole('button', { name: '1J', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('period changes and reset preserve named Explorer drafts', async ({ page }) => {
  await retainExplorerReaders(page);
  await page.goto('/reports/explorer?darstellung=eigene&zeitraum=1J');
  const period = page.getByRole('group', { name: 'Zeitraum', exact: true });
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  const name = page.getByLabel('Ansicht speichern', { exact: true });
  await name.fill('Synthetic period draft');
  await period.getByRole('button', { name: '3M', exact: true }).click();
  await expect(page).toHaveURL(/zeitraum=3M/);
  await expect(name).toHaveValue('Synthetic period draft');
  await page.getByRole('button', { name: 'Zeitraum zurücksetzen' }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('budget.reports.period')))
    .toBeNull();
  await expect(name).toHaveValue('Synthetic period draft');
  expect(dialogs).toEqual([]);
  await name.fill('');
  await page.goto('/reports/ausgaben');
  expect(new URL(page.url()).searchParams.has('zeitraum')).toBe(false);
});

for (const theme of ['light', 'dark'])
  test(`adopted Explorer preset periods remain intact and accessible (${theme})`, async ({
    page,
  }) => {
    await retainExplorerReaders(page);
    const period = page.getByRole('group', { name: 'Zeitraum', exact: true });
    await page.goto('/reports/explorer?zeitraum=3M');
    await page.getByRole('button', { name: 'Gruppen je Monat', exact: true }).click();
    await expect(period.getByRole('button', { name: '1J', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page).toHaveURL(/zeitraum=1J/);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('budget.reports.period')))
      .toBe('1J');
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect(
      (await new AxeBuilder({ page }).include('[data-testid="redesign-report-head"]').analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
