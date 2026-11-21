import { redesignReportsOn } from './report-frame';
import { openSpendingGroups } from './income-spending-controls';
import { eur } from '../apps/web/src/ledger/format';
import type { SpendingReport } from '@budget/db';
import { cents, formatEuro } from '@budget/domain';
import { expect as baseExpect, sampleTest as test } from './sample';
import { inspectReport } from './overview-report';

// The sample server evaluates the rules synchronously (seconds) the first time a report finds the
// stored results stale, and every request waits for it: generous timeouts instead of retries.
const expect = baseExpect.configure({ timeout: 60_000 });
test.describe.configure({ timeout: 150_000 });

// Report 5.5 on the seeded sample server (17.09.2026, last full month August 2026).
const whole = (value: number) => formatEuro(cents(value), { cents: false });

test('Zeitraumvergleich shows the figures of the endpoint and switches the mode', async ({
  page,
}, info) => {
  await page.goto('/reports/vergleich');
  if (await redesignReportsOn(page)) {
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === '/reports/ausgaben' &&
        url.searchParams.get('zeitraum') === '1M' &&
        url.searchParams.get('vergleich') === 'vorjahr',
    );
    const response = await page.request.get(
      '/api/reports/spending/analysis?period=1M&basis=previous-year',
    );
    expect(response.ok()).toBe(true);
    const data = (await response.json()) as SpendingReport;
    await openSpendingGroups(page);
    await expect(page.getByTestId('sa-consumption')).toHaveText(eur(data.consumptionCents));
    const chain = page.getByRole('group', { name: 'Maßkette Veränderung', exact: true });
    await expect(chain).toContainText(eur(data.answerComparison.previousCents!));
    await expect(chain).toContainText(eur(data.consumptionCents));
    const mode = page.getByRole('combobox', { name: 'Vergleich mit', exact: true });
    await expect(mode).toHaveValue('vorjahr');
    await mode.selectOption('vorperiode');
    await expect(mode).toHaveValue('vorperiode');
    await expect(chain).toBeVisible();
    return;
  }
  const response = await page.request.get('/api/overview/compare?mode=vj');
  expect(response.ok()).toBe(true);
  const { comparison } = (await response.json()) as {
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
  const moreBar = page.locator('.dv-track i.is-more').first();
  await expect(moreBar).toBeVisible();
  const [barColor, redColor] = await moreBar.evaluate((el) => {
    const probe = document.createElement('i');
    probe.style.backgroundColor = 'var(--red)';
    document.body.append(probe);
    const red = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return [getComputedStyle(el).backgroundColor, red];
  });
  expect(barColor).not.toBe(redColor);
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
