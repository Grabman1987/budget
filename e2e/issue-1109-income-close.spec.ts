import AxeBuilder from '@axe-core/playwright';
import {
  accounts,
  createBooking,
  createEntity,
  schema,
  createExpectedPayment,
  INCOME_TYPES,
  openDatabase,
} from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { setTheme } from './theme';

test.use({ ledgerToday: '2026-09-17' });

for (const receivedCents of [0, 7_501]) {
  test(`acknowledges an income occurrence already received with ${receivedCents} received cents and restores it with Undo`, async ({
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
      if (receivedCents > 0)
        createBooking(
          opened.db,
          {
            accountId: 'synthetic-giro',
            date: '2026-09-10',
            amountCents: receivedCents,
            splits: [{ incomeTypeId: INCOME_TYPES.side.id, amountCents: receivedCents }],
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
    await expect(
      page.getByText(receivedCents ? /von erwartet 175,02/ : /von erwartet 100,01/),
    ).toBeVisible();
    await open.getByRole('button', { name: 'Bereits erhalten', exact: true }).click();
    // Keep the ordinary focused toast available while Axe inspects the result.
    await page.getByRole('button', { name: 'Rückgängig', exact: true }).focus();
    const closed = page.getByRole('list', { name: 'Abgeschlossene Einnahmen des Monats' });
    await expect(closed).toContainText('Testprämie');
    await expect(closed).toContainText('Bereits erhalten');
    await expect(closed).toContainText('Planwert 100,01');
    await expect(page.getByText(/Fehlbetrag|Minderbetrag/)).toHaveCount(0);
    await expect(
      page.getByText(receivedCents ? /von erwartet 75,01/ : /von erwartet 0,00/),
    ).toBeVisible();
    await expect(page.getByTestId('income-received')).toContainText(
      receivedCents ? '75,01' : '0,00',
    );
    await expect(open).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
    await expect(open).toContainText('Testprämie');
    await expect(
      page.getByText(receivedCents ? /von erwartet 175,02/ : /von erwartet 100,01/),
    ).toBeVisible();
    await expect(closed).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setTheme(page, 'dark');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('links a proposed same-payer receipt once and restores the expectation with Undo', async ({
  page,
  isolatedLedger,
}) => {
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    const ctx = { actor: 'synthetic-1109' };
    accounts.create(
      opened.db,
      {
        id: 'test-giro',
        name: 'Testkonto',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-09-01',
      },
      ctx,
    );
    createEntity(opened.db, schema.payee, { id: 'test-payer', name: 'Testzahler' }, ctx);
    createBooking(
      opened.db,
      {
        accountId: 'test-giro',
        date: '2026-09-17',
        amountCents: 10001,
        payeeId: 'test-payer',
        splits: [{ incomeTypeId: INCOME_TYPES.side.id, amountCents: 10001 }],
      },
      ctx,
    );
    createExpectedPayment(
      opened.db,
      {
        name: 'Testprämie',
        kind: 'inflow',
        accountId: 'test-giro',
        payeeId: 'test-payer',
        incomeTypeId: INCOME_TYPES.side.id,
        dueDay: 20,
        startDate: '2026-09-01',
        dateWindowDays: 3,
      },
      { validFrom: '2026-09-01', amountCents: 10001 },
      ctx,
      '2026-09-17',
    );
  } finally {
    opened.close();
  }
  await page.goto('/plan/monat/einnahmen?monat=2026-09');
  await expect(page.getByText(/von erwartet 200,02/)).toBeVisible();
  const proposal = page.getByRole('button', { name: /Mit Zahlung vom.*100,01.*verknüpfen/ });
  await expect(proposal).toBeVisible();
  const bounds = await proposal.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (page.viewportSize()!.width < 768) expect(bounds!.height).toBeGreaterThanOrEqual(43.9);
  await proposal.click();
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).focus();
  await expect(page.getByText(/von erwartet 100,01/)).toBeVisible();
  await expect(page.getByTestId('income-received')).toContainText('100,01');
  await expect(page.getByRole('list', { name: 'Erwartete Einnahmen des Monats' })).toContainText(
    'eingegangen',
  );
  await expect(proposal).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(proposal).toBeVisible();
  await expect(page.getByText(/von erwartet 200,02/)).toBeVisible();
  await setTheme(page, 'dark');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
