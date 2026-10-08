import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('expected income stays a planning difference when actual cash is over-assigned', async ({
  page,
  request,
  baseURL,
}, info) => {
  const send = async (method: 'GET' | 'POST' | 'PUT', path: string, data?: unknown) => {
    const res = await request.fetch(`/api${path}`, {
      method,
      ...(data === undefined ? {} : { data }),
      headers: { origin: baseURL! },
    });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };

  const { account } = await send('POST', '/accounts', {
    name: 'Testkonto',
    type: 'checking',
    openingDate: '2026-10-01',
    openingBalanceCents: 150_000,
  });
  const { group } = await send('POST', '/categories/groups', { name: 'Testgruppe' });
  const { category } = await send('POST', '/categories', {
    name: 'Testziel',
    groupId: group.id,
    class: 'need',
    kind: 'variable',
    stage: 2,
  });
  await send('PUT', `/categories/${category.id}/target`, {
    validFrom: '2026-10',
    target: { kind: 'monthly', amountCents: 200_000 },
  });
  await send('PUT', '/budget/2026-10/assigned', {
    items: [{ categoryId: category.id, assignedCents: 150_000 }],
  });
  await send('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-02',
    categoryId: null,
    amountCents: -50_000,
  });
  await send('POST', '/expected', {
    name: 'Testgehalt',
    kind: 'inflow',
    accountId: account.id,
    amountCents: 300_000,
    rhythm: 'monthly',
    dueDay: 15,
    startDate: '2026-10-15',
  });

  const [{ accounts }, { summary, incomeTargets }] = await Promise.all([
    send('GET', '/accounts'),
    send('GET', '/budget/2026-10'),
  ]);
  expect(accounts.find((item: { id: string }) => item.id === account.id)?.balanceCents).toBe(
    100_000,
  );
  expect(summary.toBeAssignedCents).toBe(-50_000);
  expect(incomeTargets).toMatchObject({
    expectedCents: 300_000,
    targetsCents: 200_000,
    differenceCents: 100_000,
    unfundedCents: 50_000,
    unfundedCategoryIds: [category.id],
  });

  await page.goto('/plan/monat?monat=2026-10');
  const card = page.getByTestId('income-targets');
  await expect(
    card.getByText('Erwartetes Einkommen', { selector: 'dt', exact: true }),
  ).toBeVisible();
  await expect(card).toContainText('3.000,00 €');
  await expect(card.getByTestId('income-targets-difference')).toHaveText('+1.000,00 €');
  await expect(card).toContainText('Planungsdifferenz');
  await expect(card).not.toContainText('Überschuss');
  await expect(card).toContainText('Noch zu finanzieren: 500,00 €');
  await expect(page.getByTestId('to-be-assigned')).toHaveText('−500,00 €');
  await expect(page.locator('.hero-kpi.tbd')).toContainText('zu viel zugewiesen');

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`income-targets-272-${info.project.name}-${theme}.png`),
      fullPage: true,
    });
  }
});
