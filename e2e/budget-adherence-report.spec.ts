import { expect, sampleTest as test } from './sample';
import { inspectReport } from './spending-helpers';

// 2.2 Budgettreue inkl. 50/30/20 on the seeded sample ledger (today 17.09.2026).

test('shows plan against actuals of August 2026 with the 50/30/20 history and plan deviation', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.goto('/reports/budgettreue?monat=2026-08');
  await expect(page.getByRole('heading', { name: 'August 2026', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('ba-over')).toHaveText(/^\d+ von \d+$/);

  // Plan minus Ist = Rest or Überzogen, exactly as displayed.
  const chain = page.getByRole('group', { name: 'Maßkette Plan gegen Ist' });
  await expect(chain).toContainText('Plan');
  await expect(chain).toContainText(/Rest|Überzogen/);

  // Bullets: every bar names its Ist and Plan for assistive technology.
  const bars = page.getByRole('img', { name: /^Ist .* von Plan .*$/ });
  expect(await bars.count()).toBeGreaterThan(10);

  // 50/30/20: twelve months, August is the marked row; every row adds up to 100 %.
  const rows = page.locator('.sr-523-row');
  await expect(rows).toHaveCount(12);
  await expect(rows.last()).toHaveClass(/is-cur/);
  const labels = await page
    .locator('.sr-523-bar')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  for (const label of labels) {
    const sum = [...label.matchAll(/(−?\d+) %/g)].reduce((a, m) => {
      const n = Number(m[1]!.replace('−', '-'));
      return a + (label.includes(`aus Guthaben ${Math.abs(n)} %`) && n > 0 ? -n : n);
    }, 0);
    expect(sum, label).toBe(100);
  }

  // Rolling deviation: at most ten rows with a word for each classification.
  const dev = page.locator('.sr-table tbody tr');
  expect(await dev.count()).toBeLessThanOrEqual(10);
  await expect(page.getByText(/im Band|Plan anpassen\?/).first()).toBeVisible();

  // A bullet opens the bookings of that category and month.
  await expect(page.locator('.sr-bl a').first()).toHaveAttribute(
    'href',
    /kategorie=.*von=2026-08-01.*bis=2026-08-31/,
  );

  await inspectReport(page, info, 'budget-adherence');

  // Month switch.
  await page.getByRole('button', { name: 'Vormonat' }).click();
  await expect(page.getByRole('heading', { name: 'Juli 2026', exact: true })).toBeVisible();
});

test('the running month counts up to today and marks overspending as action', async ({ page }) => {
  await page.goto('/reports/budgettreue?monat=2026-09');
  await expect(page.getByRole('heading', { name: 'September 2026 · bis 17.' })).toBeVisible();
  await expect(page.getByText('Ist bis heute')).toBeVisible();
  await expect(page.getByTestId('sr-month')).toHaveText('September 2026');
  // The history shows only months that are over.
  await expect(page.locator('.sr-523-row').last()).toContainText('Aug 26');
});

test('says why there is nothing to show before the budget starts and in the future', async ({
  page,
}) => {
  await page.goto('/reports/budgettreue?monat=2023-06');
  await expect(page.locator('.sr-empty')).toContainText('Vor Oktober 2023');
  await page.goto('/reports/budgettreue?monat=2027-02');
  await expect(page.locator('.sr-empty')).toContainText('Zukunft');
});
