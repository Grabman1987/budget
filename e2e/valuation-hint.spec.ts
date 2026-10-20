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
    const marker = section.getByRole('button', {
      name: 'Bewertungsgrundlage · Verlauf Nettovermögen · aktueller Stand',
      exact: true,
    });
    await expect(marker).toHaveText('≈');
    await marker.focus();
    const source = page.locator(`[id="${await marker.getAttribute('aria-describedby')}"]`);
    await expect(source).toBeVisible();
    await expect(source).toContainText('Synthetic held');
    await expect(source).toContainText('Einstandswert als Schätzung');
    await expect(source).not.toContainText('Synthetic closed');
    // A usable execution may be explained locally, but never creates quote work.
    await expect(source).toContainText('Synthetic execution');
    await expect(source).toContainText('Brutto-Ausführung vom 03.01.2026');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('valuation-hint')).toHaveCount(0);
    await expect(page.getByText('1 Wertpapier ohne aktuellen Kurs', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Kurse prüfen', exact: true })).toHaveCount(1);
    const response = await page.request.get('/api/heute');
    expect(response.status()).toBe(200);
    const current = (await response.json()) as {
      attention: { quoteReview: { count: number; securityIds: string[] } };
      valuationSources: Array<{
        securityId: string | null;
        kind: string;
        quoteNeeded: boolean;
      }>;
    };
    expect(current.attention.quoteReview).toEqual({ count: 1, securityIds: ['held'] });
    expect(current.valuationSources.find((item) => item.securityId === 'held')).toMatchObject({
      kind: 'cost',
      quoteNeeded: true,
    });
    expect(current.valuationSources.filter((item) => item.securityId === 'closed')).toHaveLength(0);
    expect(current.valuationSources.find((item) => item.securityId === 'execution')).toMatchObject({
      kind: 'execution',
      quoteNeeded: false,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await section.screenshot({
      path: info.outputPath(`valuation-hint-${theme}.png`),
      animations: 'disabled',
    });
  }
});
