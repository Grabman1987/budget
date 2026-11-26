import { openPaymentManagement } from './plan-redesign-controls';
import { expect as baseExpect } from '@playwright/test';
import { test } from './isolated-ledger';

const expect = baseExpect.configure({ timeout: 15_000 });
test.use({ ledgerToday: '2026-10-02' });
test.beforeEach(() => test.slow());

/** #1360: one planned occurrence moves to another day; the rule and the other dates stay. */
test('moves a single planned occurrence and undoes it', async ({ page, baseURL }, info) => {
  const origin = baseURL!;
  const accountResponse = await page.request.post('/api/accounts', {
    headers: { origin },
    data: {
      name: `Synthetic move account ${info.project.name}`,
      type: 'checking',
      openingDate: '2026-10-01',
      openingBalanceCents: 100_000,
    },
  });
  expect(accountResponse.status(), await accountResponse.text()).toBe(201);
  const { account } = (await accountResponse.json()) as { account: { id: string } };
  const name = `Synthetic move rent ${info.project.name}`;
  const paymentResponse = await page.request.post('/api/expected', {
    headers: { origin },
    data: {
      name,
      kind: 'outflow',
      accountId: account.id,
      rhythm: 'monthly',
      dueDay: 20,
      startDate: '2026-10-01',
      validFrom: '2026-10-01',
      amountCents: 12_345,
    },
  });
  expect(paymentResponse.status(), await paymentResponse.text()).toBe(201);
  const { payment } = (await paymentResponse.json()) as { payment: { id: string } };

  await page.goto(`/plan/erwartet/${payment.id}`);
  await openPaymentManagement(page);
  const panel = page.locator('.xp-detail-body');
  const row = (day: string) =>
    panel.locator('.xp-occ > li').filter({ has: page.locator('.xp-occ-date', { hasText: day }) });
  const october = row('20.10.2026');
  await october.getByRole('button', { name: 'Verschieben' }).click();
  await panel.getByLabel('Neues Datum').fill('2026-10-27');
  await panel.getByRole('button', { name: 'Speichern' }).click();
  const moved = row('27.10.2026');
  await expect(moved).toContainText('Verschoben vom 20.10.2026');
  await expect(row('20.10.2026')).toHaveCount(0);
  // The next month keeps the rule.
  await expect(row('20.11.2026')).toHaveCount(1);
  const next = await page.request.get('/api/expected/register-next');
  const occurrences = ((await next.json()) as { occurrences: { name: string; dueDate: string }[] })
    .occurrences;
  expect(occurrences.find((o) => o.name === name)?.dueDate).toBe('2026-10-27');

  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(row('20.10.2026')).toHaveCount(1);
});
