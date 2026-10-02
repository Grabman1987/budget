import { test as ledgerTest, expect } from '@playwright/test';
import { MAIN_URL } from '../playwright.config';

ledgerTest(
  'capture link makes no writes until the owner saves; split remainder can replace a populated line',
  async ({ page }, info) => {
    const created = await page.request.post('/api/accounts', {
      headers: { origin: MAIN_URL },
      data: {
        name: `Linkkonto ${info.project.name}`,
        type: 'cash',
        openingDate: '2026-01-01',
        openingBalanceCents: 10000,
      },
    });
    expect(created.ok()).toBe(true);
    const { account } = await created.json();
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET' && /\/api\/(bookings|payees)/.test(request.url()))
        writes.push(request.url());
    });
    await page.goto(
      `/erfassen?betrag=50%2C01&empfaenger=Beispielmarkt&kategorie=e2e-essen&konto=${account.id}`,
    );
    const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
    await expect(dialog.getByLabel('Betrag', { exact: true })).toHaveValue('50,01');
    await expect(dialog.getByLabel('Konto', { exact: true })).toHaveValue(account.id);
    await expect(dialog.getByLabel('Kategorie', { exact: true })).toHaveValue('Essen');
    expect(writes).toEqual([]);
    await dialog.getByRole('button', { name: 'Aufteilen', exact: true }).click();
    await dialog.getByLabel('Betrag 1', { exact: true }).fill('10');
    await dialog.getByLabel('Betrag 2', { exact: true }).fill('20');
    await dialog.getByRole('button', { name: 'Rest verteilen in Zeile 2' }).click();
    await expect(dialog.getByLabel('Betrag 2', { exact: true })).toHaveValue('40,01');
    await dialog.getByLabel('Kategorie 2', { exact: true }).selectOption('e2e-essen');
    expect(writes).toEqual([]);
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(writes.some((url) => url.includes('/api/bookings'))).toBe(true);
    const bookings = await page.request.get(`/api/bookings?accountId=${account.id}`);
    const { items } = await bookings.json();
    expect(items).toHaveLength(1);
    expect(items[0].amountCents).toBe(-5001);
    expect(items[0].splits.map((s: { amountCents: number }) => s.amountCents)).toEqual([
      -1000, -4001,
    ]);
  },
);
