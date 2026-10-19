import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { openDatabase, schema } from '@budget/db';
import { test } from './isolated-ledger';

test.setTimeout(180_000);

async function post(request: APIRequestContext, origin: string, path: string, data: unknown) {
  const response = await request.post(`${origin}/api${path}`, { headers: { origin }, data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
/** "≈ 24,68 €" / "−1.234,50 €" to cents; read from the rendered depot page. */
function cents(text: string): number {
  const match = /([−-])?\s*(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/.exec(text.replace('≈', ''));
  expect(match, text).not.toBeNull();
  const value = Number(match![2]!.replaceAll('.', '')) * 100 + Number(match![3]);
  return match![1] ? -value : value;
}
/** The sidebar shows whole euros: the page's cents rounded to the euro. */
const wholeEuro = (value: number) => Math.round(value / 100);
const sidebarRow = (page: Page, name: string): Locator =>
  page.locator('.acct-tree .acct-item', { hasText: name });
const groupSum = (page: Page, group: string): Locator =>
  page
    .locator(`#acct-tree-${group}`)
    .locator('xpath=ancestor::section')
    .locator('.acct-group-bar > .acct-amount');

// Same ledger as the depot template: own depot cash -26,90 (buy 24,68, fee 0,99, booking 1,23)
// and positions worth 24,68, so cash plus positions would read -2,22 and show "−2 €".
async function seed(request: APIRequestContext, origin: string) {
  const cash = (
    await post(request, origin, '/accounts', {
      name: 'Testverrechnung',
      type: 'checking',
      openingDate: '2026-01-01',
      openingBalanceCents: 12345,
    })
  ).account;
  const depot = (
    await post(request, origin, '/accounts', {
      name: 'Testdepot',
      type: 'brokerage',
      openingDate: '2026-01-01',
      referenceAccountId: cash.id,
    })
  ).account;
  const security = (
    await post(request, origin, '/securities', {
      name: 'Testinstrument',
      kind: 'stock',
      currency: 'EUR',
    })
  ).security;
  await post(request, origin, '/trades', {
    accountId: depot.id,
    securityId: security.id,
    date: '2026-09-17',
    kind: 'buy',
    unitsE8: 200_000_000,
    amountCents: 2468,
    feeCents: 99,
    taxCents: 0,
  });
  await post(request, origin, '/bookings', {
    type: 'booking',
    accountId: cash.id,
    date: '2026-09-17',
    amountCents: -500,
    memo: 'Testverrechnung Buchung',
    splits: [{ amountCents: -500, categoryId: null }],
  });
  await post(request, origin, '/bookings', {
    type: 'booking',
    accountId: depot.id,
    date: '2026-09-17',
    amountCents: -123,
    memo: 'Testbewegung',
    splits: [{ amountCents: -123, categoryId: null }],
  });
  return { cash, depot };
}

for (const theme of ['light', 'dark'] as const) {
  test(`sidebar shows the Depotwert of the depot page, the Verrechnungskonto its cash (${theme})`, async ({
    page,
    request,
    isolatedLedger,
    isMobile,
  }) => {
    const origin = isolatedLedger.origin;
    const { cash, depot } = await seed(request, origin);
    await page.goto(`/konten/${depot.id}`);
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    const value = page.getByTestId('depot-value');
    await expect(value).toHaveText(/24,68/);
    await expect(page.getByTestId('depot-cash')).toHaveText('Bargeld im Depotkonto: −26,90 €');
    await fits(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    if (isMobile) {
      // The account tree lives in the desktop sidebar; the phone has the tab bar only.
      await expect(page.locator('.acct-tree')).toBeHidden();
      return;
    }
    // Literal, independent of the implementation: 24,68 of positions, rounded to the euro.
    const depotAmount = sidebarRow(page, 'Testdepot').locator('.acct-amount');
    await expect(depotAmount).toHaveText('25 €');
    await expect(depotAmount).not.toHaveClass(/is-neg/);
    // Same number as the page for the same date (the page in cents, the sidebar in whole euros).
    expect(wholeEuro(cents((await value.textContent())!))).toBe(25);
    // The settlement account keeps its cash balance: 123,45 opening minus 5,00.
    await expect(sidebarRow(page, 'Testverrechnung').locator('.acct-amount')).toHaveText('118 €');
    // The Investments sum adds the shown figure (the depot's own cash is not part of it).
    await expect(groupSum(page, 'investments')).toHaveText('25 €');

    // The Verrechnungskonto page shows the same sidebar numbers.
    await page.goto(`/konten/${cash.id}`);
    await expect(sidebarRow(page, 'Testdepot').locator('.acct-amount')).toHaveText('25 €');
    expect((await new AxeBuilder({ page }).include('.acct-tree').analyze()).violations).toEqual([]);
  });
}

test('a partly unpriced depot shows ≈ in the sidebar like on its page, an unpriced one a dash', async ({
  page,
  request,
  isolatedLedger,
  isMobile,
}) => {
  const origin = isolatedLedger.origin;
  const { depot } = await seed(request, origin);
  const unpriced = (
    await post(request, origin, '/securities', {
      name: 'Testcoin',
      kind: 'crypto',
      currency: 'EUR',
    })
  ).security;
  const crypto = (
    await post(request, origin, '/accounts', {
      name: 'Testkrypto',
      type: 'crypto',
      openingDate: '2026-01-01',
    })
  ).account;
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    for (const [id, accountId] of [
      ['partly-unpriced', depot.id],
      ['all-unpriced', crypto.id],
    ] as const)
      opened.db
        .insert(schema.holding)
        .values({
          id,
          accountId,
          securityId: unpriced.id,
          asOf: '2026-09-17',
          unitsE8: 100_000_000,
        })
        .run();
  } finally {
    opened.close();
  }

  await page.goto(`/konten/${depot.id}`);
  await expect(page.getByTestId('depot-value')).toHaveText(/^≈ .*24,68/);
  await fits(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (isMobile) return;
  await expect(sidebarRow(page, 'Testdepot').locator('.acct-amount')).toHaveText('≈ 25 €');
  // No position of the crypto account has a price: the page says "Unvollständig", the tree a dash.
  await expect(sidebarRow(page, 'Testkrypto').locator('.acct-amount')).toHaveText('–');
  await page.goto(`/konten/${crypto.id}`);
  await expect(page.getByTestId('depot-value')).toHaveText('≈ Unvollständig');
  await expect(sidebarRow(page, 'Testkrypto').locator('.acct-amount')).toHaveText('–');
  // One unknown figure makes the Investments sum unknown instead of a wrong number.
  await expect(groupSum(page, 'investments')).toHaveText('–');
});
