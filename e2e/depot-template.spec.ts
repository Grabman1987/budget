import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { openDatabase, schema } from '@budget/db';
import { mkdirSync } from 'node:fs';
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

async function seedDepot(request: APIRequestContext, origin: string) {
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
  const trade = await post(request, origin, '/trades', {
    accountId: depot.id,
    securityId: security.id,
    date: '2026-09-17',
    kind: 'buy',
    unitsE8: 200_000_000,
    amountCents: 2468,
    feeCents: 99,
    taxCents: 0,
  });
  const booking = await post(request, origin, '/bookings', {
    type: 'booking',
    accountId: cash.id,
    date: '2026-09-17',
    amountCents: -500,
    memo: 'Testverrechnung Buchung',
    splits: [{ amountCents: -500, categoryId: null }],
  });
  const ordinary = await post(request, origin, '/bookings', {
    type: 'booking',
    accountId: depot.id,
    date: '2026-09-17',
    amountCents: -123,
    memo: 'Testbewegung',
    splits: [{ amountCents: -123, categoryId: null }],
  });
  return { cash, depot, security, trade, booking, ordinary };
}

for (const theme of ['light', 'dark'] as const) {
  test(`depot ${theme}: header, holdings, trades and settlement retain URL state`, async ({
    page,
    request,
    isolatedLedger,
    isMobile,
  }, info) => {
    const origin = isolatedLedger.origin;
    const { depot, trade, booking } = await seedDepot(request, origin);
    await page.goto(`/konten/${depot.id}`);
    await expect(page.getByTestId('depot-value')).toHaveText(/24,68/);
    await expect(page.getByTestId('depot-settlement')).toContainText('118,45');
    // Own cash includes the EUR 24.68 buy, EUR 0.99 fee and EUR 1.23 ordinary booking.
    await expect(page.getByTestId('depot-cash')).toHaveText('Bargeld im Depotkonto: −26,90 €');
    await expect(page.getByRole('link', { name: 'Bestände', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('link', { name: 'Rendite im Portfolio' })).toHaveAttribute(
      'href',
      '/vermoegen/portfolio',
    );
    await expect(page.locator('.depot-table')).toContainText('12,34');
    await expect(page.getByText(/Heute · Saldo/)).toHaveCount(0);
    await expect(page.getByTestId('account-balance')).toHaveCount(0);
    const positions = await (await request.get(`${origin}/api/portfolio/positions`)).json();
    expect(positions.valueCents).toBe(2468);
    expect(positions.positions[0].accounts[0].unitsE8).toBe(200_000_000);
    await page.evaluate(
      (theme) => document.documentElement.setAttribute('data-theme', theme),
      theme,
    );
    for (const [tab, query] of [
      ['Bestände', 'bestaende'],
      ['Trades', 'trades'],
      ['Verrechnung', 'verrechnung'],
    ]) {
      await page.getByRole('link', { name: tab, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`depot=${query}`));
      await page.reload();
      await page.evaluate(
        (theme) => document.documentElement.setAttribute('data-theme', theme),
        theme,
      );
      await expect(page.getByRole('link', { name: tab, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      if (tab === 'Trades') {
        await expect(page.locator('.depot-trades')).toContainText('24,68');
        await page.getByText('Details', { exact: true }).click();
        await expect(page.locator('.depot-trades')).toContainText('0,99');
        await expect(page.locator('.depot-trades')).toContainText('Steuern: 0,00');
      }
      if (tab === 'Verrechnung') {
        await expect(page.locator(`[data-booking="${booking.id}"]`)).toContainText(
          'Testverrechnung Buchung',
        );
        await expect(page.locator(`[data-booking="${trade.bookingId}"]`)).toHaveCount(0);
      }
      await fits(page);
      expect((await new AxeBuilder({ page }).include('.depot').analyze()).violations).toEqual([]);
      if (isMobile) {
        const undersized = await page
          .locator('.depot a, .depot button, .depot summary')
          .evaluateAll((nodes) =>
            nodes
              .filter((node) => {
                const rect = node.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
              })
              .map((node) => node.textContent),
          );
        expect(undersized).toEqual([]);
      }
      mkdirSync('docs/evidence/depot-template', { recursive: true });
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        window.scrollTo(0, 0);
      });
      await page.waitForFunction(() => window.scrollY === 0);
      await page.screenshot({
        path: `docs/evidence/depot-template/${info.project.name}-${theme}-${query}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  });
}

test('depot trade row reuses the editor, browser back and settlement navigation', async ({
  page,
  request,
  isolatedLedger,
}) => {
  const { cash, depot, security, trade, ordinary } = await seedDepot(
    request,
    isolatedLedger.origin,
  );
  await page.goto(`/konten/${depot.id}?depot=trades`);
  await expect(page.getByRole('button', { name: 'Kauf bearbeiten' })).toBeVisible();
  await page.locator('.depot-trades tbody tr td').first().click();
  await expect(page).toHaveURL(new RegExp(`/vermoegen/portfolio/instrument/${security.id}`));
  await expect(page.getByRole('dialog', { name: 'Handel bearbeiten' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('link', { name: 'Trades', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByTestId('depot-settlement').getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/konten/${cash.id}$`));
  await expect(page.getByTestId('account-balance')).toBeVisible();
  await page.goto('/konten/buchungen');
  await expect(page.locator(`[data-booking="${trade.bookingId}"] .kcat.is-none`)).toHaveCount(0);
  await expect(page.locator(`[data-booking="${trade.bookingId}"]`)).toContainText('Trade');
  await expect(page.locator(`[data-booking="${ordinary.id}"] .kcat.is-none`)).toContainText(
    'ohne Kategorie',
  );
});

test('crypto without settlement marks missing quotes per row and incomplete depot value', async ({
  page,
  request,
  isolatedLedger,
}) => {
  const origin = isolatedLedger.origin;
  const depot = (
    await post(request, origin, '/accounts', {
      name: 'Testkrypto',
      type: 'crypto',
      openingDate: '2026-01-01',
    })
  ).account;
  const security = (
    await post(request, origin, '/securities', {
      name: 'Testcoin',
      kind: 'crypto',
      currency: 'EUR',
    })
  ).security;
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    opened.db
      .insert(schema.holding)
      .values({
        id: 'missing',
        accountId: depot.id,
        securityId: security.id,
        asOf: '2026-09-17',
        unitsE8: 100_000_000,
      })
      .run();
  } finally {
    opened.close();
  }
  await page.goto(`/konten/${depot.id}`);
  await expect(page.getByTestId('depot-value')).toHaveText('≈ Unvollständig');
  await expect(page.locator('.depot-table tbody tr')).toContainText('Kurs fehlt');
  await expect(page.locator('.depot-table tbody tr')).not.toContainText('0,00');
  await expect(page.getByTestId('depot-settlement')).toHaveCount(0);
  await expect(page.getByTestId('depot-cash')).toHaveCount(0);
  await page.getByRole('link', { name: 'Verrechnung', exact: true }).click();
  await expect(page.getByText('Kein separates Verrechnungskonto verknüpft.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Buchungen', exact: true })).toBeVisible();
  await expect(page.getByText('Noch keine Buchungen auf diesem Konto.')).toBeVisible();
  await fits(page);
});
