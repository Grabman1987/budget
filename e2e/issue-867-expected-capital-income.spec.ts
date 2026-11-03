import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { test } from './isolated-ledger';
import { redesignReportsOn } from './report-frame';
import { withShellControls } from './shell-actions';

test.use({ ledgerToday: '2026-12-31' });

test('867 expected capital income uses saved future schedules, separate currencies, retry and source links', async ({
  page,
  baseURL,
}, info) => {
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, {
      headers: { origin: baseURL! },
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Synthetic capital account',
    type: 'checking',
    currency: 'EUR',
    openingDate: '2026-12-31',
  });
  const { account: foreign } = await post('/accounts', {
    name: 'Synthetic foreign capital account',
    type: 'checking',
    currency: 'USD',
    onBudget: false,
    openingDate: '2026-12-31',
  });
  for (const [name, incomeTypeId, accountId, amountCents, currency, endDate] of [
    ['Synthetic planned dividend', 'income-capital', account.id, 1234, 'EUR', '2027-03-31'],
    ['Synthetic planned interest', 'income-capital', foreign.id, 500, 'USD', '2027-01-31'],
    ['Synthetic salary excluded', 'income-salary', account.id, 900000, 'EUR', '2027-03-31'],
  ] as const)
    await post('/expected', {
      name,
      kind: 'inflow',
      accountId,
      incomeTypeId,
      amountCents,
      currency,
      rhythm: 'monthly',
      dueDay: 15,
      dateShift: 'none',
      startDate: '2027-01-01',
      validFrom: '2027-01-01',
      endDate,
    });
  let unavailable = true;
  await page.route('**/api/expected/occurrences?*', (route) =>
    unavailable ? route.fulfill({ status: 503, json: { error: 'unavailable' } }) : route.continue(),
  );
  await page.goto('/reports/psteuern?darstellung=ertraege');
  if (!(await redesignReportsOn(page))) {
    await expect(
      page.getByRole('heading', { name: 'Kosten, Steuern, Erträge', exact: true }),
    ).toBeVisible();
    return;
  }
  const section = page.getByRole('region', { name: 'Erwartet · nächste 12 Monate', exact: true });
  await expect(section.getByRole('alert')).toContainText('konnten nicht geladen werden');
  await expect(page.getByTestId('portfolio-expected-total-EUR')).toHaveCount(0);
  unavailable = false;
  await section.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  await expect(page.getByTestId('portfolio-expected-total-EUR')).toHaveText('Geplant · 37,02 €');
  await expect(page.getByTestId('portfolio-expected-total-USD')).toHaveText('Geplant · 5,00 USD');
  await expect(page.getByTestId('portfolio-expected-chart-EUR')).toBeVisible();
  await section.getByText('Geplante Zahlungstermine · EUR', { exact: true }).click();
  const table = page.getByTestId('portfolio-expected-table-EUR');
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await expect(table.locator('tbody tr')).toContainText(['15.01.2027', '15.02.2027', '15.03.2027']);
  await expect(section).not.toContainText('Synthetic salary excluded');
  await withShellControls(page, async ({ privacy }) => {
    await privacy.click();
  });
  await expect(page.getByTestId('portfolio-expected-total-EUR')).toHaveText('Geplant · ••• €');
  await expect(table.locator('tbody td.n')).toHaveText(['••• €', '••• €', '••• €']);
  await withShellControls(page, async ({ privacy }) => {
    await privacy.click();
  });
  await table.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/plan\/erwartet\//);
  await page.goBack();
  await expect(page).toHaveURL(/darstellung=ertraege/);
  await page.reload();
  await expect(page.getByTestId('portfolio-expected-total-EUR')).toHaveText('Geplant · 37,02 €');
  mkdirSync('docs/evidence/redesign-reports-20261103-b', { recursive: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
      window.scrollTo(0, 0);
    }, theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      fullPage: true,
      animations: 'disabled',
      path: `docs/evidence/redesign-reports-20261103-b/ertraege-erwartet-${info.project.name === 'desktop' ? '1440' : '390'}-${theme}.png`,
    });
  }
});
