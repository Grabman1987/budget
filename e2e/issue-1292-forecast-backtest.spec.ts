import { openDatabase, schema } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { redesignEnabled } from './plan-redesign-controls';

test.use({ ledgerToday: '2026-03-12' });

test('opens the read-only forecast backtest and shows the exact historical miss', async ({
  page,
  isolatedLedger,
}) => {
  const known = { createdAt: '2026-01-31T00:00:00Z', updatedAt: '2026-01-31T00:00:00Z' };
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    opened.db
      .insert(schema.account)
      .values({
        id: 'synthetic-checking',
        name: 'Synthetisches Girokonto',
        role: 'budget',
        type: 'checking',
        onBudget: true,
        openingDate: '2026-02-01',
        openingBalanceCents: 10000,
        ...known,
      })
      .run();
    opened.db
      .insert(schema.booking)
      .values({
        id: 'synthetic-expense',
        accountId: 'synthetic-checking',
        amountCents: -1234,
        date: '2026-02-08',
        createdAt: '2026-02-08T09:00:00Z',
        updatedAt: '2026-02-08T09:00:00Z',
      })
      .run();
    opened.db
      .insert(schema.bookingSplit)
      .values({
        id: 'synthetic-expense-split',
        bookingId: 'synthetic-expense',
        amountCents: -1234,
      })
      .run();
  } finally {
    opened.close();
  }

  await page.goto('/plan/prognose');
  const summary = page.getByText('Prognose im Rückblick', { exact: true });
  const redesign = await redesignEnabled(page);
  if (process.env['A2_EXPECT_REDESIGN'] !== undefined)
    expect(redesign).toBe(process.env['A2_EXPECT_REDESIGN'] === '1');
  if (!redesign) {
    await expect(summary).toBeHidden();
    return;
  }
  await expect(summary).toBeVisible();
  const result = page.getByRole('table', { name: 'Größte Prognoseabweichungen' });
  await expect(result).toBeHidden();
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/liquidity/backtest') && response.request().method() === 'GET',
  );
  await summary.click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByText(/Mittlere absolute Abweichung bei 1 Kontomonat/)).toContainText(
    /Monatsende\s+12,34\s+€.*Tiefpunkt\s+12,34\s+€/,
  );
  await expect(
    result.getByRole('row', { name: /Synthetisches Girokonto.*Monatsende/ }),
  ).toContainText('Ungeplante Ausgabe');
  await expect(
    result.getByRole('row', { name: /Synthetisches Girokonto.*Tiefpunkt/ }),
  ).toContainText('08.02.');
});
