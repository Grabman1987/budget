import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import {
  cents,
  formatEuro,
  paymentsPreview,
  type PreviewPayment,
  type PaymentsPreview,
} from '@budget/domain';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sampleTest } from './sample';
const payment: PreviewPayment = {
  id: 'synthetic',
  name: 'Testvertrag',
  kind: 'outflow',
  contactShareBp: 0,
  rhythm: 'monthly',
  dueDay: 1,
  dueMonth: null,
  dateShift: 'none',
  startDate: null,
  endDate: null,
  categoryName: 'Wohnen',
  categoryClass: 'need',
  categoryKind: 'fixed',
  versions: [
    { validFrom: '2026-11-01', amountCents: 10000, amountMaxCents: null, currency: 'EUR' },
    { validFrom: '2027-01-01', amountCents: 12000, amountMaxCents: null, currency: 'EUR' },
  ],
};
const fixture = () =>
  paymentsPreview(
    '2026-10-02',
    [
      payment,
      {
        ...payment,
        id: 'annual',
        name: 'Jahresvertrag',
        rhythm: 'yearly',
        dueMonth: 3,
        categoryKind: 'periodic',
        versions: [
          { validFrom: '2026-11-01', amountCents: 30000, amountMaxCents: null, currency: 'EUR' },
        ],
      },
    ],
    [],
  );
async function inspect(page: Page, info: TestInfo, label: string) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    document.querySelector('.preview-scroll')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const dir = process.env['BUDGET_PAYMENTS_PREVIEW_EVIDENCE'];
    if (dir) mkdirSync(dir, { recursive: true });
    await page.screenshot({
      fullPage: true,
      animations: 'disabled',
      path: dir
        ? join(dir, `${label}-${theme}-${info.project.name}.png`)
        : info.outputPath(`${label}-${theme}.png`),
    });
  }
}

test('literal contract calendar, chart, lead and keyboard scroll agree across twelve full months', async ({
  page,
}, info) => {
  await page.route('**/api/expected/year-preview', (route) => route.fulfill({ json: fixture() }));
  await page.goto('/reports/vorschau');
  await expect(page.getByTestId('preview-total')).toHaveText('1.700,00 €');
  await expect(page.getByRole('heading', { name: 'November 2026 bis Oktober 2027' })).toBeVisible();
  await expect(page.getByText('Teuerster Monat: März 2027 · Basisbetrag')).toBeVisible();
  await expect(page.getByText('Ø je Monat: 141,67 €')).toBeVisible();
  const table = page.locator('.preview-table');
  await expect(table.locator('thead th')).toHaveCount(14);
  const totals = table.locator('.preview-sum td');
  await expect(totals.nth(0)).toHaveText('100,00');
  await expect(totals.nth(2)).toHaveText('120,00');
  await expect(totals.nth(4)).toHaveText('420,00');
  await expect(totals.last()).toHaveText('1.700,00');
  const region = page.getByRole('region', {
    name: 'Zahlungskalender, seitlich scrollbar',
    exact: true,
  });
  await region.focus();
  await expect(region).toBeFocused();
  if (await region.evaluate((el) => el.scrollWidth > el.clientWidth)) {
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  }
  await page.locator('.preview-events summary').first().click();
  await expect(page.getByText('Erwartet · projiziert').first()).toBeVisible();
  await inspect(page, info, 'preview-literal');
});

test('foreign range, ambiguous stored expectation, actual booking, empty and failed retry states', async ({
  page,
}, info) => {
  let mode = 'foreign';
  const foreign = paymentsPreview(
    '2026-10-02',
    [
      {
        ...payment,
        versions: [
          { validFrom: '2026-11-01', amountCents: 10000, amountMaxCents: 15000, currency: 'USD' },
        ],
      },
    ],
    [
      {
        paymentId: payment.id,
        dueDate: '2026-11-01',
        occurrenceId: 'occ',
        status: 'received',
        storedExpectedCents: -99999,
        bookingId: 'book',
        bookedAmountCents: -11000,
        bookedCurrency: 'EUR',
      },
    ],
  );
  await page.route('**/api/expected/year-preview', (route) =>
    mode === 'error'
      ? route.fulfill({
          status: 503,
          json: { error: 'unavailable', message: 'Synthetischer Fehler' },
        })
      : route.fulfill({
          json:
            mode === 'empty'
              ? paymentsPreview('2026-10-02', [], [])
              : mode === 'large'
                ? paymentsPreview(
                    '2026-10-02',
                    [
                      {
                        ...payment,
                        rhythm: 'yearly',
                        dueMonth: 3,
                        versions: [
                          {
                            validFrom: '2026-11-01',
                            amountCents: 9_007_199_254_740_990,
                            amountMaxCents: null,
                            currency: 'USD',
                          },
                        ],
                      },
                    ],
                    [],
                  )
                : foreign,
        }),
  );
  await page.goto('/reports/vorschau');
  await expect(
    page.getByText('Gesamtsumme in EUR nicht verfügbar.', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('.preview-table tbody tr').first()).toContainText('100,00 bis 150,00');
  await page.locator('.preview-events summary').click();
  await expect(page.locator('.preview-events')).toContainText('−110,00 €');
  await expect(page.locator('.preview-events')).toContainText('Währung nicht sicher zuordenbar');
  await expect(page.locator('.preview-events')).not.toContainText('999');
  await inspect(page, info, 'preview-foreign-range');
  mode = 'large';
  await page.reload();
  await expect(page.locator('.preview-table tbody tr').first()).toContainText(
    '90.071.992.547.409,90',
  );
  await page.locator('.preview-events summary').click();
  await expect(page.locator('.preview-events')).toContainText('90.071.992.547.409,90 USD');
  mode = 'error';
  await page.reload();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('preview-total')).toHaveCount(0);
  mode = 'empty';
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(
    page.getByText('Keine gespeicherten erwarteten Auszahlungen in diesen zwölf Monaten.'),
  ).toBeVisible();
  await expect(page.getByTestId('preview-total')).toHaveText('0,00 €');
});

sampleTest(
  'real sample API drives every calendar month and report without a refresh write',
  async ({ page }, info) => {
    const writes: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/api/') && r.method() !== 'GET')
        writes.push(r.url());
    });
    const responsePromise = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/expected/year-preview',
    );
    await page.goto('/reports/vorschau');
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const data = (await response.json()) as PaymentsPreview;
    expect([data.from, data.to]).toEqual(['2026-10-01', '2027-09-30']);
    expect(data.rows.length).toBeGreaterThan(0);
    const eur = data.currencies.find((g) => g.currency === 'EUR')!;
    const formatted = (c: number) => formatEuro(cents(c));
    await expect(page.getByTestId('preview-total')).toHaveText(formatted(eur.total.baseCents));
    const cells = page.locator('.preview-sum').filter({ hasText: 'EUR' }).locator('td');
    for (let i = 0; i < 12; i++)
      await expect(cells.nth(i)).toHaveText(formatted(eur.months[i]!.baseCents).replace(' €', ''));
    expect(writes).toEqual([]);
    await inspect(page, info, 'preview-real-sample');
  },
);
