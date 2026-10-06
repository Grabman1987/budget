import { openDatabase, schema } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('Heute names only currently held securities without quotes or execution prices', async ({
  page,
  isolatedLedger,
}, info) => {
  test.setTimeout(120_000);
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    opened.db
      .insert(schema.account)
      .values({
        id: 'synthetic-depot',
        name: 'Synthetic depot',
        type: 'brokerage',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-01-01',
      })
      .run();
    opened.db
      .insert(schema.security)
      .values(
        ['held', 'closed', 'execution'].map((id) => ({
          id,
          name: `Synthetic ${id}`,
          kind: 'stock' as const,
          currency: 'EUR',
        })),
      )
      .run();
    opened.db
      .insert(schema.holding)
      .values([
        {
          id: 'held-h',
          accountId: 'synthetic-depot',
          securityId: 'held',
          asOf: '2026-01-01',
          unitsE8: 1e8,
          costBasisCents: 700,
        },
        {
          id: 'closed-h',
          accountId: 'synthetic-depot',
          securityId: 'closed',
          asOf: '2026-01-01',
          unitsE8: 1e8,
          costBasisCents: 500,
        },
        {
          id: 'closed-zero',
          accountId: 'synthetic-depot',
          securityId: 'closed',
          asOf: '2026-09-01',
          unitsE8: 0,
          costBasisCents: 0,
        },
      ])
      .run();
    opened.db
      .insert(schema.trade)
      .values({
        id: 'execution-buy',
        accountId: 'synthetic-depot',
        securityId: 'execution',
        date: '2026-01-03',
        kind: 'buy',
        unitsE8: 1e8,
        amountCents: 1_000,
        feeCents: 100,
      })
      .run();
  } finally {
    opened.close();
  }
  for (const theme of ['light', 'dark']) {
    await page.goto('/');
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    const section = page.getByRole('heading', { name: 'Nettovermögen · 12 Monate' }).locator('..');
    const hint = section.getByTestId('valuation-hint');
    await expect(hint).toContainText('Bewertung teilweise geschätzt: 1 Wertpapier ohne Kurs.');
    await expect(hint).toContainText('Betroffen: Synthetic held.');
    await expect(hint).not.toContainText('Synthetic closed');
    await expect(hint).not.toContainText('Synthetic execution');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await section.screenshot({
      path: info.outputPath(`valuation-hint-${theme}.png`),
      animations: 'disabled',
    });
  }
});
