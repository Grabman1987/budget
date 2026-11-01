import { withShellControls } from './shell-actions';
import AxeBuilder from '@axe-core/playwright';
import { openDatabase } from '@budget/db';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { test } from './isolated-ledger';

const END = '2026-09-20';
test.use({ ledgerToday: END });
function seed(path: string) {
  const f = openDatabase(path);
  try {
    f.sqlite.exec(`
    INSERT INTO account(id,name,type,role,on_budget,opening_date) VALUES ('a','Musterdepot','brokerage','investment',0,'2026-08-20');
    INSERT INTO security(id,name,kind,currency) VALUES ('s','Musterwertpapier','stock','USD');
    INSERT INTO holding(id,account_id,security_id,as_of,units_e8,cost_basis_cents) VALUES ('h','a','s','2026-08-20',100000000,10000);
    INSERT INTO price(security_id,date,price_micro,currency,source) VALUES
      ('s','2026-08-20',100000000,'EUR','manual'),('s','2026-09-20',120000000,'USD','manual');
    INSERT INTO fx_rate(currency,date,rate_micro,source) VALUES ('USD','2026-09-19',950000,'ecb');
    INSERT INTO investment_preference(id,cost_method) VALUES ('portfolio','fifo');
    INSERT INTO account(id,name,type,role,on_budget,currency,allocation_scope,opening_date,opening_balance_cents)
      VALUES ('chf','Andere Allokationskassa','checking','investment',0,'CHF','included','2026-08-20',10000);
  `);
  } finally {
    f.close();
  }
}
function snapshot(path: string) {
  const f = openDatabase(path);
  try {
    return JSON.stringify(
      [
        'account',
        'security',
        'holding',
        'trade',
        'price',
        'fx_rate',
        'booking',
        'booking_split',
        'valuation',
        'audit_log',
        'investment_preference',
      ].map((table) => [table, f.sqlite.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()]),
    );
  } finally {
    f.close();
  }
}
async function theme(page: Page, selected: 'light' | 'dark') {
  const resolved = () =>
    page.evaluate(() => {
      const theme = document.documentElement.dataset['theme'];
      return theme === 'light' || theme === 'dark'
        ? theme
        : matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    });
  if ((await resolved()) !== selected) {
    if (page.viewportSize()!.width === 390) {
      await withShellControls(
        page,
        async ({ theme: control }) => {
          await expect(control).toHaveAccessibleName(
            selected === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
          );
          await control.click();
        },
        false,
      );
    } else
      await page
        .locator('.sidebar-foot')
        .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true })
        .click();
  }
  await expect.poll(resolved).toBe(selected);
}
async function capture(
  page: Page,
  info: TestInfo,
  label: string,
  selected: string,
  surface: string,
) {
  const runtime = {
    label,
    selected,
    surface,
    project: info.project.name,
    engine: page.context().browser()!.browserType().name(),
    configuredContext:
      label === 'desktop-layout'
        ? {
            viewport: { width: 1440, height: 900 },
            isMobile: false,
            hasTouch: false,
            deviceScaleFactor: 1,
          }
        : {
            viewport: info.project.use.viewport,
            isMobile: info.project.use.isMobile,
            hasTouch: info.project.use.hasTouch,
            deviceScaleFactor: info.project.use.deviceScaleFactor,
          },
    ...(await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      coarse: matchMedia('(pointer: coarse)').matches,
      DPR: devicePixelRatio,
      rawMaxTouchPoints: navigator.maxTouchPoints,
      themeAttribute: document.documentElement.dataset['theme'] ?? 'system',
      path: location.pathname + location.search,
    }))),
    qualification:
      'Synthetic security closing-valuation metadata only; click/keyboard protocol, no physical touch or whole-page unobscured proof; selected11table conservation only.',
  };
  const json = info.outputPath(`${label}-${selected}-${surface}.json`);
  await writeFile(json, JSON.stringify(runtime, null, 2) + '\n');
  await info.attach(`${label}-${selected}-${surface}-runtime`, {
    path: json,
    contentType: 'application/json',
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const png = info.outputPath(`${label}-${selected}-${surface}.png`);
  await page.screenshot({ path: png, fullPage: true, animations: 'disabled' });
  await info.attach(`${label}-${selected}-${surface}-image`, {
    path: png,
    contentType: 'image/png',
  });
}

for (const label of ['configured-profile', 'desktop-layout'] as const) {
  test(`selected closing valuation sources retain literal money and truthful scope in ${label}`, async ({
    page,
    browser,
    isolatedLedger,
  }, info) => {
    seed(isolatedLedger.databasePath);
    const before = snapshot(isolatedLedger.databasePath);
    const response = await page.request.get(
      '/api/portfolio?period=1M&view=securities&history=performance&provenance=valuation-v1',
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.portfolio.performance).toMatchObject({
      from: '2026-08-20',
      to: END,
      days: 31,
      startValueCents: 10000,
      endValueCents: 11400,
      gainCents: 1400,
      contributionsCents: 0,
    });
    expect(body.portfolio.valuationProvenance).toMatchObject({
      window: { from: '2026-08-20', to: END },
      coverage: { calendarDays: '32', observedPositionDays: '32', complete: true },
      runs: expect.arrayContaining([
        expect.objectContaining({
          from: END,
          to: END,
          kind: 'quote',
          date: END,
          currency: 'USD',
          fx: { kind: 'rate', date: '2026-09-19', source: 'ecb' },
        }),
      ]),
    });
    expect(body.portfolio.quality.missingFxAccountIds).toEqual(['chf']);
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
      for (const selected of ['light', 'dark'] as const) {
        await actual.goto('/reports/prendite?zeitraum=1M');
        await theme(actual, selected);
        await expect(actual.getByTestId('period-ttwror')).toHaveText('+14 %');
        await expect(actual.getByTestId('report-verdict')).not.toContainText('geschätzt');
        const toggle = actual.getByText('Historische Bewertungsquellen', { exact: true });
        const disclosure = toggle.locator('..');
        await toggle.focus();
        await actual.keyboard.press('Enter');
        await expect(
          disclosure.getByText(/32 von 32 Positionstagen dokumentiert.*32 Schlussstichtage/),
        ).toBeVisible();
        await expect(disclosure.getByText(/Wechselkurs vom 19.09.2026; Quelle: ecb/)).toBeVisible();
        await expect(
          disclosure.getByText(/Kurs mehr als sieben Tage fortgeschrieben/),
        ).toBeVisible();
        await expect(
          disclosure.getByText(/bestätigt weder exakte Werte noch sämtliche Eingaben der Rendite/),
        ).toBeVisible();
        await expect(
          disclosure.getByText(/Zahlungsflüsse.*Wechselkurse.*Gebühren\/Steuern/),
        ).toBeVisible();
        await expect(disclosure.getByText(/Wechselkurs fehlt/)).toHaveCount(0);
        const target = await toggle.boundingBox();
        expect(target!.height).toBeGreaterThanOrEqual(44);
        await actual.keyboard.press('Control+Shift+H');
        await expect(
          actual.getByRole('group', { name: 'Maßkette Portfolioleistung im gewählten Zeitraum' }),
        ).not.toContainText('114');
        await expect(disclosure).not.toContainText('114');
        await actual.keyboard.press('Control+Shift+H');
        expect(
          await actual.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        expect((await new AxeBuilder({ page: actual }).analyze()).violations).toEqual([]);
        await capture(actual, info, label, selected, 'report');
        await actual.getByRole('button', { name: 'Portfolio öffnen', exact: true }).click();
        await expect(actual).toHaveURL(/vermoegen\/portfolio\?zeitraum=1M/);
        const overview = actual.getByRole('region', { name: 'Portfolioentwicklung', exact: true });
        await overview.getByTestId('portfolio-return').click();
        const sourceToggle = overview.getByText('Historische Bewertungsquellen', { exact: true });
        const sources = sourceToggle.locator('..');
        await sourceToggle.click();
        await expect(sources.getByText(/32 von 32 Positionstagen dokumentiert/)).toBeVisible();
        await expect(sources.getByText(/Wechselkurs vom 19.09.2026; Quelle: ecb/)).toBeVisible();
        await expect(overview.getByTestId('portfolio-overview-chart')).toBeVisible();
        expect(
          await actual.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        await capture(actual, info, label, selected, 'overview');
      }
      expect(writes).toEqual([]);
      expect(snapshot(isolatedLedger.databasePath)).toBe(before);
    } finally {
      await context?.close();
    }
  });
}
