import AxeBuilder from '@axe-core/playwright';
import { openDatabase, schema } from '@budget/db';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-09-20' });
const END = '2026-09-20';
function seed(path: string, currency: 'EUR' | 'USD' = 'EUR') {
  const opened = openDatabase(path);
  try {
    opened.db
      .insert(schema.account)
      .values({
        id: 'explanation-depot',
        name: 'Musterdepot',
        type: 'brokerage',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-08-20',
      })
      .run();
    opened.db
      .insert(schema.security)
      .values({ id: 'explanation-security', name: 'Musterwertpapier', kind: 'stock', currency })
      .run();
    opened.db
      .insert(schema.holding)
      .values({
        id: 'explanation-holding',
        accountId: 'explanation-depot',
        securityId: 'explanation-security',
        asOf: '2026-08-20',
        unitsE8: 100000000,
        costBasisCents: 10000,
      })
      .run();
    opened.db
      .insert(schema.price)
      .values([
        {
          securityId: 'explanation-security',
          date: '2026-08-20',
          priceMicro: 100000000,
          currency,
          source: 'manual',
        },
        {
          securityId: 'explanation-security',
          date: END,
          priceMicro: 114000000,
          currency,
          source: 'manual',
        },
      ])
      .run();
    opened.db
      .insert(schema.investmentPreference)
      .values({ id: 'portfolio', costMethod: 'fifo' })
      .run();
    if (currency === 'EUR')
      opened.db
        .insert(schema.account)
        .values({
          id: 'separate-allocation-cash',
          name: 'Andere Allokationskassa',
          type: 'checking',
          role: 'investment',
          onBudget: false,
          currency: 'USD',
          allocationScope: 'included',
          openingDate: '2026-08-20',
          openingBalanceCents: 10000,
        })
        .run();
  } finally {
    opened.close();
  }
}
function financialSnapshot(path: string) {
  const opened = openDatabase(path);
  try {
    return {
      bookings: opened.db.select().from(schema.booking).all(),
      splits: opened.db.select().from(schema.bookingSplit).all(),
      trades: opened.db.select().from(schema.trade).all(),
      holdings: opened.db.select().from(schema.holding).all(),
      prices: opened.db.select().from(schema.price).all(),
      valuations: opened.db.select().from(schema.valuation).all(),
      audit: opened.db.select().from(schema.auditLog).all(),
      preferences: opened.db.select().from(schema.investmentPreference).all(),
    };
  } finally {
    opened.close();
  }
}
async function theme(page: Page, selected: 'light' | 'dark') {
  const current = () =>
    page.evaluate(() => {
      const value = document.documentElement.dataset['theme'];
      return value === 'light' || value === 'dark'
        ? value
        : matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    });
  if ((await current()) !== selected) {
    if (page.viewportSize()!.width === 390) {
      const menu = page.locator('.m-profile > summary');
      await menu.click();
      await page
        .locator('.m-profile')
        .getByRole('button', {
          name: selected === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
          exact: true,
        })
        .click();
      await menu.click();
    } else
      await page
        .locator('.sidebar-foot')
        .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true })
        .click();
  }
  await expect.poll(current).toBe(selected);
}
async function capture(
  page: Page,
  info: TestInfo,
  label: string,
  selected: string,
  surface: string,
  observedPointer: string | null,
) {
  const profile = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    coarse: matchMedia('(pointer: coarse)').matches,
    deviceScaleFactor: devicePixelRatio,
    rawMaxTouchPoints: navigator.maxTouchPoints,
    theme: document.documentElement.dataset['theme'] ?? 'system',
    url: location.pathname + location.search,
  }));
  const proof = {
    project: info.project.name,
    engine: page.context().browser()!.browserType().name(),
    label,
    selected,
    surface,
    observedPointer,
    pointerObservationSurface:
      observedPointer === null ? null : 'Report XIRR tap in this selected-theme phase',
    configuredContext:
      label === 'desktop-layout'
        ? {
            viewport: { width: 1440, height: 900 },
            isMobile: false,
            hasTouch: false,
            deviceScaleFactor: 1,
          }
        : {
            viewport: info.project.use.viewport ?? null,
            isMobile: info.project.use.isMobile ?? false,
            hasTouch: info.project.use.hasTouch ?? false,
            deviceScaleFactor: info.project.use.deviceScaleFactor ?? 1,
          },
    ...profile,
    qualification:
      'Synthetic UI-only disclosure stage; no selected-performance source transport or whole512 acceptance claim; observed touch protocol is not physical-device proof.',
  };
  const path = info.outputPath(`${label}-${selected}-${surface}.json`);
  await writeFile(path, JSON.stringify(proof, null, 2) + '\n');
  await info.attach(`${label}-${selected}-${surface}-runtime`, {
    path,
    contentType: 'application/json',
  });
  const png = info.outputPath(`${label}-${selected}-${surface}.png`);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({ path: png, fullPage: true, animations: 'disabled' });
  await info.attach(`${label}-${selected}-${surface}-image`, {
    path: png,
    contentType: 'image/png',
  });
}
async function checkSurfaces(page: Page, info: TestInfo, label: string, touch: boolean) {
  for (const selected of ['light', 'dark'] as const) {
    let observedPointer: string | null = null;
    await page.goto('/reports/prendite?zeitraum=1M');
    await theme(page, selected);
    await expect(page.getByTestId('period-ttwror')).toHaveText('+14 %');
    await expect(page.getByText('Kostenmethode: FIFO', { exact: true })).toBeVisible();
    await expect(page.getByText(/Allokationsstand.*20\.09\.2026/)).toBeVisible();
    await expect(page.getByText(/Wechselkurs fehlt/)).toBeVisible();
    await expect(page.getByTestId('report-verdict')).not.toContainText('geschätzt');
    const xirr = page.getByRole('button', { name: 'XIRR', exact: true });
    await xirr.focus();
    await page.keyboard.press('Enter');
    const tooltip = page.locator(`[id="${await xirr.getAttribute('aria-describedby')}"]`);
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('actual/365');
    const popupBox = await tooltip.boundingBox();
    expect(popupBox).not.toBeNull();
    expect(popupBox!.x).toBeGreaterThanOrEqual(0);
    expect(popupBox!.y).toBeGreaterThanOrEqual(0);
    expect(popupBox!.x + popupBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(popupBox!.y + popupBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    await expect(xirr).toBeFocused();
    await page.keyboard.press('Space');
    await expect(tooltip).toBeVisible();
    await page.keyboard.press('Escape');
    if (touch && selected === 'light') {
      const pointer = page.evaluate(
        () =>
          new Promise<string>((done) =>
            document.addEventListener('pointerdown', (event) => done(event.pointerType), {
              once: true,
            }),
          ),
      );
      await xirr.tap();
      observedPointer = await pointer;
      expect(observedPointer).toBe('touch');
      await expect(tooltip).toBeVisible();
      await page.keyboard.press('Escape');
    }
    const target = await xirr.boundingBox();
    expect(target).not.toBeNull();
    expect(target!.width).toBeGreaterThanOrEqual(44);
    expect(target!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Control+Shift+H');
    await expect(
      page.getByRole('group', { name: 'Maßkette Portfolioleistung im gewählten Zeitraum' }),
    ).not.toContainText('114');
    await expect(page.getByText('Kostenmethode: FIFO', { exact: true })).toBeVisible();
    await page.keyboard.press('Control+Shift+H');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await capture(page, info, label, selected, 'report', observedPointer);
    await page.getByRole('button', { name: 'Portfolio öffnen', exact: true }).click();
    await expect(page).toHaveURL(/vermoegen\/portfolio\?zeitraum=1M/);
    const overview = page.getByRole('region', { name: 'Portfolioentwicklung', exact: true });
    await overview.locator('summary').click();
    await expect(overview.getByText('Kostenmethode: FIFO', { exact: true })).toBeVisible();
    await expect(overview.getByText(/Allokationsstand.*20\.09\.2026/)).toBeVisible();
    await expect(overview.locator('summary')).not.toContainText('≈');
    await expect(overview.getByTestId('portfolio-overview-chart')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await capture(page, info, label, selected, 'overview', observedPointer);
  }
}
for (const label of ['configured-profile', 'desktop-layout'] as const)
  test(`existing investment explanations preserve real literal values and endpoint boundaries in ${label}`, async ({
    page,
    browser,
    isolatedLedger,
  }, info) => {
    seed(isolatedLedger.databasePath);
    const result = await page.request.get(
      '/api/portfolio?period=1M&view=securities&history=performance',
    );
    expect(result.status()).toBe(200);
    const body = await result.json();
    expect(body.portfolio.performance).toMatchObject({
      from: '2026-08-20',
      to: END,
      days: 31,
      startValueCents: 10000,
      endValueCents: 11400,
      gainCents: 1400,
    });
    expect(body.portfolio.quality.missingFxAccountIds).toEqual(['separate-allocation-cash']);
    const before = financialSnapshot(isolatedLedger.databasePath);
    const context =
      label === 'desktop-layout'
        ? await browser.newContext({
            baseURL: isolatedLedger.origin,
            storageState: await page.context().storageState(),
            viewport: { width: 1440, height: 900 },
            isMobile: false,
            hasTouch: false,
            deviceScaleFactor: 1,
            serviceWorkers: 'block',
          })
        : null;
    const actual = context ? await context.newPage() : page;
    const writes: string[] = [];
    actual.on('request', (request) => {
      if (
        new URL(request.url()).pathname.startsWith('/api/') &&
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
      )
        writes.push(request.method() + ' ' + new URL(request.url()).pathname);
    });
    try {
      if (context) await actual.clock.setFixedTime(new Date(END + 'T12:00:00+02:00'));
      await checkSurfaces(actual, info, label, !context && info.project.use.hasTouch === true);
      expect(writes).toEqual([]);
      expect(financialSnapshot(isolatedLedger.databasePath)).toEqual(before);
    } finally {
      await context?.close();
    }
  });

test('empty performance and genuine missing-FX failure remain unavailable instead of invented zero', async ({
  page,
  isolatedLedger,
}) => {
  await page.goto('/reports/prendite?zeitraum=1M');
  await expect(
    page.getByText(
      'Für das Portfolio liegt keine Renditehistorie vor. Eine Rendite wird nicht als null angenommen.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByTestId('period-ttwror')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'XIRR', exact: true })).toHaveCount(0);
  seed(isolatedLedger.databasePath, 'USD');
  const before = financialSnapshot(isolatedLedger.databasePath);
  const result = await page.request.get(
    '/api/portfolio?period=1M&view=securities&history=performance',
  );
  expect(result.status()).toBe(503);
  expect((await result.json()).error).toBe('valuation_unavailable');
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Portfolioauswertung nicht verfügbar.');
  await expect(page.getByTestId('period-ttwror')).toHaveCount(0);
  await expect(page.getByTestId('realized-gain')).toHaveCount(0);
  expect(financialSnapshot(isolatedLedger.databasePath)).toEqual(before);
});
