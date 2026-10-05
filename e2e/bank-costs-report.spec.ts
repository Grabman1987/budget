import { test as isolatedTest } from './isolated-ledger';
import { expect, sampleTest as test } from './sample';
import { inspectReport } from './spending-helpers';

// 2.6 Bank- und Zinskosten on the seeded sample ledger (today 17.09.2026).

test('shows monthly cost stacks, sources and separate earnings', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.goto('/reports/kosten');
  await expect(page.getByTestId('bc-total')).toHaveText(/\d.*,\d\d €$/, { timeout: 30_000 });
  await expect(
    page.getByRole('heading', { name: 'Was kostet uns das Geld selbst?' }),
  ).toBeVisible();
  await expect(page.getByTestId('bank-costs-chart')).toBeVisible();
  await expect(page.getByText(/Kosten inkl. geschätzter Kreditzinsen · letzte/)).toBeVisible();
  await expect(page.getByTestId('cost-sources')).toContainText('Kreditzinsen');
  await expect(page.getByTestId('cost-kinds')).toContainText('Kein Haushaltseinkommen');
  await expect(page.getByRole('group', { name: 'Maßkette Bank- und Zinskosten' })).toContainText(
    'Haben- und Dividenden-Erträge',
  );
  await expect(page.getByText(/Größte Kostenquelle:/)).toBeVisible();
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
