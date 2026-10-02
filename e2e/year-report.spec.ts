import { cents, formatEuro } from '@budget/domain';
import { expect as baseExpect, sampleTest as test } from './sample';
import { inspectReport } from './overview-report';

// The sample server evaluates the rules synchronously (seconds) the first time a report finds the
// stored results stale, and every request waits for it: generous timeouts instead of retries.
const expect = baseExpect.configure({ timeout: 60_000 });
test.describe.configure({ timeout: 150_000 });

// Report 5.1 on the seeded sample server (17.09.2026): 2026 has eight full months, 2025 twelve.
const whole = (value: number) => formatEuro(cents(value), { cents: false });

interface YearAnswer {
  report: {
    year: number;
    months: string[];
    totals: {
      incomeCents: number;
      consumptionCents: number;
      futureCents: number;
      capitalCents: number;
    };
    netWorth: { endCents: number; startCents: number } | null;
    rows: unknown[];
    categories: unknown[];
  };
  rules: { okCount: number; total: number } | null;
}

test('Jahresreport shows two sheets with the figures of the endpoint', async ({ page }, info) => {
  const first = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/overview/year' && r.status() === 200,
  );
  await page.goto('/reports/jahresreport');
  const data = (await (await first).json()) as YearAnswer;
  expect(data.report.year).toBe(2026);
  expect(data.report.months).toHaveLength(8);

  const sheets = page.locator('.ov-sheet');
  await expect(sheets).toHaveCount(2);
  await expect(page.getByRole('article', { name: 'Jahresreport 2026, Blatt 1' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Jahresreport 2026, Blatt 2' })).toBeVisible();
  await expect(page.getByTestId('yr-income')).toHaveText(whole(data.report.totals.incomeCents));
  await expect(page.getByTestId('yr-consumption')).toHaveText(
    whole(data.report.totals.consumptionCents),
  );
  await expect(page.getByTestId('yr-capital')).toHaveText(whole(data.report.totals.capitalCents));
  await expect(page.getByTestId('yr-networth-end')).toHaveText(
    whole(data.report.netWorth!.endCents),
  );
  // Maßkette Nettovermögen: Anfang + Eigenleistung ± Markt = Ende.
  const chain = page.getByRole('group', { name: 'Maßkette Nettovermögen im Jahr' });
  await expect(chain).toContainText(whole(data.report.netWorth!.startCents));
  await expect(chain).toContainText(whole(data.report.netWorth!.endCents));
  // Stückliste: eight months plus the total row; ten categories in the heat table.
  await expect(page.getByTestId('yr-months').locator('tbody tr')).toHaveCount(9);
  await expect(page.getByTestId('yr-heat').locator('tbody tr')).toHaveCount(10);
  await expect(page.getByTestId('yr-rules')).toContainText(
    `von ${data.rules!.total} Regeln erfüllt`,
  );
  await expect(page.getByTestId('yr-cashflow')).toBeVisible();
  await expect(page.getByTestId('yr-networth')).toBeVisible();
  await inspectReport(page, info, 'jahresreport-2026');

  const other = page.waitForResponse(
    (r) => r.url().includes('/api/overview/year?year=2025') && r.status() === 200,
  );
  await page.getByRole('button', { name: '2025', exact: true }).click();
  const old = (await (await other).json()) as YearAnswer;
  expect(old.report.months).toHaveLength(12);
  await expect(page.getByRole('article', { name: 'Jahresreport 2025, Blatt 1' })).toBeVisible();
  await expect(page.getByTestId('yr-months').locator('tbody tr')).toHaveCount(13);
  await expect(page.getByTestId('yr-income')).toHaveText(whole(old.report.totals.incomeCents));
});

test('Jahresreport prints as exactly two A4 pages without clipping', async ({
  page,
  browserName,
}, info) => {
  test.skip(browserName !== 'chromium' || info.project.name !== 'desktop', 'PDF needs Chromium');
  // A4 minus the 6 mm print margins is about 749 px wide.
  await page.setViewportSize({ width: 749, height: 1050 });
  await page.goto('/reports/jahresreport');
  await expect(page.locator('.ov-sheet')).toHaveCount(2);
  await expect(page.getByTestId('yr-networth')).toBeVisible();
  await expect(page.getByTestId('yr-heat')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  const sheets = await page
    .locator('.ov-sheet-body')
    .evaluateAll((els) => els.map((el) => ({ scroll: el.scrollHeight, client: el.clientHeight })));
  expect(sheets).toHaveLength(2);
  expect(
    sheets.map((sheet) => sheet.scroll <= sheet.client + 1),
    `content height against page height: ${JSON.stringify(sheets)}`,
  ).toEqual([true, true]);
  // Chromium refuses a page range beyond the page count: page 2 exists, page 3 does not.
  const options = { preferCSSPageSize: true, printBackground: true };
  expect((await page.pdf({ ...options, pageRanges: '2' })).byteLength).toBeGreaterThan(1000);
  await expect(page.pdf({ ...options, pageRanges: '3' })).rejects.toThrow(/page range/i);
});

test('Jahresreport says so for a year without full months', async ({ page }) => {
  await page.route('**/api/overview/year**', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as YearAnswer;
    await route.fulfill({
      response,
      json: {
        ...body,
        report: { ...body.report, months: [], rows: [], categories: [], netWorth: null },
        rules: null,
      },
    });
  });
  await page.goto('/reports/jahresreport');
  await expect(page.getByRole('status').filter({ hasText: 'kein voller Monat' })).toBeVisible();
  await expect(page.locator('.ov-sheet')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Drucken' })).toBeDisabled();
});
