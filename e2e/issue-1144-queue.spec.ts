import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { captureSaveControl, openAccountCapture, pickCategory } from './ledger-helpers';

test('1144 parks the middle 500, delivers its neighbours in order, then safely corrects or discards', async ({
  page,
  context,
  baseURL,
}) => {
  const send = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, {
      headers: { origin: baseURL! },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const { account } = await send('/accounts', {
    name: 'Synthetic queue cash',
    type: 'cash',
    openingDate: '2026-10-01',
    openingBalanceCents: 10000,
  });
  const { group } = await send('/categories/groups', { name: 'Synthetic queue group' });
  await send('/categories', {
    name: 'Synthetic queue category',
    groupId: group.id,
    kind: 'variable',
    class: 'need',
    stage: 2,
  });
  await page.goto(`/konten/${account.id}?panel=buchung`);
  await expect(page.getByRole('dialog', { name: 'Buchung erfassen', exact: true })).toBeVisible();
  const attempts: { memo: string; key: string }[] = [];
  const delivered: string[] = [];
  const checks: string[] = [];
  await page.route('**/api/bookings', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const memo = route.request().postDataJSON().memo as string;
    attempts.push({ memo, key: route.request().headers()['idempotency-key']! });
    if (memo === 'Synthetic middle') {
      await route.fulfill({
        status: 500,
        json: {
          error: 'server_error',
          message: 'Die Anfrage konnte nicht verarbeitet werden.',
          errorId: 'abc123def456',
        },
      });
    } else {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      delivered.push(memo);
      await route.fulfill({ response });
    }
  });
  await page.route('**/api/bookings/delivery/*', async (route) => {
    checks.push(route.request().url().split('/').at(-1)!);
    await route.continue();
  });
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          sessionStorage.setItem('synthetic-copied', text);
        },
      },
    });
  });
  await context.setOffline(true);
  for (const memo of ['Synthetic first', 'Synthetic middle', 'Synthetic third']) {
    if (memo !== 'Synthetic first')
      await page.getByRole('button', { name: 'Buchung erfassen', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
    await dialog.getByLabel('Bezahlt von', { exact: true }).selectOption(account.id);
    await dialog.getByLabel('Betrag', { exact: true }).fill('1,00');
    await dialog.getByLabel('Empfänger', { exact: true }).fill('Synthetic queue shop');
    await pickCategory(dialog, 'Synthetic queue category');
    await dialog.getByLabel('Notiz', { exact: true }).fill(memo);
    await captureSaveControl(dialog).click();
    await expect(dialog).toBeHidden();
  }
  const queue = page.getByRole('region', { name: 'Wartet auf Verbindung', exact: true });
  await expect(queue.locator('li')).toHaveCount(3);
  expect(attempts).toEqual([]);
  await context.setOffline(false);
  await expect(queue.locator('li')).toHaveCount(1);
  await expect(queue).toContainText('Buchung abgelehnt');
  await expect(queue).toContainText('Die Anfrage konnte nicht verarbeitet werden.');
  await expect(queue).toContainText('Fehler-ID: abc123def456');
  await expect(queue).not.toContainText('Server ist vorübergehend nicht verfügbar');
  expect(delivered).toEqual(['Synthetic first', 'Synthetic third']);
  expect(attempts.map((row) => row.memo)).toEqual([
    'Synthetic first',
    'Synthetic middle',
    'Synthetic third',
  ]);
  expect(new Set(attempts.map((row) => row.key)).size).toBe(3);
  const middleKey = attempts[1]!.key;
  await queue.getByRole('button', { name: 'Details kopieren' }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('synthetic-copied'))).toBe(
    'Die Anfrage konnte nicht verarbeitet werden. · Fehler-ID: abc123def456',
  );
  await expect(queue.getByRole('button', { name: 'Bearbeiten' })).toBeDisabled();
  await expect(queue.getByRole('button', { name: 'Löschen' })).toBeDisabled();
  // Automatic triggers leave a rejected draft parked.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await queue.getByRole('button', { name: 'Jetzt senden' }).click();
  await expect(queue.getByRole('button', { name: 'Bearbeiten' })).toBeEnabled();
  await expect(queue.getByRole('button', { name: 'Löschen' })).toBeEnabled();
  expect(checks).toEqual([middleKey]);
  expect(attempts).toHaveLength(3);
  await queue.getByRole('button', { name: 'Bearbeiten' }).click();
  const edit = page.getByRole('dialog', { name: 'Wartende Buchung bearbeiten' });
  await edit.getByLabel('Notiz', { exact: true }).fill('Synthetic corrected');
  await captureSaveControl(edit).click();
  await expect(edit).toBeHidden();
  await expect(queue).toHaveCount(0);
  expect(attempts.at(-1)).toEqual({ memo: 'Synthetic corrected', key: middleKey });
  expect(delivered).toEqual(['Synthetic first', 'Synthetic third', 'Synthetic corrected']);
  const rows = await page.request.get(`/api/bookings?accountId=${account.id}`);
  const items = (await rows.json()).items as { memo: string; amountCents: number }[];
  expect(items.map((row) => row.memo).sort()).toEqual([
    'Synthetic corrected',
    'Synthetic first',
    'Synthetic third',
  ]);
  expect(items.map((row) => row.amountCents)).toEqual([-100, -100, -100]);
  // A separately refused draft can also be discarded once non-delivery is proven.
  await openAccountCapture(page);
  const next = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
  await next.getByLabel('Betrag', { exact: true }).fill('1,00');
  await next.getByLabel('Empfänger', { exact: true }).fill('Synthetic queue shop');
  await pickCategory(next, 'Synthetic queue category');
  await next.getByLabel('Notiz', { exact: true }).fill('Synthetic middle');
  await captureSaveControl(next).click();
  await expect(next).toBeHidden();
  await expect(queue).toContainText('Buchung abgelehnt');
  await queue.getByRole('button', { name: 'Jetzt senden' }).click();
  await expect(queue.getByRole('button', { name: 'Löschen' })).toBeEnabled();
  await queue.getByRole('button', { name: 'Löschen' }).click();
  await expect(queue).toHaveCount(0);
  await page.reload();
  await expect(queue).toHaveCount(0);
  expect(attempts).toHaveLength(5);
  const final = await page.request.get(`/api/bookings?accountId=${account.id}`);
  expect((await final.json()).items).toHaveLength(3);
});
