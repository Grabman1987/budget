import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { eur } from '../apps/web/src/ledger/format';
import { redesignReportsOn } from './report-frame';
import { sampleTest as test } from './sample';

test('portfolio views retain source scopes, heatmap, class index history and all period parameters', async ({
  page,
}, info) => {
  await page.goto('/reports/vermoegen-schulden?darstellung=rendite&zeitraum=YTD&monat=2026-08');
  if (!(await redesignReportsOn(page))) {
    await expect(page.locator('.assets-debts-report')).toBeVisible();
    return;
  }
  const performance = await (
    await page.request.get(
      '/api/portfolio?period=YTD&view=securities&history=performance&provenance=valuation-v1',
    )
  ).json();
  const contributions = await (
    await page.request.get('/api/portfolio?period=YTD&view=securities&history=contributions')
  ).json();
  mkdirSync('docs/evidence/redesign-reports-20261103-b', { recursive: true });
  for (const [view, selector] of [
    ['rendite', '.portfolio-performance-report'],
    ['kennzahlen', '.performance-window'],
    ['klassen', '[aria-labelledby="performance-classes-title"]'],
    ['einzahlungen', '.portfolio-contributions-report'],
    ['verteilung', '.portfolio-allocation-report'],
  ]) {
    await page
      .getByRole('combobox', { name: 'Darstellung des Vermögensreports' })
      .selectOption(view!);
    await expect(page.locator(selector!)).toBeVisible();
    expect(new URL(page.url()).searchParams.get('zeitraum')).toBe('YTD');
    expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-08');
    if (view === 'rendite')
      await expect(page.getByTestId('report-frame-result')).toHaveText(
        eur(performance.portfolio.performance.endValueCents),
      );
    if (view === 'einzahlungen')
      await expect(page.getByTestId('report-frame-result')).toHaveText(
        eur(contributions.portfolio.contributionHistory.endValueCents),
      );
    if (view === 'kennzahlen') {
      await page
        .getByText('Kennzahlen, Zahlungsströme und Bewertungsquellen im Detail', { exact: true })
        .click();
      await expect(page.locator('.performance-heatmap')).toBeVisible();
      await page.locator('.portfolio-flow-table > summary').click();
      await expect(page.locator('.portfolio-flow-table table')).toBeVisible();
      await page.locator('.portfolio-flow-table > summary').click();
      await page
        .getByText('Kennzahlen, Zahlungsströme und Bewertungsquellen im Detail', { exact: true })
        .click();
    }
    if (view === 'klassen') {
      await page.getByText('Monatliche Klassenverläufe und Werte', { exact: true }).click();
      await page.getByText('Klassenverläufe als Tabelle', { exact: true }).click();
      await expect(page.getByTestId('portfolio-class-history-table')).toBeVisible();
      await page.getByText('Monatliche Klassenverläufe und Werte', { exact: true }).click();
    }
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
          path: `docs/evidence/redesign-reports-20261103-b/${view}-${info.project.name === 'desktop' ? '1440' : '390'}-${theme}.png`,
        });
    }
    await page.reload();
    await expect(
      page.getByRole('combobox', { name: 'Darstellung des Vermögensreports' }),
    ).toHaveValue(view!);
  }
});
