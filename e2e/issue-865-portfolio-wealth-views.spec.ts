import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { eur } from '../apps/web/src/ledger/format';
import { redesignReportsOn } from './report-frame';
import { withShellControls } from './shell-actions';
import { sampleTest as test } from './sample';

const VIEWS = [
  ['rendite', '.portfolio-performance-report'],
  ['kennzahlen', '.performance-window'],
  ['klassen', '[aria-labelledby="performance-classes-title"]'],
  ['einzahlungen', '.portfolio-contributions-report'],
  ['verteilung', '.portfolio-allocation-report'],
] as const;

// Keep functional journeys and full theme audits in independent tests with the original budget.
for (const [view, selector] of VIEWS) {
  test(`portfolio views retain source scopes, heatmap, class index history and all period parameters · ${view}`, async ({
    page,
  }) => {
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

    await page
      .getByRole('combobox', { name: 'Darstellung des Vermögensreports' })
      .selectOption(view!);
    await expect(page.locator(selector!)).toBeVisible();
    expect(new URL(page.url()).searchParams.get('zeitraum')).toBe('YTD');
    expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-08');
    if (view === 'rendite') {
      await expect(page.getByTestId('report-frame-result')).toHaveText(
        eur(performance.portfolio.performance.endValueCents),
      );
      await page.getByRole('button', { name: 'Wert €', exact: true }).click();
      await expect(page.getByTestId('portfolio-value-history')).toBeVisible();
      await page.getByText('Portfoliowerte als Tabelle · EUR', { exact: true }).click();
      await expect(
        page
          .locator('details[open]')
          .filter({ hasText: 'Portfoliowerte als Tabelle · EUR' })
          .locator('tbody tr')
          .first(),
      ).toContainText(eur(performance.portfolio.performanceHistory.dailyValues[0].valueCents));
      await expect(
        page
          .locator('details[open]')
          .filter({ hasText: 'Portfoliowerte als Tabelle · EUR' })
          .locator('tbody tr')
          .last(),
      ).toContainText(eur(performance.portfolio.performance.endValueCents));
      await page.getByRole('button', { name: 'Rendite · Index 100', exact: true }).click();
    }
    if (view === 'einzahlungen')
      await expect(page.getByTestId('report-frame-result')).toHaveText(
        eur(contributions.portfolio.contributionHistory.endValueCents),
      );
    if (view === 'kennzahlen') {
      await expect(page.getByTestId('portfolio-gain-components')).toBeVisible();
      await expect(
        page.getByRole('columnheader', { name: '3 J p. a.', exact: true }),
      ).toBeVisible();
      const matrix = page.getByRole('region', {
        name: 'Zeit- und kapitalgewichtete Rendite',
        exact: true,
      });
      if (await matrix.evaluate((element) => element.scrollWidth > element.clientWidth)) {
        await matrix.focus();
        await matrix.press('ArrowRight');
        await expect
          .poll(() => matrix.evaluate((element) => element.scrollLeft))
          .toBeGreaterThan(0);
        await matrix.evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
        });
        const last = await matrix.getByRole('columnheader').last().boundingBox();
        const bounds = await matrix.boundingBox();
        expect(last!.x + last!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
        await matrix.evaluate((element) => {
          element.scrollLeft = 0;
        });
      }
      await expect(
        page.getByRole('heading', { name: 'Nettovermögen pro Tag · alle Konten' }),
      ).toBeVisible();
      await expect(page.getByTestId('metrics-period-gain')).toHaveText(
        eur(performance.portfolio.performance.gainCents, { sign: true }),
      );
      await withShellControls(page, async ({ privacy }) => {
        await privacy.click();
      });
      await expect(
        page.locator('.performance-window > .rscroll .metrics-lead-table td'),
      ).toHaveText(Array(8).fill('•••'));
      await withShellControls(page, async ({ privacy }) => {
        await privacy.click();
      });
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
    await page.reload();
    await expect(
      page.getByRole('combobox', { name: 'Darstellung des Vermögensreports' }),
    ).toHaveValue(view!);
  });

  test(`portfolio views retain both theme audits, reflow and evidence · ${view}`, async ({
    page,
  }, info) => {
    await page.goto(`/reports/vermoegen-schulden?darstellung=${view}&zeitraum=YTD&monat=2026-08`);
    if (!(await redesignReportsOn(page))) {
      await expect(page.locator('.assets-debts-report')).toBeVisible();
      return;
    }
    const ready = {
      rendite: '[data-testid="period-ttwror"]',
      kennzahlen: '[data-testid="portfolio-gain-components"]',
      klassen: '[aria-labelledby="performance-classes-title"]',
      einzahlungen: '[data-testid="contributions-end-value"]',
      verteilung: '[data-testid="sunburst-classes"]',
    }[view];
    await expect(page.locator(ready)).toBeVisible();
    if (view === 'kennzahlen')
      await expect(
        page.locator('.performance-window > .rscroll td').filter({ hasText: 'Lädt …' }),
      ).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
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
          path: `docs/evidence/redesign-reports-20261103-b/${view}-${info.project.name === 'desktop' ? '1440' : '390'}-${theme}.png`,
        });
      else if (view === 'kennzahlen')
        await page.screenshot({
          fullPage: true,
          animations: 'disabled',
          path: info.outputPath(`kennzahlen-${theme}.png`),
        });
    }
  });
}

// Preserve the original cross-view journey independently of the full per-view audits.
test('portfolio view switches preserve the complete sequential period/month/reload journey', async ({
  page,
}) => {
  await page.goto('/reports/vermoegen-schulden?darstellung=rendite&zeitraum=YTD&monat=2026-08');
  if (!(await redesignReportsOn(page))) {
    await expect(page.locator('.assets-debts-report')).toBeVisible();
    return;
  }
  for (const [view, selector] of VIEWS) {
    await page
      .getByRole('combobox', { name: 'Darstellung des Vermögensreports' })
      .selectOption(view);
    await expect(page.locator(selector)).toBeVisible();
    expect(new URL(page.url()).searchParams.get('zeitraum')).toBe('YTD');
    expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-08');
    await page.reload();
    await expect(
      page.getByRole('combobox', { name: 'Darstellung des Vermögensreports' }),
    ).toHaveValue(view);
    await expect(page.locator(selector)).toBeVisible();
  }
});
