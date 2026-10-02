import type { Page } from '@playwright/test';
import { sampleTest as test, expect } from './sample';
import type { AccountList } from '../apps/web/src/ledger/types';
import type { NetWorthView } from '../apps/web/src/wealth/api';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';

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
    await expect(page.getByTestId('net-worth')).toHaveText(text);
  }
  await screenshot(page);
});

for (const [value, text] of [
  [12_345, '123,45 €'],
  [-12_345, '−123,45 €'],
] as const) {
  test(`Konten includes closed residual ${value} and links the chain term to it`, async ({
    page,
  }) => {
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
              name: 'Closed residual',
              closedAt: '2026-09-01T00:00:00Z',
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

    await page.goto('/konten');
    await expect(page.getByTestId('net-worth')).toHaveText(text);
    // Closed accounts sit in a collapsed "Geschlossen" section; the chain term opens it.
    await expect(page.getByText('Closed residual')).toBeHidden();
    const term = page.getByRole('button', { name: /Geschlossene Konten/ });
    await expect(term).toBeVisible();
    await term.click();
    await expect(page.locator('#kaccts-closed')).toHaveClass(/is-flash/);
    await expect(page.getByText('Closed residual')).toBeVisible();
  });
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
