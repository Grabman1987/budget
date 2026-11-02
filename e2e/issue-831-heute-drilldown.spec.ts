import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';
import type { Heute } from '../apps/web/src/heute/api';
import { eur } from '../apps/web/src/ledger/format';
import { MIN_TARGET_PX } from './ledger-helpers';

test('lead → exact terms → category/payment → return retains viewed month and source scope without writes', async ({
  page,
}, info) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname.startsWith('/api/') &&
      !['GET', 'HEAD'].includes(request.method())
    )
      writes.push(request.method() + ' ' + new URL(request.url()).pathname);
  });
  await page.goto('/?monat=2026-08&period=month');
  await expect(page.locator('.app')).toBeVisible();
  const redesign = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  await expect(page.getByTestId('heute-kennzahlen')).toBeVisible();
  if (!redesign) {
    await expect(page.locator('.heute--redesign')).toHaveCount(0);
    await expect(page.getByTestId('heute-lead-value')).toHaveCount(0);
    await page.getByRole('button', { name: 'Herleitung zeigen', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Alle Rechenschritte und Quellen' })).toHaveCount(
      0,
    );
    expect(writes).toEqual([]);
    return;
  }
  await expect(page.getByTestId('heute-lead-value')).toBeVisible();
  const source = await page.request.get('/api/heute?month=2026-08&period=month');
  expect(source.ok()).toBe(true);
  const data = (await source.json()) as Heute;
  await expect(page.getByTestId('heute-lead-value')).toHaveText(eur(data.lead.freeCents));
  await page.getByRole('button', { name: 'Herleitung zeigen', exact: true }).click();
  await page.getByRole('link', { name: 'Alle Rechenschritte und Quellen' }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/heute/details/free' &&
      url.searchParams.get('monat') === '2026-08' &&
      url.searchParams.get('period') === 'month',
  );
  await expect(
    page.getByRole('heading', { name: 'Frei bis Gehalt · Herleitung', exact: true }),
  ).toBeFocused();
  const detail = page.locator('.heute-dimension');
  for (const amount of [
    data.lead.needCents,
    data.lead.wantCents,
    data.lead.openCents,
    data.lead.freeCents,
  ]) {
    await expect(detail).toContainText(eur(amount));
  }
  await expect(detail).toContainText('EUR');
  await expect(detail).toContainText('35 Tagen');
  const need = page.getByRole('region', { name: 'Bedarf', exact: true }).getByRole('link').first();
  const target = new URL((await need.getAttribute('href'))!, page.url());
  expect(target.searchParams.get('monat')).toBe('2026-09');
  await need.click();
  await expect(page.getByRole('link', { name: 'Zurück zur Heute-Herleitung' })).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: 'Frei bis Gehalt · Herleitung', exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('link', { name: 'Zurück zur Heute-Herleitung' })).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: 'Zurück zur Heute-Herleitung' }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname === '/heute/details/free' && url.searchParams.get('monat') === '2026-08',
  );
  const payment = page
    .getByRole('region', { name: 'Offen bis Gehalt', exact: true })
    .getByRole('link')
    .first();
  await expect(payment).toBeVisible();
  await payment.click();
  await expect(page).toHaveURL((url) => /^\/plan\/erwartet\/[^/]+$/.test(url.pathname));
  await page.getByRole('link', { name: 'Zurück zur Heute-Herleitung' }).click();
  await page.getByRole('link', { name: 'Kontoprognose · 35 Tage vergleichen' }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname === '/plan/prognose' && url.searchParams.get('horizon') === '35d',
  );
  await page.getByRole('link', { name: 'Zurück zur Heute-Herleitung' }).click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Frei bis Gehalt · Herleitung', exact: true }),
  ).toBeVisible();
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    const linkBox = (await page
      .getByRole('link', { name: 'Zurück zu Heute', exact: true })
      .boundingBox())!;
    expect(linkBox.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    await page.screenshot({
      path: info.outputPath(`831-explanation-${colorScheme}.png`),
      fullPage: true,
    });
  }
  await page.getByRole('link', { name: 'Zurück zu Heute', exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/' &&
      url.searchParams.get('monat') === '2026-08' &&
      url.searchParams.get('period') === 'month',
  );
  expect(writes).toEqual([]);
});

test('investment sources retain account returns and missing valuation reasons', async ({
  page,
}) => {
  await page.goto('/heute/details/invested?monat=2026-09&period=payday#anlagebasis');
  await expect(page.locator('.app')).toBeVisible();
  const redesign = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  await expect(
    page.getByRole('heading', {
      name: redesign ? 'Investiert · Anlagebasis' : 'Investiert',
      exact: true,
    }),
  ).toBeVisible();
  if (!redesign) return;
  const basis = page.getByRole('region', { name: 'Investiert · Anlagebasis' });
  const account = basis.locator('li a').first();
  await expect(account).toBeVisible();
  await account.click();
  await expect(page.getByRole('link', { name: 'Zurück zur Heute-Herleitung' })).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: 'Zurück zur Heute-Herleitung' }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/heute/details/invested' &&
      url.hash === '#anlagebasis' &&
      url.searchParams.get('period') === 'payday',
  );
  await page.route('**/api/heute?**', async (route) => {
    const response = await route.fetch();
    const data = (await response.json()) as Heute;
    const unavailable = {
      reason: 'missing_price' as const,
      message: 'Synthetischer Kurs fehlt.',
      asOf: data.stand.today,
    };
    data.investmentBasis = { asOf: data.stand.today, unavailable };
    await route.fulfill({ response, json: data });
  });
  await page.reload();
  await expect(basis).toContainText('Nicht verfügbar');
  await expect(basis).toContainText('Synthetischer Kurs fehlt.');
  await expect(basis).not.toContainText('0,00 €');
});

test('selected-month budget explanation keeps its canonical figure and category return context', async ({
  page,
}) => {
  await page.goto('/?monat=2026-08&period=month');
  const tile = page.getByRole('region', { name: 'Verfügbar im Budget', exact: true });
  await expect(tile.locator('[data-kennzahl="verfuegbar"]')).toBeVisible();
  const amount = await tile.locator('[data-kennzahl="verfuegbar"]').innerText();
  const redesign = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  await tile.getByRole('button', { name: 'Herleitung Verfügbar im Budget' }).click();
  const source = tile.getByRole('link', { name: 'Alle Envelopes und Quellen' });
  if (!redesign) {
    await expect(source).toHaveCount(0);
    return;
  }
  await source.click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/heute/details/budget' && url.searchParams.get('monat') === '2026-08',
  );
  const detail = page.getByRole('region', {
    name: 'Verfügbar im Budget · Herleitung',
    exact: true,
  });
  await expect(detail).toContainText(amount);
  await expect(detail).toContainText('Planmonat August 2026');
  await detail.locator('li a').first().click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname.startsWith('/plan/monat/envelope/') &&
      url.searchParams.get('monat') === '2026-08',
  );
  await page.reload();
  await page.getByRole('link', { name: 'Zurück zur Heute-Herleitung' }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/heute/details/budget' && url.searchParams.get('monat') === '2026-08',
  );
  await expect(
    page.getByRole('region', { name: 'Verfügbar im Budget · Herleitung', exact: true }),
  ).toContainText(amount);
});
