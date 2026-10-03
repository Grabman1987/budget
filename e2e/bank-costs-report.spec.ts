import { test as isolatedTest } from './isolated-ledger';
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

isolatedTest(
  'loan movements never appear as interest in the report',
  async ({ page, request, baseURL }, info) => {
    const post = async (path: string, data: unknown) => {
      const response = await request.post(`/api${path}`, { data, headers: { origin: baseURL! } });
      expect(response.ok()).toBe(true);
      return response.json();
    };
    await post('/accounts', {
      name: 'Synthetischer Budgetrahmen',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-09-01',
    });
    const loan = await post('/accounts', {
      name: 'Synthetischer Kredit',
      type: 'loan',
      role: 'debt',
      onBudget: false,
      openingDate: '2026-09-01',
      openingBalanceCents: -900000,
    });
    const group = await post('/categories/groups', { name: 'Bank und Geb\u00fchren' });
    const cost = await post('/categories', {
      name: 'Synthetische Zinsen',
      groupId: group.group.id,
      class: 'need',
      kind: 'fixed',
    });
    await post('/bookings', {
      type: 'booking',
      accountId: loan.account.id,
      date: '2026-09-01',
      amountCents: -720000,
      splits: [{ amountCents: -720000 }],
    });
    await post('/bookings', {
      type: 'booking',
      accountId: loan.account.id,
      date: '2026-09-30',
      amountCents: -800,
      splits: [{ categoryId: cost.category.id, amountCents: -800 }],
    });
    await page.goto('/reports/kosten');
    const interest = page.getByTestId('cost-kinds').getByRole('row', { name: /Kreditzinsen/ });
    await expect(interest).toContainText('8');
    await expect(interest).not.toContainText('7.200');
    const data = await (await request.get('/api/reports/spending/costs')).json();
    expect(data.totalCents).toBe(800);
    await inspectReport(page, info, 'loan-cost-boundary');
  },
);
