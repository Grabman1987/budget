import { expect, sampleTest as test } from './sample';
import { inspectReport } from './overview-report';

// Report 5.2 on the seeded sample server (17.09.2026): stored rule results of 12 month ends and
// today, read through the real /api/rules endpoints.
test('Finanz-Check-Verlauf shows stage, counts, strips and a matching chart', async ({
  page,
}, info) => {
  const matrix = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/rules/results' && r.status() === 200,
  );
  await page.goto('/reports/finanzcheck');
  const days = ((await (await matrix).json()) as { days: string[] }).days;
  expect(days.at(-1)).toBe('2026-09-17');
  expect(days).toHaveLength(13);

  await expect(page.getByRole('heading', { name: /^Stufe \d von 3: / })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Heute' })).toBeVisible();
  const ok = Number(await page.getByTestId('fc-ok-count').innerText());
  expect(ok).toBeGreaterThan(0);

  // The matrix lists every rule once, each strip has one cell per evaluated day.
  const rows = page.locator('.fc-table tbody tr');
  await expect(rows).toHaveCount(16);
  await expect(rows.first().locator('.ov-cell')).toHaveCount(days.length);
  await expect(rows.first().locator('.ov-strip')).toHaveAttribute('aria-label', /^Verlauf R\d\d: /);

  // The count on the card is the last point of the chart.
  expect(await page.getByTestId('fc-chart').getAttribute('aria-label')).toContain(
    `17.09. ${ok} von `,
  );
  await expect(page.getByTestId('fc-chart')).toBeVisible();
  await inspectReport(page, info, 'finanzcheck');
});
