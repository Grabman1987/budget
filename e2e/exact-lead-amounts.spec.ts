import type { Page } from '@playwright/test';
import { openDatabase, schema } from '@budget/db';
import { test as isolatedTest } from './isolated-ledger';
import { sampleTest as test, expect } from './sample';
import type { AccountList } from '../apps/web/src/ledger/types';
import type { NetWorthView } from '../apps/web/src/wealth/api';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';

// The shell can still be reading the intercepted endpoint when the last assertion finishes.
// Complete those handlers before Playwright closes the page; keep every exact-cent assertion.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});

// Literal expected strings are independent of the application's formatter. In particular,
// fractions >= 50 cents must never round the whole-euro part of the same displayed amount.
const cases = [
  [0, '0,00 €'],
  [1, '0,01 €'],
  [-1, '−0,01 €'],
  [10_049, '100,49 €'],
  [10_050, '100,50 €'],
  [10_099, '100,99 €'],
  [-10_050, '−100,50 €'],
  [-10_099, '−100,99 €'],
  [99_999, '999,99 €'],
  [100_000, '1.000,00 €'],
  [-99_999, '−999,99 €'],
  [-100_000, '−1.000,00 €'],
] as const;

async function screenshot(page: Page) {
  const path = test.info().outputPath('exact-lead-amount.png');
  await page.screenshot({ path, fullPage: true });
  await test.info().attach('Exact lead amount', { path, contentType: 'image/png' });
}

// The top-bar overspent chip and other shell queries can still be in flight through a
// route.fetch stub when a test ends; drop the stubs so teardown does not abort them.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('Konten shows exact cents at rounding, sign and grouping boundaries', async ({ page }) => {
  let value = 0;
  await page.route(/\/api\/accounts(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const data = (await response.json()) as AccountList;
    const account = data.accounts.find((a) => a.type === 'checking' && !a.closedAt);
    expect(account).toBeDefined();
    await route.fulfill({
      response,
      json: {
        ...data,
        accounts: [
          {
            ...account,
            balanceCents: value,
            holdingsCents: 0,
            valueEurCents: value,
            missingFxCurrencies: [],
          },
        ],
        netWorthEurCents: value,
        missingFxCurrencies: [],
      },
    });
  });
  for (const [cents, text] of cases) {
    value = cents;
    await page.goto('/konten');
    await expect(page.getByTestId('budget-accounts-balance')).toHaveText(text);
  }
  await screenshot(page);
});

for (const [value, text] of [
  [12_345, '123,45 €'],
  [-12_345, '−123,45 €'],
] as const) {
  isolatedTest(
    `Closed residual ${value} remains in wealth and account management`,
    async ({ page, isolatedLedger }) => {
      const opened = openDatabase(isolatedLedger.databasePath);
      try {
        opened.db
          .insert(schema.account)
          .values({
            id: 'closed-residual',
            name: 'Closed residual',
            type: 'checking',
            role: 'budget',
            onBudget: true,
            openingDate: '2026-09-01',
            closedAt: '2026-09-01T00:00:00Z',
            openingBalanceCents: value,
          })
          .run();
      } finally {
        opened.close();
      }
      const response = await page.request.get('/api/accounts');
      expect(response.status()).toBe(200);
      expect(((await response.json()) as AccountList).netWorthEurCents).toBe(value);
      await page.goto('/konten');
      await expect(page.getByText('Closed residual')).toBeHidden();
      const term = page.getByRole('link', { name: 'Vermögen ansehen', exact: true });
      await expect(term).toBeVisible();
      await term.click();
      await expect(page.getByTestId('nw-figure')).toHaveText(text);
      await page.goto('/einstellungen/konten');
      await expect(page.getByRole('heading', { name: /Geschlossene Konten/ })).toBeVisible();
      await expect(page.getByText('Closed residual', { exact: true })).toBeVisible();
    },
  );
}

test('Vermögen shows exact cents at rounding, sign and grouping boundaries', async ({ page }) => {
  let value = 0;
  await page.route(/\/api\/wealth\/networth\?/, async (route) => {
    const response = await route.fetch();
    const data = (await response.json()) as NetWorthView;
    data.chain.nowCents = value;
    await route.fulfill({ response, json: data });
  });
  for (const [cents, text] of cases) {
    value = cents;
    await page.goto('/vermoegen/nettovermoegen');
    await expect(page.getByTestId('nw-figure')).toHaveText(text);
  }
  await screenshot(page);
});

test('Plan shows exact cents at rounding, sign and grouping boundaries', async ({ page }) => {
  let value = 0;
  await page.route(/\/api\/budget\/\d{4}-\d{2}(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const data = (await response.json()) as BudgetMonthView;
    data.summary.toBeAssignedCents = value;
    await route.fulfill({ response, json: data });
  });
  for (const [cents, text] of cases) {
    value = cents;
    await page.goto('/plan/monat');
    await expect(page.getByTestId('to-be-assigned')).toHaveText(text);
  }
  await screenshot(page);
});
