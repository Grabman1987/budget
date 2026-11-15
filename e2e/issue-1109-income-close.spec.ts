import AxeBuilder from '@axe-core/playwright';
import { accounts, createExpectedPayment, INCOME_TYPES, openDatabase } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { setTheme } from './theme';

test.use({ ledgerToday: '2026-09-17' });

test('closes one unpaid income occurrence and restores it with Undo', async ({
  page,
  isolatedLedger,
}) => {
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    const ctx = { actor: 'synthetic-1109' };
    accounts.create(
      opened.db,
      {
        id: 'synthetic-giro',
        name: 'Testkonto',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-09-01',
        openingBalanceCents: 0,
      },
      ctx,
    );
    createExpectedPayment(
      opened.db,
      {
        name: 'Testprämie',
        kind: 'inflow',
        accountId: 'synthetic-giro',
        incomeTypeId: INCOME_TYPES.side.id,
        dueDay: 20,
        startDate: '2026-09-01',
      },
      { validFrom: '2026-09-01', amountCents: 10_001 },
      ctx,
      '2026-09-17',
    );
  } finally {
    opened.close();
  }
  await page.goto('/plan/monat/einnahmen?monat=2026-09');
  const open = page.getByRole('list', { name: 'Erwartete Einnahmen des Monats' });
  await expect(open).toContainText('Testprämie');
  await expect(page.getByText(/von erwartet 100,01/)).toBeVisible();
  await open.getByRole('button', { name: 'Kommt nicht mehr', exact: true }).click();
  const closed = page.getByRole('list', { name: 'Abgeschlossene Einnahmen des Monats' });
  await expect(closed).toContainText('Testprämie');
  await expect(closed).toContainText('Fehlbetrag 100,01');
  await expect(page.getByText(/von erwartet 0,00/)).toBeVisible();
  await expect(open).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(open).toContainText('Testprämie');
  await expect(page.getByText(/von erwartet 100,01/)).toBeVisible();
  await expect(closed).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setTheme(page, 'dark');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
