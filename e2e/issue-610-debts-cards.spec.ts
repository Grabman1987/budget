import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { test } from './isolated-ledger';

/**
 * #610: credit cards count as debt and are "laufend ausgeglichen" in the repayment table; the
 * Restschuld equals the sum of the negative accounts shown in Konten (cent for cent).
 */

/** `−1.234,56 €` (real minus, thin or no-break spaces) to integer cents. */
const toCents = (text: string) => {
  const m = text.replace(/\s/g, '').match(/^([-−])?([\d.]*\d),(\d{2})/);
  if (!m) throw new Error(`Not a money text: ${text}`);
  const cents = Number(m[2]!.replaceAll('.', '')) * 100 + Number(m[3]);
  return m[1] ? -cents : cents;
};

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('Schulden: cards are debt, "laufend ausgeglichen", Restschuld = negative accounts in Konten', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  test.setTimeout(120_000);
  const origin = isolatedLedger.origin;
  const create = async (data: Record<string, unknown>) => {
    const response = await request.post(`${origin}/api/accounts`, {
      headers: { origin },
      data: { openingDate: '2026-09-01', ...data },
    });
    expect(response.ok(), await response.text()).toBe(true);
  };
  // Positive 500,00; negative 150,25 + 300,10 + 1.000,00 = 1.450,35 (derived by hand).
  await create({
    name: 'Gehaltskonto Beispiel',
    type: 'checking',
    role: 'budget',
    onBudget: true,
    openingBalanceCents: 50_000,
  });
  await create({
    name: 'Überzug Beispiel',
    type: 'checking',
    role: 'budget',
    onBudget: true,
    openingBalanceCents: -15_025,
  });
  await create({ name: 'Karte Beispiel', type: 'credit_card', openingBalanceCents: -30_010 });
  await create({
    name: 'Kredit Beispiel',
    type: 'loan',
    openingBalanceCents: -100_000,
    interestRateBp: 1200,
    installmentCents: 60_000,
    monthlyFeeCents: 0,
    originalAmountCents: 200_000,
  });

  // Konten: the negative account values and the net worth.
  await page.goto('/konten');
  await expect(page.getByTestId('net-worth')).toBeVisible();
  const negatives = (await page.locator('.krow .kc-num.is-neg').allTextContents()).map(toCents);
  const positives = (await page.locator('.krow .kc-num:not(.is-neg)').allTextContents()).map(
    toCents,
  );
  expect(negatives.slice().sort((a, b) => a - b)).toEqual([-100_000, -30_010, -15_025]);
  expect(positives).toEqual([50_000]);
  expect(toCents(await page.getByTestId('net-worth').innerText())).toBe(-95_035);
  await noHorizontalScroll(page);

  // Schulden: Restschuld is exactly the sum of the negative accounts, the card included.
  await page.goto('/vermoegen/schulden');
  await expect(page.getByTestId('debt-total')).toHaveText('1.450,35 €');
  expect(toCents(await page.getByTestId('debt-total').innerText())).toBe(
    -negatives.reduce((sum, v) => sum + v, 0),
  );
  const overview = page.locator('.debt-overview');
  const cardRow = overview.locator('tbody tr', {
    has: page.getByRole('link', { name: 'Karte Beispiel' }),
  });
  await expect(cardRow).toContainText('Kreditkarte');
  await expect(cardRow).toContainText('laufend ausgeglichen');
  await expect(cardRow).not.toContainText('Konditionen fehlen');
  await expect(cardRow.locator('td[data-label="Restschuld"]')).toContainText('300,10 €');
  await expect(overview).not.toContainText('Konditionen fehlen');
  // The loan alone has terms, so the payoff date is shown and no "Konditionen ergänzen" prompt.
  await expect(page.getByRole('heading', { name: /^Schuldenfrei am / })).toBeVisible();
  await expect(overview.getByRole('link', { name: 'Konditionen ergänzen' })).toHaveCount(0);

  // Heute: no terms task for the card.
  const heute = await (await page.request.get('/api/heute')).json();
  expect(heute.attention.loanTermsMissing).toBe(false);

  if (info.project.name !== 'desktop') {
    const summary = page.locator('.debt-adjustments > summary');
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  for (const scheme of ['light', 'dark'] as const) {
    await page.evaluate((t) => {
      document.documentElement.dataset['theme'] = t;
    }, scheme);
    expect((await new AxeBuilder({ page }).include('.debts-view').analyze()).violations).toEqual(
      [],
    );
    await noHorizontalScroll(page);
  }
});

test('Schulden: a lone card without terms stays quiet and matches Konten to the cent', async ({
  page,
  request,
  isolatedLedger,
}) => {
  const origin = isolatedLedger.origin;
  const response = await request.post(`${origin}/api/accounts`, {
    headers: { origin },
    data: {
      name: 'Karte Beispiel',
      type: 'credit_card',
      openingDate: '2026-09-01',
      openingBalanceCents: -30_010,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);

  await page.goto('/vermoegen/schulden');
  await expect(page.getByTestId('debt-total')).toHaveText('300,10 €');
  const overview = page.locator('.debt-overview');
  await expect(overview).toContainText('laufend ausgeglichen');
  await expect(overview).not.toContainText('Konditionen fehlen');
  await expect(overview.getByRole('link', { name: 'Konditionen ergänzen' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Tilgungsplan', exact: true })).toBeVisible();
  const heute = await (await page.request.get('/api/heute')).json();
  expect(heute.attention.loanTermsMissing).toBe(false);

  // The same amount is the only negative value in Konten.
  await page.goto('/konten');
  await expect(page.getByTestId('net-worth')).toBeVisible();
  expect((await page.locator('.krow .kc-num.is-neg').allTextContents()).map(toCents)).toEqual([
    -30_010,
  ]);
  expect(toCents(await page.getByTestId('net-worth').innerText())).toBe(-30_010);
  await noHorizontalScroll(page);
});
