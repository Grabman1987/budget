import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { formatPercent } from '@budget/domain';
import type { FreedomView } from '../apps/web/src/wealth/freedom-api';
import { redesignReportsOn } from './report-frame';
import { sampleTest as test } from './sample';

test('freedom report retains assumptions, current sources, actuals and projection tables', async ({
  page,
}, info) => {
  await page.goto('/reports/vermoegen-schulden?darstellung=freiheit');
  if (!(await redesignReportsOn(page))) {
    await expect(page.locator('.freedom-report')).toHaveCount(0);
    return;
  }
  const view = (await (await page.request.get('/api/wealth/freedom')).json()) as FreedomView;
  await expect(
    page.getByRole('combobox', { name: 'Darstellung des Vermögensreports' }),
  ).toHaveValue('freiheit');
  await expect(page.getByTestId('report-frame-result')).toHaveText(
    view.progressBp === null ? '—' : formatPercent(view.progressBp),
  );
  await expect(page.getByRole('heading', { name: 'Investiert: Quellkonten' })).toBeVisible();
  const saving = page.getByLabel('Sparrate pro Monat', { exact: true });
  await saving.fill('500');
  await saving.blur();
  await page.getByLabel('Rendite nach Inflation', { exact: true }).selectOption('400');
  await expect(page.getByTestId('freedom-chart')).toBeVisible();
  await expect(page.getByTestId('freedom-done')).not.toHaveText('—');
  await page.getByText('Woher die Jahresausgaben kommen', { exact: true }).click();
  await expect(page.locator('#freedom-expenses table tbody tr')).toHaveCount(view.months.length);
  await page
    .getByText('Ist-Werte als Tabelle · fehlende Bewertungen bleiben Lücken', { exact: true })
    .click();
  await expect(page.getByTestId('freedom-history-table')).toBeVisible();
  await page
    .getByText('Ist-Werte als Tabelle · fehlende Bewertungen bleiben Lücken', { exact: true })
    .click();
  mkdirSync('docs/evidence/redesign-reports-20261103-b', { recursive: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset['theme'] = theme;
      window.scrollTo(0, 0);
    }, theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (info.project.name !== 'webkit-iphone')
      await page.screenshot({
        fullPage: true,
        animations: 'disabled',
        path: `docs/evidence/redesign-reports-20261103-b/freiheit-${info.project.name === 'desktop' ? '1440' : '390'}-${theme}.png`,
      });
  }
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: 'Darstellung des Vermögensreports' }),
  ).toHaveValue('freiheit');
});
