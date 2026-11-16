import { sampleTest as test, expect } from './sample';
import { redesignReportsOn, openPaperView } from './report-frame';
import { eur } from '../apps/web/src/ledger/format';
import { bpText } from '../apps/web/src/reports/overview-format';
import { yearWealthChange } from '../packages/domain/src/overview/year-report';
import type { YearReportRead } from '../apps/web/src/reports/overview-api';

test('1118 existing reader endpoints, partial-year comparison and two printed sheets', async ({
  page,
  browserName,
}, info) => {
  await page.goto('/reports/jahresreport');
  if (!(await redesignReportsOn(page))) {
    await expect(page.locator('.ov-sheet')).toHaveCount(2);
    return;
  }
  const response = await page.request.get('/api/overview/year');
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as YearReportRead;
  const summary = page.getByTestId('r5-year-summary');
  const change = summary.getByTestId('r5-year-wealth-change');
  const delta = yearWealthChange(data.report.netWorth);
  if (delta && data.report.netWorth && !data.incomplete?.length) {
    await expect(change).toContainText(eur(data.report.netWorth.startCents));
    await expect(change).toContainText(eur(data.report.netWorth.endCents));
    await expect(change).toContainText(eur(delta.deltaCents));
    if (delta.changeBp !== null) await expect(change).toContainText(bpText(delta.changeBp));
  } else {
    await expect(change).toContainText('nicht ermittelbar');
  }
  await expect(summary.getByTestId('r5-year-comparison')).toContainText(
    `gleiche ${data.report.months.length} Monate`,
  );
  if (!data.report.previousTotals)
    await expect(summary.getByTestId('r5-year-comparison')).toContainText('nicht ermittelbar');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    await expect(change).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  for (const year of [data.report.year, 2025]) {
    await page.getByRole('button', { name: String(year), exact: true }).click();
    await expect(summary.locator('.period-paper-footer').first()).toContainText(String(year));
    await page.setViewportSize({ width: 749, height: 1050 });
    await page.emulateMedia({ media: 'print' });
    const papers = summary.getByRole('article');
    await expect(papers).toHaveCount(2);
    for (const paper of await papers.all()) {
      const size = await paper.evaluate((el) => ({
        scroll: el.scrollHeight,
        client: el.clientHeight,
      }));
      expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
    }
    if (browserName === 'chromium' && info.project.name === 'desktop') {
      const pdf = await page.pdf({ preferCSSPageSize: true });
      expect(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).toHaveLength(2);
    }
    await page.emulateMedia({ media: 'screen' });
  }
  await openPaperView(page);
  await expect(page.locator('.ov-sheets').getByTestId('r5-year-wealth-change')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  for (const sheet of await page.locator('.ov-sheet').all()) {
    const size = await sheet.evaluate((el) => ({
      scroll: el.scrollHeight,
      client: el.clientHeight,
    }));
    expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
  }
  if (browserName === 'chromium' && info.project.name === 'desktop') {
    const pdf = await page.pdf({ preferCSSPageSize: true });
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).toHaveLength(2);
  }
});

test('1118 missing and estimated wealth are explicit, zero start keeps the euro change', async ({
  page,
}) => {
  await page.goto('/reports/jahresreport');
  if (!(await redesignReportsOn(page))) return;
  const response = await page.request.get('/api/overview/year');
  const source = (await response.json()) as YearReportRead;
  for (const mode of ['missing', 'estimated', 'zero', 'negative'] as const) {
    await page.route('**/api/overview/year*', async (route) => {
      const data = structuredClone(source);
      data.incomplete =
        mode === 'estimated'
          ? [
              {
                securityId: 'synthetic-security',
                quality: 'estimated',
                from: '2026-01-01',
                to: '2026-08-31',
              },
            ]
          : [];
      data.report.netWorth =
        mode === 'missing'
          ? null
          : {
              startCents: mode === 'negative' ? -10_000 : 0,
              endCents: 2_501,
              ownCents: mode === 'negative' ? 12_501 : 2_501,
              marketCents: 0,
              months: [],
            };
      await route.fulfill({ json: data });
    });
    await page.reload();
    const change = page.getByTestId('r5-year-summary').getByTestId('r5-year-wealth-change');
    if (mode === 'missing' || mode === 'estimated') {
      await expect(change).toContainText('nicht ermittelbar');
      await expect(change).toContainText('Bewertung ist unvollständig');
    } else if (mode === 'zero') {
      await expect(change).toContainText(eur(2_501));
      await expect(change).toContainText('nicht ermittelbar (Anfangsvermögen null)');
    } else {
      await expect(change).toContainText(eur(12_501));
      await expect(change).toContainText('125,0 %');
    }
    await page.unroute('**/api/overview/year*');
  }
});

test('1118 comparison shows literal deltas, percentage points and an unavailable zero basis', async ({
  page,
  browserName,
}, info) => {
  await page.goto('/reports/jahresreport');
  if (!(await redesignReportsOn(page))) return;
  const source = (await (await page.request.get('/api/overview/year')).json()) as YearReportRead;
  await page.route('**/api/overview/year*', async (route) => {
    const data = structuredClone(source);
    data.report.totals = {
      incomeCents: 200_000,
      consumptionCents: 100_000,
      capitalCents: 501,
      refundCents: 0,
      futureCents: 0,
      savingsRateBp: 5_000,
    };
    data.report.previousTotals = {
      incomeCents: 100_000,
      consumptionCents: 75_000,
      capitalCents: 0,
      refundCents: 0,
      futureCents: 0,
      savingsRateBp: 2_500,
    };
    await route.fulfill({ json: data });
  });
  await page.reload();
  const comparison = page.getByTestId('r5-year-comparison');
  for (const [label, expected] of [
    ['Einnahmen', `${eur(100_000)} · 100,0 %`],
    ['Konsum', `${eur(25_000)} · 33,3 %`],
    ['Gespart', `${eur(75_000)} · 300,0 %`],
    ['Kapitalerträge', `${eur(501)} · nicht ermittelbar (Vorjahreswert null)`],
    ['Sparquote', '25,0 Prozentpunkte'],
  ]) {
    await expect(
      comparison.locator('dl > div').filter({ has: page.getByText(label!, { exact: true }) }),
    ).toContainText(expected!);
  }
  await page.emulateMedia({ media: 'print' });
  for (const paper of await page.locator('.period-paper').all()) {
    const size = await paper.evaluate((el) => ({
      scroll: el.scrollHeight,
      client: el.clientHeight,
    }));
    expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
  }
  if (browserName === 'chromium' && info.project.name === 'desktop') {
    const pdf = await page.pdf({ preferCSSPageSize: true });
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).toHaveLength(2);
  }
});
