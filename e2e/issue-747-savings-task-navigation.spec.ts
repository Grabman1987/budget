import { openPruefenSource } from './pruefen-part';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('Today savings action opens Aufgaben when bank movements are also pending', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  const { origin } = isolatedLedger;
  const suffix = `${info.project.name} retry ${info.retry}`;
  const securityName = `Synthetic savings navigation ${suffix}`;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`${origin}/api${path}`, {
      headers: { origin },
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const get = async (path: string) => {
    const response = await request.get(`${origin}/api${path}`);
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const bank = (
    await post('/accounts', {
      name: `Synthetic pending account ${suffix}`,
      type: 'checking',
      openingDate: '2026-10-01',
      openingBalanceCents: 100000,
    })
  ).account;
  const investment = (
    await post('/accounts', {
      name: `Synthetic savings account ${suffix}`,
      type: 'brokerage',
      currency: 'EUR',
      openingDate: '2026-10-01',
      openingBalanceCents: 200000,
    })
  ).account;
  const security = (
    await post('/securities', { name: securityName, kind: 'stock', currency: 'EUR' })
  ).security;
  const booking = await post('/bookings', {
    type: 'booking',
    accountId: bank.id,
    date: '2026-10-02',
    amountCents: -100,
    status: 'pending',
    splits: [{ amountCents: -100 }],
  });
  await post('/savings-plans', {
    securityId: security.id,
    accountId: investment.id,
    amountCents: 10000,
    dayOfMonth: 1,
    validFrom: '2026-10-01',
  });
  const auto = await get('/inbox?limit=50&segment=auto');
  expect(auto.segment).toBe('umsaetze');
  expect(auto.segments).toEqual({ umsaetze: 1, aufgaben: 1 });
  expect(auto.entries).toEqual(
    expect.arrayContaining([expect.objectContaining({ bookingId: booking.id })]),
  );
  const unchanged = async () => {
    expect((await get(`/trades?security=${security.id}`)).trades).toEqual([]);
    const { accounts } = await get('/accounts');
    expect(
      accounts.find((account: { id: string }) => account.id === investment.id).balanceCents,
    ).toBe(200000);
    expect(accounts.find((account: { id: string }) => account.id === bank.id).balanceCents).toBe(
      99900,
    );
  };
  await unchanged();
  await page.goto('/');
  const fold = page.getByRole('button', { name: 'Mehr zum Monat' });
  if ((await fold.getAttribute('aria-expanded')) === 'false') await fold.click();
  const tasks = page.getByRole('region', { name: 'Zu tun', exact: true });
  await tasks.getByText('1 Sparplanausführung prüfen', { exact: true }).click();
  const proposal = tasks.locator('.attention-proposals .rev-row').filter({ hasText: securityName });
  await proposal.getByRole('button', { name: 'Ausführung prüfen', exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname === '/konten/pruefen' && url.searchParams.get('teil') === 'aufgaben',
  );
  await openPruefenSource(page, 'Plan');
  const row = page.getByTestId('inbox-row').filter({ hasText: securityName });
  await row.getByRole('button', { name: 'Ausführung prüfen', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Sparplanausführung bestätigen', exact: true });
  await expect(form).toBeVisible();
  await expect(form).toContainText(securityName);
  await expect(form).toContainText('Kein Bankauftrag');
  await unchanged();
});
