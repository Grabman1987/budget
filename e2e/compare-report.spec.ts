import { cents, formatEuro } from '@budget/domain';
import { expect, sampleTest as test } from './sample';
import { inspectReport } from './overview-report';

// Report 5.5 on the seeded sample server (17.09.2026, last full month August 2026).
const whole = (value: number) => formatEuro(cents(value), { cents: false });

test('Zeitraumvergleich shows the figures of the endpoint and switches the mode', async ({
  page,
}, info) => {
  const first = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/overview/compare' && r.status() === 200,
  );
  await page.goto('/reports/vergleich');
  const { comparison } = (await (await first).json()) as {
    comparison: {
      current: string[];
      previous: string[];
      currentTotals: { consumptionCents: number; incomeCents: number; capitalCents: number };
      chain: { moreCents: number; lessCents: number };
      rows: unknown[];
    };
  };
  expect(comparison.current).toEqual(['2026-08']);
  expect(comparison.previous).toEqual(['2025-08']);

  await expect(page.getByRole('heading', { name: 'August 2026 gegen August 2025' })).toBeVisible();
  await expect(page.getByTestId('vg-consumption')).toHaveText(
    whole(comparison.currentTotals.consumptionCents),
  );
  await expect(page.getByTestId('vg-income')).toHaveText(
    whole(comparison.currentTotals.incomeCents),
  );
  // Dividends and interest stand apart from the income figure.
  await expect(page.getByTestId('vg-capital')).toHaveText(
    whole(comparison.currentTotals.capitalCents),
  );
  await expect(page.locator('.dv li')).toHaveCount(comparison.rows.length);
  const chain = page.getByRole('group', { name: 'Maßkette Zeitraumvergleich' });
  await expect(chain).toContainText(whole(comparison.chain.moreCents));
  await expect(chain).toContainText(whole(comparison.chain.lessCents));
  await inspectReport(page, info, 'vergleich-vj');

  const next = page.waitForResponse(
    (r) => r.url().includes('/api/overview/compare?mode=ytd') && r.status() === 200,
  );
  await page.getByRole('button', { name: 'Jahr bis heute gegen Vorjahr' }).click();
  await next;
  await expect(page.getByRole('button', { name: 'Jahr bis heute gegen Vorjahr' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('heading', { name: 'Jän 26 bis Aug 26 gegen Jän 25 bis Aug 25' }),
  ).toBeVisible();
  await inspectReport(page, info, 'vergleich-ytd');
});
