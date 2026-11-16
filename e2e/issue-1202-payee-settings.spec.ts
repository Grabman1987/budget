import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-15' });

// Runs in the desktop (1440) and mobile (390) projects alike.
test('Einstellungen > Empfaenger: suggestion group, main payee, merge with preview, alias and Undo', async ({
  page,
  request,
  baseURL,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const post = async <T>(path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers: { origin: baseURL! }, data });
    expect(response.ok()).toBe(true);
    return response.json() as Promise<T>;
  };
  const main = (await post<{ payee: { id: string } }>('/payees', { name: 'Bäckerei Muster' }))
    .payee;
  const dupe = (
    await post<{ payee: { id: string } }>('/payees', { name: 'Payment for Bäckerei Muster' })
  ).payee;
  await post('/payees', { name: 'Tankstelle Beispiel' });
  const { account } = await post<{ account: { id: string } }>('/accounts', {
    name: 'Synthetic payee funds',
    type: 'checking',
    openingDate: '2026-09-01',
    openingBalanceCents: 10000,
  });
  const { group } = await post<{ group: { id: string } }>('/categories/groups', {
    name: 'Synthetic payee group',
  });
  const { category } = await post<{ category: { id: string } }>('/categories', {
    name: 'Synthetic payee spending',
    groupId: group.id,
    kind: 'variable',
    class: 'need',
  });
  const book = async (payeeId: string, day: string) =>
    (
      await post<{ bookings: { id: string }[] }>('/bookings', {
        type: 'booking',
        accountId: account.id,
        date: day,
        amountCents: -450,
        status: 'confirmed',
        payeeId,
        splits: [{ categoryId: category.id, amountCents: -450 }],
      })
    ).bookings[0]!.id;
  const bookingId = await book(dupe.id, '2026-09-05');
  await book(main.id, '2026-09-06');
  const payeeOf = async () =>
    (
      (await (await request.get(`/api/bookings/${bookingId}`)).json()) as {
        booking: { payeeId: string };
      }
    ).booking.payeeId;
  expect(await payeeOf()).toBe(dupe.id);

  await page.goto('/einstellungen/empfaenger');
  await expect(page.getByRole('heading', { name: 'Mögliche Dubletten' })).toBeVisible();
  const suggestion = page.getByTestId('payee-dupe');
  await expect(suggestion).toHaveCount(1);
  await expect(suggestion).toContainText('Bäckerei Muster');
  await expect(page.getByTestId('payee-row').first()).toBeVisible();

  await suggestion.getByRole('button', { name: /Vorschlag zusammenführen/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Empfänger zusammenführen', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /^Bäckerei Muster/ }).check();
  const preview = dialog.getByRole('region', { name: 'Vorschau der Zusammenführung' });
  await expect(preview).toContainText('1 Buchung, 0 Regeln wechseln zu „Bäckerei Muster“');
  await expect(preview).toContainText('Alias');
  expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Zusammenführen bestätigen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Empfänger zusammengeführt.')).toBeVisible();

  expect(await payeeOf()).toBe(main.id);
  await expect(suggestion).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /Alias payment for bäckerei muster .* entfernen/i }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(suggestion).toHaveCount(1);
  expect(await payeeOf()).toBe(dupe.id);
});
