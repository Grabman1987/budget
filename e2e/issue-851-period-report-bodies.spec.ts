import { withShellControls } from './shell-actions';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sampleTest as test, expect } from './sample';
import { redesignReportsOn, openPaperView } from './report-frame';
import { eur } from '../apps/web/src/ledger/format';
import type { OnePagerData } from '../apps/web/src/reports/month-api';
import type { YearReportRead, PeriodComparisonReport } from '../apps/web/src/reports/overview-api';

const folder = 'docs/evidence/redesign-reports-20261103-a';
for (const [name, path, summary] of [
  ['month', '/reports/onepager?monat=2026-08&period=month', 'r5-month-summary'],
  ['year', '/reports/jahresreport', 'r5-year-summary'],
  ['compare', '/reports/vergleich', 'report-calculation'],
] as const) {
  test(`851 ${name}: exact real-reader summary, retained detail, both themes and 320px`, async ({
    page,
  }, info) => {
    if (info.project.name !== 'desktop') await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    if (!(await redesignReportsOn(page))) {
      await expect(page.locator('.titleblock')).toBeVisible();
      await expect(page.getByTestId(summary)).toHaveCount(0);
      return;
    }
    await expect(page.getByTestId(summary)).toBeVisible();
    if (name === 'month') {
      const response = await page.request.get('/api/reports/month/onepager?month=2026-08');
      expect(response.ok()).toBe(true);
      const data = (await response.json()) as OnePagerData;
      await expect(page.getByTestId('r5-month-income')).toHaveText(eur(data.result.earnedCents));
      await expect(page.getByTestId('r5-month-saved')).toHaveText(eur(data.result.savedCents));
      await expect(page.getByTestId('r5-month-pace')).toBeVisible();
      await expect(page.locator('.psheet')).toBeHidden();
    } else if (name === 'year') {
      const response = await page.request.get('/api/overview/year');
      expect(response.ok()).toBe(true);
      const data = (await response.json()) as YearReportRead;
      await expect(page.getByTestId('r5-year-income')).toHaveText(
        eur(data.report.totals.incomeCents),
      );
      await expect(page.getByTestId('r5-year-bars')).toBeVisible();
      await expect(page.getByTestId(summary).getByRole('article')).toHaveCount(2);
    } else {
      const response = await page.request.get('/api/overview/compare?mode=vj');
      expect(response.ok()).toBe(true);
      const data = (await response.json()) as PeriodComparisonReport;
      await expect(page.getByTestId('report-frame-result')).toHaveText(
        eur(data.comparison.chain.currentCents - data.comparison.chain.previousCents, {
          sign: true,
        }),
      );
      await expect(page.locator('.period-comparison-table tbody tr')).toHaveCount(
        Math.min(4, data.comparison.rows.length),
      );
      if (data.comparison.rows.length > 4) {
        await page
          .getByRole('button', {
            name: `Alle ${data.comparison.rows.length} Kategorien anzeigen`,
            exact: true,
          })
          .click();
        await expect(page.locator('.period-comparison-table tbody tr')).toHaveCount(
          data.comparison.rows.length,
        );
        await page
          .getByRole('button', { name: 'Nur größte Änderungen zeigen', exact: true })
          .click();
        await page.evaluate(() => scrollTo(0, 0));
      }
      await expect(page.locator('.period-comparison-table tfoot')).toContainText(
        eur(data.comparison.chain.currentCents),
      );
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (info.project.name !== 'webkit-iphone') {
        mkdirSync(folder, { recursive: true });
        await page.screenshot({
          path: join(folder, `r5-${name}-${info.project.name}-${theme}.png`),
          fullPage: true,
        });
      }
    }
    await withShellControls(page, async ({ privacy }) => {
      await privacy.click();
    });
    await expect(page.getByTestId('report-frame-result')).toHaveText('••• €');
    await withShellControls(page, async ({ privacy }) => {
      await privacy.click();
    });
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (name === 'compare') {
      await page.getByRole('button', { name: 'Werte als Tabelle', exact: true }).click();
      const region = page.getByRole('region', {
        name: 'Zeitraumvergleich als Tabelle, horizontal verschiebbar',
      });
      await region.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    } else {
      await openPaperView(page);
      await expect(page.locator(name === 'month' ? '.psheet' : '.ov-sheet').first()).toBeVisible();
      expect(new URL(page.url()).searchParams.get('darstellung')).toBe('druckblatt');
      await page.reload();
      await expect(page.locator(name === 'month' ? '.psheet' : '.ov-sheet').first()).toBeVisible();
    }
  });
}
test('851 monthly presentation retains the historical finance view and source/month context through Back', async ({
  page,
}) => {
  await page.goto(
    '/reports/onepager?monat=2026-08&period=month&zeitraum=2026-07..2026-08&trend=true#details',
  );
  if (!(await redesignReportsOn(page))) {
    await expect(page.locator('.psheet')).toBeVisible();
    return;
  }
  await expect(page.getByTestId('r5-month-saved')).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Darstellung', exact: true })
    .selectOption('finanzcheck');
  await expect(page.getByTestId('fc-ok-count')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-08');
  expect(new URL(page.url()).searchParams.get('zeitraum')).toBe('2026-07..2026-08');
  await page.goBack();
  await expect(page.getByTestId('r5-month-saved')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#details');
  await page.goto('/reports/onepager?monat=2026-08#ps-b');
  await expect(page.locator('#ps-b')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Darstellung', exact: true })).toHaveValue(
    'druckblatt',
  );
  expect(new URL(page.url()).hash).toBe('#ps-b');
  await page.reload();
  await expect(page.locator('#ps-b')).toBeVisible();
});

test('851 comparison print retains all categories and the full calculation, then restores the screen choices', async ({
  page,
}) => {
  await page.goto('/reports/vergleich');
  if (!(await redesignReportsOn(page))) {
    await expect(page.getByTestId('vg-consumption')).toBeVisible();
    return;
  }
  const response = await page.request.get('/api/overview/compare?mode=vj');
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as PeriodComparisonReport;
  const detail = page.locator('.period-comparison-detail');
  const rows = page.locator('.dv li');
  await expect(detail).not.toHaveAttribute('open');
  await expect(rows).toHaveCount(Math.min(4, data.comparison.rows.length));
  await page.evaluate(() => {
    document.documentElement.dataset['theme'] = 'dark';
  });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.redesign-report-title h1')).toBeVisible();
  await expect(page.locator('.m-head')).toBeHidden();
  await expect(page.getByTestId('report-frame-result')).toBeVisible();
  await expect(page.getByTestId('vg-consumption')).toBeVisible();
  await expect(rows).toHaveCount(data.comparison.rows.length);
  await expect(page.locator('.period-comparison-table tfoot')).toContainText(
    eur(data.comparison.chain.currentCents),
  );
  await expect(page.getByRole('combobox', { name: 'Vergleich', exact: true })).toBeHidden();
  await expect(page.locator('.period-comparison-actions')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await expect(detail).not.toHaveAttribute('open');
  await expect(rows).toHaveCount(Math.min(4, data.comparison.rows.length));
  await detail.locator('summary').click();
  await expect(page.getByTestId('vg-consumption')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(rows).toHaveCount(data.comparison.rows.length);
  await page.emulateMedia({ media: 'screen' });
  await expect(detail).toHaveAttribute('open', '');
});

test('851 summary print preserves one/two readable A4 sheets, source values and light paper', async ({
  page,
  browserName,
}, info) => {
  for (const [name, path, pages, value] of [
    ['month', '/reports/onepager?monat=2026-08', 1, 'r5-month-saved'],
    ['year', '/reports/jahresreport', 2, 'r5-year-income'],
    ['year-full', '/reports/jahresreport', 2, 'r5-year-income'],
  ] as const) {
    await page.goto(path);
    if (!(await redesignReportsOn(page))) {
      await expect(page.locator('.titleblock')).toBeVisible();
      continue;
    }
    if (name === 'year-full') {
      await page.getByRole('button', { name: '2025', exact: true }).click();
      await expect(page.locator('.period-desktop-months tbody tr')).toHaveCount(12);
      await expect(page.locator('.period-paper-footer').first()).toContainText('2025');
    }
    await expect(page.getByTestId(value)).toBeVisible();
    const amount = await page.getByTestId(value).textContent();
    await page.evaluate(() => {
      document.documentElement.dataset['theme'] = 'dark';
    });
    await page.setViewportSize({ width: 749, height: 1050 });
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId(value)).toHaveText(amount!);
    await expect(page.locator('.redesign-report-head')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Offene Aufgaben' })).toBeHidden();
    const papers = page.locator('.period-paper');
    await expect(papers).toHaveCount(pages);
    for (let i = 0; i < pages; i++) {
      const paper = papers.nth(i);
      await expect(paper).toBeVisible();
      const size = await paper.evaluate((el) => ({
        scroll: el.scrollHeight,
        client: el.clientHeight,
        bg: getComputedStyle(el).backgroundColor,
      }));
      expect(size.bg).toBe('rgb(255, 255, 255)');
      expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
      await expect(paper.locator('.period-paper-footer')).toContainText(`${i + 1} / ${pages}`);
      if (info.project.name === 'desktop') {
        mkdirSync(folder, { recursive: true });
        await paper.screenshot({ path: join(folder, `r5-${name}-print-${i + 1}.png`) });
      }
    }
    if (browserName === 'chromium' && info.project.name === 'desktop') {
      const geometry = await papers.first().evaluate((el) => {
        const rows = [];
        for (let node: Element | null = el; node; node = node.parentElement) {
          const r = node.getBoundingClientRect();
          rows.push({
            tag: node.tagName,
            cls: node.className,
            y: r.y,
            h: r.height,
            display: getComputedStyle(node).display,
            margin: getComputedStyle(node).margin,
            padding: getComputedStyle(node).padding,
          });
        }
        return rows;
      });
      const pdf = await page.pdf({
        path: info.outputPath(`${name}-summary.pdf`),
        preferCSSPageSize: true,
        printBackground: true,
      });
      expect(
        pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? [],
        JSON.stringify(geometry),
      ).toHaveLength(pages);
    }
    await page.emulateMedia({ media: 'screen' });
  }
});

test('851 historical finance bookmark keeps its heading through period normalization and reload', async ({
  page,
}) => {
  await page.goto('/reports/finanzcheck?monat=2026-08#fc-matrix');
  const on = await redesignReportsOn(page);
  await expect.poll(() => new URL(page.url()).searchParams.get('period')).toBe('month');
  if (!on) {
    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
    return;
  }
  await expect(page.locator('#fc-matrix')).toBeFocused();
  expect(new URL(page.url()).hash).toBe('#fc-matrix');
  await page.reload();
  await expect(page.locator('#fc-matrix')).toBeFocused();
  expect(new URL(page.url()).hash).toBe('#fc-matrix');
});
