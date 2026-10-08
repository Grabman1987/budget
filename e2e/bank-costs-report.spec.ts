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
  await expect(page.getByText(/Erfasste Bank- und Zinskosten · letzte/)).toBeVisible();
  await expect(page.getByTestId('cost-sources')).toContainText('Kreditzinsen');
  await expect(page.getByTestId('cost-kinds')).toContainText('Kein Haushaltseinkommen');
  await expect(
    page.getByRole('group', { name: 'Maßkette erfasste Bank- und Zinskosten' }),
  ).toContainText('Haben- und Dividenden-Erträge');
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

isolatedTest(
  'shows known subtotal coverage beside current unknown interest and missing-FX status',
  async ({ page, request, baseURL }, info) => {
    const post = async (path: string, data: unknown) => {
      const response = await request.post(`/api${path}`, { data, headers: { origin: baseURL! } });
      expect(response.ok()).toBe(true);
      return response.json();
    };
    const checking = await post('/accounts', {
      name: 'Synthetisches Girokonto',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-09-01',
      openingBalanceCents: -5_000,
    });
    const group = await post('/categories/groups', { name: 'Bank und Gebühren' });
    const category = await post('/categories', {
      name: 'Kontoführungsgebühr',
      groupId: group.group.id,
      class: 'need',
      kind: 'fixed',
    });
    await post('/bookings', {
      type: 'booking',
      accountId: checking.account.id,
      date: '2026-09-20',
      amountCents: -690,
      splits: [{ categoryId: category.category.id, amountCents: -690 }],
    });
    await post('/accounts', {
      name: 'Kredit ohne Zinssatz',
      type: 'loan',
      role: 'debt',
      onBudget: false,
      openingDate: '2026-09-01',
      openingBalanceCents: -50_000,
    });
    await post('/accounts', {
      name: 'EUR-Kredit mit Zinssatz',
      type: 'loan',
      role: 'debt',
      onBudget: false,
      openingDate: '2026-09-01',
      openingBalanceCents: -100_000,
      originalAmountCents: 100_000,
      termStart: '2026-09-01',
      interestRateBp: 1_200,
      installmentCents: 2_000,
      monthlyFeeCents: 0,
    });
    await post('/accounts', {
      name: 'USD-Kredit mit Zinssatz',
      type: 'loan',
      role: 'debt',
      onBudget: false,
      openingDate: '2026-09-01',
      openingBalanceCents: -100_000,
      currency: 'USD',
      originalAmountCents: 100_000,
      termStart: '2026-09-01',
      interestRateBp: 1_200,
      installmentCents: 2_000,
    });

    const response = await request.get('/api/reports/spending/costs');
    expect(response.ok()).toBe(true);
    const report = await response.json();
    expect.soft(report).toMatchObject({ asOf: '2026-10-02', to: '2026-09-30' });
    expect
      .soft(
        report.creditLines.find(
          (line: { name: string }) => line.name === 'Synthetisches Girokonto',
        ),
      )
      .toBeTruthy();
    expect.soft(report.modeledInterestMissingFxPeriods).toBe(1);
    expect.soft(report.totalCents).toBe(1_690);
    expect
      .soft(report.rows.find((row: { key: string }) => row.key === 'modeledInterest')?.cents)
      .toBe(1_000);

    await page.goto('/reports/kosten');
    await expect(page.getByTestId('bc-total')).toHaveText('16,90 €');
    await expect(page.getByTestId('bc-components')).toHaveText(
      'Gebucht: 6,90 € · aus Konditionen geschätzt: 10,00 €',
    );
    await expect(page.getByTestId('bc-coverage')).toContainText(
      /Aktuell genutzte Kredit-\/Dispolinien ohne Zinsangabe zum .+: 2\./,
      {
        timeout: 3_000,
      },
    );
    await expect(
      page.getByText(/Geschätzte Zinszeiträume ohne EUR-Kurs in den letzten zwölf Monaten: 1/),
    ).toBeVisible({ timeout: 3_000 });
    await expect(
      page.getByText(
        /Darlehenszinsen werden nur mit den vorhandenen Modellangaben und EUR-Kursen geschätzt/,
      ),
    ).toBeVisible();
    await expect(page.getByText(/Spreads und TER sind nicht gebucht/)).toBeVisible();
    await inspectReport(page, info, 'bank-cost-coverage');
  },
);
