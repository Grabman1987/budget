import { expect, sampleTest as test } from './sample';
import { inspectReport } from './spending-helpers';

// 2.6 Bank- und Zinskosten on the seeded sample ledger (today 17.09.2026).

test('shows booked costs per kind, earnings apart, credit lines, the loan projection and fund costs', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.goto('/reports/kosten');
  await expect(page.getByTestId('bc-total')).toHaveText(/\d.*,\d\d €$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Kosten des Geldes, 12 Monate' })).toBeVisible();

  // Chain: Zinsen und Dividenden − Kosten = Netto (Ertrag or Kosten, in words).
  const chain = page.getByRole('group', { name: 'Maßkette Bank- und Zinskosten' });
  await expect(chain).toContainText('Zinsen und Dividenden');
  await expect(chain).toContainText(/Netto-Ertrag|Netto-Kosten/);

  // Year bars: calendar years with the cut years named; every bar reads its parts in words.
  const years = page.getByRole('list', { name: 'Kosten je Kalenderjahr' });
  await expect(years.locator('li')).toHaveCount(4);
  await expect(years.locator('li').first()).toContainText('ab Okt 23');
  await expect(years.locator('li').last()).toContainText('bis Aug 26');
  await expect(years.getByRole('img').first()).toHaveAccessibleName(/Kreditzinsen .* Kontoführung/);

  // Kinds table: all four booked parts, the total, the earnings apart and the net line.
  const kinds = page.getByTestId('cost-kinds');
  for (const name of ['Kreditzinsen', 'Kontoführung', 'Ordergebühren', 'Fremdwährung'])
    await expect(kinds.getByRole('row', { name: new RegExp(name) })).toBeVisible();
  await expect(kinds.getByRole('row', { name: /^Erträge − Kosten/ })).toBeVisible();
  await expect(kinds.getByRole('row', { name: /Zinsen und Dividenden/ })).toContainText(
    'Kapitalerträge',
  );

  // Credit lines: the loan keeps its rate and term from Einstellungen > Konten.
  const lines = page.getByTestId('credit-lines');
  await expect(lines.getByRole('row').filter({ hasText: '6,32 %' })).toContainText('31.12.2029');
  await expect(lines.getByRole('row', { name: /Kreditkarte/ })).toContainText('15 %');

  // Loan projection with and without the planned extra repayment.
  await expect(page.getByRole('heading', { name: 'Kredit 6,32 %' })).toBeVisible();
  await expect(page.getByText('Ersparnis')).toBeVisible();
  await expect(page.getByText(/Monate früher/)).toBeVisible();

  // Fund costs load apart and say that they are an estimate that is not booked.
  await expect(page.getByTestId('fund-costs')).toContainText(/TER auf Depotwerte/, {
    timeout: 30_000,
  });

  await inspectReport(page, info, 'bank-costs');
});
