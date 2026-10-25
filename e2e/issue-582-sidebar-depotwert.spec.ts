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
/** "≈ 24,68 €" / "−1.234,50 €" to cents; read from a rendered page. */
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
const treeSum = (page: Page, group: string): Locator =>
  page
    .locator(`#acct-tree-${group}`)
    .locator('xpath=ancestor::section')
    .locator('.acct-group-bar > .acct-amount');
const overviewSum = (page: Page, group: string): Locator =>
  page.locator(`tr.kgroup#kg-${group}`).getByTestId('account-group-value');
const overviewRow = (page: Page, name: string): Locator =>
  page.locator('tr.krow', { hasText: name });

// The group cell now also owns the source button; retain exact money-only text comparisons.
const overviewFigure = (page: Page, group: string) =>
  overviewSum(page, group).evaluate((cell) =>
    Array.from(cell.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join('')
      .trim(),
  );

// Same ledger as the depot template: own depot cash -26,90 (buy 24,68, fee 0,99, booking 1,23)
// and positions worth 24,68, so cash plus positions would read -2,22 and show "−2 €".
async function seed(request: APIRequestContext, origin: string, link = true) {
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
      ...(link ? { referenceAccountId: cash.id } : {}),
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
  test(`depot value in tree, overview and depot page; its cash on the Verrechnungskonto (${theme})`, async ({
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
    const pageCents = cents((await value.textContent())!);
    expect(pageCents).toBe(2468);
    await fits(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    if (!isMobile) {
      // The tree is the desktop sidebar (the phone has the tab bar only), whole euros.
      const depotAmount = sidebarRow(page, 'Testdepot').locator('.acct-amount');
      await expect(depotAmount).toHaveText('25 €');
      await expect(depotAmount).not.toHaveClass(/is-neg/);
      expect(wholeEuro(pageCents)).toBe(25);
      await expect(page.getByTestId('acct-cash')).toHaveCount(0);
      // 118,45 settlement cash - 26,90 depot cash = 91,55.
      await expect(sidebarRow(page, 'Testverrechnung').locator('.acct-amount')).toHaveText('92 €');
      await expect(treeSum(page, 'budget')).toHaveText('92 €');
      await expect(treeSum(page, 'investments')).toHaveText('25 €');
    } else {
      await expect(page.locator('.acct-tree')).toBeHidden();
    }

    // Konten › Übersicht: the same figures in cents; Nettovermögen 116,23 is unchanged.
    await page.goto('/konten');
    await expect(overviewRow(page, 'Testdepot').getByTestId('account-value')).toHaveText('24,68 €');
    expect(
      cents((await overviewRow(page, 'Testdepot').getByTestId('account-value').textContent())!),
    ).toBe(pageCents);
    await expect(overviewRow(page, 'Testverrechnung').getByTestId('account-value')).toHaveText(
      '91,55 €',
    );
    await page.getByRole('button', { name: 'Details zu Testverrechnung', exact: true }).click();
    await expect(
      page
        .locator('.overview-detail-facts > div')
        .filter({ has: page.getByText('Davon zugeordnetes Depot-Cash', { exact: true }) })
        .locator('dd'),
    ).toContainText('−26,90 €');
    await expect.poll(() => overviewFigure(page, 'investments')).toBe('24,68 €');
    const groupMarker = overviewSum(page, 'investments')
      .locator('..')
      .getByRole('button', { name: 'Bewertungsgrundlage · Investments', exact: true });
    await expect(groupMarker).toHaveText('≈');
    await groupMarker.focus();
    await expect(
      page.locator(`[id="${await groupMarker.getAttribute('aria-describedby')}"]`),
    ).toContainText('Brutto-Ausführung');
    await page.keyboard.press('Escape');
    await expect.poll(() => overviewFigure(page, 'budget')).toBe('91,55 €');
    await page.goto('/vermoegen/nettovermoegen');
    await expect(page.getByTestId('nw-figure')).toContainText('116,23');
    await page.goto('/konten');
    await expect(overviewRow(page, 'Testdepot')).toBeVisible();
    await fits(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    if (isMobile) return;

    // Tree group sum = overview group sum (whole euros vs cents), on every page.
    for (const group of ['budget', 'investments']) {
      const overview = cents((await overviewSum(page, group).textContent())!);
      await expect(treeSum(page, group)).toHaveText(`${wholeEuro(overview)} €`);
    }
    await page.goto(`/konten/${cash.id}`);
    await expect(sidebarRow(page, 'Testdepot').locator('.acct-amount')).toHaveText('25 €');
    expect((await new AxeBuilder({ page }).include('.acct-tree').analyze()).violations).toEqual([]);
  });
}

test('without a Verrechnungskonto the depot cash stays with the depot as a Cash line', async ({
  page,
  request,
  isolatedLedger,
  isMobile,
}) => {
  const origin = isolatedLedger.origin;
  const { depot } = await seed(request, origin, false);
  await page.goto('/konten');
  await expect(overviewRow(page, 'Testdepot').getByTestId('account-value')).toHaveText('24,68 €');
  await page.getByRole('button', { name: 'Details zu Testdepot', exact: true }).click();
  await expect(
    page
      .locator('.overview-detail-facts > div')
      .filter({
        has: page.getByText('Zusätzliches Cash im Depot (in Gruppensumme)', { exact: true }),
      })
      .locator('dd'),
  ).toContainText('−26,90 €');
  await expect(overviewRow(page, 'Testverrechnung').getByTestId('account-value')).toHaveText(
    '118,45 €',
  );
  // The Investments sum keeps the depot cash: 24,68 - 26,90 = -2,22.
  await expect.poll(() => overviewFigure(page, 'investments')).toBe('−2,22 €');
  await page.goto('/vermoegen/nettovermoegen');
  await expect(page.getByTestId('nw-figure')).toContainText('116,23');
  await page.goto('/konten');
  await expect(overviewRow(page, 'Testdepot')).toBeVisible();
  await fits(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (isMobile) return;
  await expect(sidebarRow(page, 'Testdepot').locator('.acct-amount')).toHaveText('25 €');
  await expect(page.getByTestId('acct-cash')).toHaveText('Cash −27 €');
  await expect(treeSum(page, 'investments')).toHaveText('−2 €');
  await expect(sidebarRow(page, 'Testverrechnung').locator('.acct-amount')).toHaveText('118 €');
  await page.goto(`/konten/${depot.id}`);
  await expect(page.getByTestId('depot-value')).toHaveText(/24,68/);
  expect((await new AxeBuilder({ page }).include('.acct-tree').analyze()).violations).toEqual([]);
});

test('a partly unpriced depot shows ≈ in tree and overview like on its page, an unpriced one a dash', async ({
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
  await page.goto('/konten');
  await expect(overviewRow(page, 'Testdepot').getByTestId('account-value')).toHaveText('≈ 24,68 €');
  await page.getByRole('button', { name: 'Details zu Testdepot', exact: true }).click();
  const partialMarker = page.locator('.overview-detail').getByRole('button', {
    name: 'Bewertungsgrundlage · Testdepot',
    exact: true,
  });
  await expect(partialMarker).toHaveText('≈');
  await partialMarker.focus();
  await expect(
    page.locator(`[id="${await partialMarker.getAttribute('aria-describedby')}"]`),
  ).toContainText('Bewertung fehlt');
  await page.keyboard.press('Escape');
  await expect(overviewRow(page, 'Testkrypto').getByTestId('account-value')).not.toHaveText(
    /\d,\d\d €/,
  );
  await fits(page);
  if (isMobile) return;
  await expect(sidebarRow(page, 'Testdepot').locator('.acct-amount')).toHaveText('≈ 25 €');
  // No position of the crypto account has a price: the page says "Unvollständig", the tree "≈ –".
  await expect(sidebarRow(page, 'Testkrypto').locator('.acct-amount')).toHaveText('≈ –');
  await page.goto(`/konten/${crypto.id}`);
  await expect(page.getByTestId('depot-value')).toHaveText('≈ Unvollständig');
  await expect(sidebarRow(page, 'Testkrypto').locator('.acct-amount')).toHaveText('≈ –');
  // One unknown figure makes the Investments sum unknown instead of a wrong number.
  await expect(treeSum(page, 'investments')).toHaveText('–');
});
