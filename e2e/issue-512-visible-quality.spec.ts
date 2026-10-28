import AxeBuilder from '@axe-core/playwright';
import { openDatabase } from '@budget/db';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { test } from './isolated-ledger';
import { sampleTest, SAMPLE_NOW, SAMPLE_URL } from './sample';
const DAY = '2026-09-20';
test.use({ ledgerToday: DAY });
const TABLES = [
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
] as const;
function withDb(path: string, run: (db: ReturnType<typeof openDatabase>) => void) {
  const f = openDatabase(path);
  try {
    run(f);
  } finally {
    f.close();
  }
}
function seed(path: string, missingFx = false) {
  withDb(path, (f) => {
    f.sqlite.exec(`
      INSERT INTO account(id,name,type,role,on_budget,opening_date) VALUES ('visible-a','Musterdepot','brokerage','investment',0,'2026-08-20');
      INSERT INTO security(id,name,kind,currency) VALUES ('visible-s','Musterwertpapier','stock','EUR');
      INSERT INTO holding(id,account_id,security_id,as_of,units_e8,cost_basis_cents) VALUES ('visible-h','visible-a','visible-s','2026-08-20',100000000,10000);
      INSERT INTO price(security_id,date,price_micro,currency,source) VALUES
        ('visible-s','2026-08-20',100000000,'EUR','manual'),('visible-s','2026-09-20',120000000,'USD','manual');
    `);
    if (!missingFx)
      f.sqlite.exec(
        "INSERT INTO fx_rate(currency,date,rate_micro,source) VALUES ('USD','2026-09-19',950000,'ecb')",
      );
    f.sqlite.exec(
      "INSERT INTO account(id,name,type,role,on_budget,currency,allocation_scope,opening_date,opening_balance_cents) VALUES ('visible-chf','Andere Allokationskassa','checking','investment',0,'CHF','included','2026-08-20',10000)",
    );
  });
}
function snapshot(path: string) {
  const f = openDatabase(path);
  try {
    return JSON.stringify(
      TABLES.map((table) => [
        table,
        f.sqlite.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(),
      ]),
    );
  } finally {
    f.close();
  }
}
async function setTheme(page: Page, target: 'light' | 'dark') {
  const resolved = () =>
    page.evaluate(() => {
      const t = document.documentElement.dataset['theme'];
      return t === 'light' || t === 'dark'
        ? t
        : matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    });
  if ((await resolved()) !== target) {
    if (page.viewportSize()!.width === 390) {
      const menu = page.locator('.m-profile > summary');
      await menu.click();
      await page
        .locator('.m-profile')
        .getByRole('button', {
          name: target === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
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
  await expect.poll(resolved).toBe(target);
}
let sourceHitSequence = 0;
async function safeTarget(target: Locator) {
  const info = test.info();
  const key = `source-hit-${++sourceHitSequence}`;
  await mkdir(info.outputPath('diagnostics'), { recursive: true });
  const observation = () =>
    target.evaluate((el) => {
      const box = (node: Element) => {
        const r = node.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          right: r.right,
          bottom: r.bottom,
        };
      };
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      const viewport = window.visualViewport;
      return {
        target: { tag: el.tagName, class: el.getAttribute('class'), rect: box(el) },
        hit: hit ? { tag: hit.tagName, class: hit.getAttribute('class'), rect: box(hit) } : null,
        scrollX,
        scrollY,
        innerWidth,
        innerHeight,
        timestamp: performance.now(),
        visualViewport: viewport
          ? {
              width: viewport.width,
              height: viewport.height,
              offsetTop: viewport.offsetTop,
              offsetLeft: viewport.offsetLeft,
              scale: viewport.scale,
            }
          : null,
        overlays: Array.from(document.querySelectorAll('.tabbar, .fab')).map((node) => ({
          tag: node.tagName,
          class: node.getAttribute('class'),
          rect: box(node),
        })),
        visible: b.x >= 0 && b.y >= 0 && b.right <= innerWidth && b.bottom <= innerHeight,
        ownsCentre: hit === el || (!!hit && el.contains(hit)),
      };
    });
  const before = await observation();
  await writeFile(
    info.outputPath('diagnostics', `${key}-before.json`),
    JSON.stringify(before, null, 2),
  );
  await target.evaluate((el) =>
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }),
  );
  const b = await target.boundingBox();
  const actual = await observation();
  await writeFile(
    info.outputPath('diagnostics', `${key}-after.json`),
    JSON.stringify(actual, null, 2),
  );
  expect(b).not.toBeNull();
  expect(b!.width).toBeGreaterThanOrEqual(44);
  expect(b!.height).toBeGreaterThanOrEqual(44);
  expect(actual.visible).toBe(true);
  expect(actual.ownsCentre).toBe(true);
}
async function activateSource(page: Page, target: Locator, phone: boolean) {
  await safeTarget(target);
  if (phone) {
    await target.evaluate((el) =>
      el.addEventListener(
        'pointerdown',
        (e) => el.setAttribute('data-proof-pointer', (e as PointerEvent).pointerType),
        { once: true },
      ),
    );
    await target.tap();
    await expect(target).toHaveAttribute('data-proof-pointer', 'touch');
  } else {
    await target.focus();
    await page.keyboard.press('Enter');
  }
  const summary = page.getByText('Historische Bewertungsquellen', { exact: true });
  await expect(summary.locator('..')).toHaveAttribute('open', '');
  await expect(summary).toBeFocused();
  return phone ? 'touch' : 'keyboard';
}
async function capture(
  page: Page,
  info: TestInfo,
  engine: string,
  label: string,
  selected: string,
  surface: string,
  pointer: string,
) {
  const key = `visible-basis-${label}-${selected}-${surface}`;
  const runtime = {
    engine,
    project: info.project.name,
    label,
    selected,
    surface,
    pointerProtocol: pointer,
    viewport: page.viewportSize(),
    ...(await page.evaluate(() => ({
      DPR: devicePixelRatio,
      coarse: matchMedia('(pointer: coarse)').matches,
      rawMaxTouchPoints: navigator.maxTouchPoints,
      themeAttribute: document.documentElement.dataset['theme'] ?? null,
    }))),
    qualification:
      'Synthetic only; supported pointer protocol, not physical device. Actual safe-target centre checked for this cue link only, not unobscured whole page. Selected11table conservation; fixed shell/other photo limits remain.',
  };
  const json = info.outputPath(key + '.json'),
    png = info.outputPath(key + '.png');
  await writeFile(json, JSON.stringify(runtime, null, 2));
  await info.attach(key + '-runtime', { path: json, contentType: 'application/json' });
  await page.screenshot({ path: png, fullPage: true, animations: 'disabled' });
  await info.attach(key + '-image', { path: png, contentType: 'image/png' });
}
for (const label of ['configured-profile', 'desktop-layout'] as const) {
  test(`visible historical-basis cue preserves original return, privacy and destinations in ${label}`, async ({
    page,
    browser,
    browserName,
    isolatedLedger,
  }, info) => {
    seed(isolatedLedger.databasePath);
    const before = snapshot(isolatedLedger.databasePath);
    const result = await page.request.get(
      '/api/portfolio?period=1M&view=securities&history=performance&provenance=valuation-v1',
    );
    expect(result.status()).toBe(200);
    const body = await result.json();
    expect(body.portfolio.performance).toMatchObject({
      from: '2026-08-20',
      to: DAY,
      days: 31,
      startValueCents: 10000,
      endValueCents: 11400,
      gainCents: 1400,
    });
    expect(body.portfolio.performance.ttwror).toBeCloseTo(0.14, 12);
    expect(
      body.portfolio.valuationProvenance.runs.some(
        (r: { quality: string }) => r.quality === 'stale',
      ),
    ).toBe(true);
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
    const actual = context ? await context.newPage() : page,
      phone = !context && info.project.use.hasTouch === true,
      writes: string[] = [];
    actual.on('request', (r) => {
      if (
        new URL(r.url()).pathname.startsWith('/api/') &&
        !['GET', 'HEAD', 'OPTIONS'].includes(r.method())
      )
        writes.push(r.method() + ' ' + new URL(r.url()).pathname);
    });
    try {
      if (context) await actual.clock.setFixedTime(new Date(DAY + 'T12:00:00+02:00'));
      for (const selected of ['light', 'dark'] as const) {
        await actual.goto('/reports/prendite?zeitraum=1M');
        await setTheme(actual, selected);
        await expect(actual.getByTestId('period-ttwror')).toHaveText('+14 %');
        await expect(actual.getByTestId('report-verdict')).not.toContainText('geschätzt');
        // Intended meaningful RED starts here, after independently literal financial prerequisites.
        const cue = actual.getByRole('status', { name: 'Historische Bewertungsgrundlage' });
        await expect(cue).toBeVisible();
        await expect(cue).toContainText('≈ Bewertungsdaten fortgeschrieben');
        const described = await actual
          .getByTestId('period-ttwror')
          .getAttribute('aria-describedby');
        expect(described?.split(/\s+/)).toContain(await cue.getAttribute('id'));
        const pointer = await activateSource(
          actual,
          cue.getByRole('link', { name: 'Bewertungsquellen ansehen' }),
          phone,
        );
        await expect(actual.getByText(/Kurs mehr als sieben Tage fortgeschrieben/)).toBeVisible();
        expect((await new AxeBuilder({ page: actual }).analyze()).violations).toEqual([]);
        await capture(actual, info, browserName, label, selected, 'report', pointer);
        await actual.getByRole('button', { name: 'Portfolio öffnen', exact: true }).click();
        await expect(actual).toHaveURL(/vermoegen\/portfolio\?zeitraum=1M/);
        const region = actual.getByRole('region', { name: 'Portfolioentwicklung', exact: true }),
          original = region.getByTestId('portfolio-return');
        await expect(original).not.toContainText('≈');
        await expect(original.locator('..')).not.toHaveAttribute('open', '');
        const overviewCue = region.getByRole('status', { name: 'Historische Bewertungsgrundlage' });
        await expect(overviewCue).toBeVisible();
        await expect(overviewCue).toContainText('≈ Bewertungsdaten fortgeschrieben');
        const sourcePointer = await activateSource(
          actual,
          overviewCue.getByRole('link', { name: 'Bewertungsquellen ansehen' }),
          phone,
        );
        await expect(actual.getByTestId('portfolio-value')).toContainText('114,00');
        await actual.keyboard.press('Control+Shift+H');
        await expect(actual.getByTestId('portfolio-value')).toContainText('•••');
        await expect(actual.getByTestId('portfolio-value')).not.toContainText('114');
        const chart = region.locator('.chart-interactive');
        await chart.focus();
        await chart.press('ArrowRight');
        await expect(actual.locator('.chart-tooltip')).toContainText('•••');
        await expect(actual.locator('.chart-tooltip')).not.toContainText(/(?:100|114)[,.]00\s*€/);
        const attributes = await region.locator('[aria-label], [title]').evaluateAll((els) =>
          els
            .map((el) => [el.getAttribute('aria-label'), el.getAttribute('title')])
            .flat()
            .join(' '),
        );
        expect(attributes).not.toMatch(/(?:100|114)[,.]00\s*€/);
        await expect(overviewCue).toBeVisible();
        await expect(overviewCue).not.toContainText(/11400|114,00|100,00/);
        await chart.press('Escape');
        await actual.keyboard.press('Control+Shift+H');
        await capture(actual, info, browserName, label, selected, 'overview', sourcePointer);
        await region.getByRole('link', { name: 'Reportkatalog Portfolio öffnen' }).click();
        await expect(actual).toHaveURL(/reports\/gruppe\/portfolio/);
        await actual.goBack();
        await expect(actual).toHaveURL(/vermoegen\/portfolio\?zeitraum=1M/);
        await actual.goBack();
        await expect(actual).toHaveURL(
          (url) =>
            url.pathname === '/reports/pallocation' &&
            url.searchParams.get('darstellung') === 'rendite' &&
            url.searchParams.get('zeitraum') === '1M',
        );
      }
      expect(writes).toEqual([]);
      expect(snapshot(isolatedLedger.databasePath)).toBe(before);
    } finally {
      await context?.close();
    }
  });
  test(`unavailable history and genuine FX error do not invent figures in ${label}`, async ({
    page,
    browser,
    isolatedLedger,
  }) => {
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
    try {
      if (context) await actual.clock.setFixedTime(new Date(DAY + 'T12:00:00+02:00'));
      const emptyBefore = snapshot(isolatedLedger.databasePath);
      for (const selected of ['light', 'dark'] as const) {
        await actual.goto('/reports/prendite?zeitraum=1M');
        await setTheme(actual, selected);
        await expect(
          actual
            .getByRole('status')
            .filter({ hasText: 'Für das Portfolio liegt keine Renditehistorie vor.' }),
        ).toBeVisible();
        await expect(actual.getByTestId('period-ttwror')).toHaveCount(0);
        await expect(actual.getByRole('button', { name: 'XIRR', exact: true })).toHaveCount(0);
      }
      expect(snapshot(isolatedLedger.databasePath)).toBe(emptyBefore);
      // Declared synthetic setup phase; no app write or snapshot equality across setup is claimed.
      seed(isolatedLedger.databasePath, true);
      const missingBefore = snapshot(isolatedLedger.databasePath);
      const failure = await actual.request.get(
        '/api/portfolio?period=1M&view=securities&history=performance&provenance=valuation-v1',
      );
      expect(failure.status()).toBe(503);
      expect((await failure.json()).error).toBe('valuation_unavailable');
      for (const selected of ['light', 'dark'] as const) {
        await actual.goto('/reports/prendite?zeitraum=1M');
        await setTheme(actual, selected);
        await expect(actual.getByRole('alert')).toContainText(
          'Portfolioauswertung nicht verfügbar.',
        );
        await expect(actual.getByTestId('period-ttwror')).toHaveCount(0);
        await expect(actual.getByTestId('realized-gain')).toHaveCount(0);
      }
      expect(snapshot(isolatedLedger.databasePath)).toBe(missingBefore);
    } finally {
      await context?.close();
    }
  });
}

sampleTest(
  'sample-default portfolio chart and complete cue fit the original desktop viewport',
  async ({ page, browser, browserName }, info) => {
    const context = await browser.newContext({
      baseURL: SAMPLE_URL,
      storageState: await page.context().storageState(),
      viewport: { width: 1440, height: 900 },
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 1,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    const actual = await context.newPage();
    try {
      await actual.clock.setFixedTime(new Date(SAMPLE_NOW));
      await actual.goto('/vermoegen/portfolio');
      await expect(actual.getByTestId('portfolio-gain')).toContainText('€');
      const region = actual.getByRole('region', { name: 'Portfolioentwicklung', exact: true });
      const cue = region.getByRole('status', { name: 'Historische Bewertungsgrundlage' });
      await expect(cue).toBeVisible();
      await expect(cue).toContainText(
        'Nur Schlussbewertungen der Wertpapiere; kein Qualitätsnachweis sämtlicher Renditeeingaben.',
      );
      const original = region.getByTestId('portfolio-return');
      await expect(original.locator('..')).not.toHaveAttribute('open', '');
      const link = cue.getByRole('link', { name: 'Bewertungsquellen ansehen' });
      const geometry = await actual.evaluate(() => {
        const rect = (el: Element | null) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            right: r.right,
            bottom: r.bottom,
          };
        };
        const cue = document.querySelector(
          '[role="status"][aria-label="Historische Bewertungsgrundlage"]',
        )!;
        const text = cue.firstElementChild!;
        const link = cue.querySelector('a')!;
        const r = link.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        const css = (el: Element) => {
          const s = getComputedStyle(el);
          return {
            display: s.display,
            marginTop: s.marginTop,
            marginBottom: s.marginBottom,
            maxWidth: s.maxWidth,
            fontSize: s.fontSize,
            lineHeight: s.lineHeight,
          };
        };
        return {
          scrollX,
          scrollY,
          viewport: { width: innerWidth, height: innerHeight },
          DPR: devicePixelRatio,
          coarse: matchMedia('(pointer: coarse)').matches,
          rawMaxTouchPoints: navigator.maxTouchPoints,
          chart: rect(document.querySelector('[data-testid="portfolio-overview-chart"]')),
          lead: rect(document.querySelector('[data-testid="portfolio-value"]')),
          summary: rect(document.querySelector('[data-testid="portfolio-return"]')),
          cue: rect(cue),
          text: rect(text),
          link: rect(link),
          cueText: cue.textContent,
          cueStyle: css(cue),
          textStyle: css(text),
          linkOwnsCentre: hit === link || (!!hit && link.contains(hit)),
          hit: hit ? { tag: hit.tagName, class: hit.getAttribute('class'), rect: rect(hit) } : null,
        };
      });
      await mkdir(info.outputPath('diagnostics'), { recursive: true });
      await writeFile(
        info.outputPath('diagnostics', 'sample-default-before-interaction.json'),
        JSON.stringify({ engine: browserName, project: info.project.name, ...geometry }, null, 2),
      );
      await actual.screenshot({
        path: info.outputPath('diagnostics', 'sample-default-before-interaction.png'),
        animations: 'disabled',
      });
      expect(geometry.viewport).toEqual({ width: 1440, height: 900 });
      expect(geometry.scrollX).toBe(0);
      expect(geometry.scrollY).toBe(0);
      expect(geometry.chart).not.toBeNull();
      expect(geometry.chart!.bottom).toBeLessThan(geometry.viewport.height);
      expect(geometry.link).not.toBeNull();
      expect(geometry.link!.width).toBeGreaterThanOrEqual(44);
      expect(geometry.link!.height).toBeGreaterThanOrEqual(44);
      expect(geometry.link!.x).toBeGreaterThanOrEqual(0);
      expect(geometry.link!.y).toBeGreaterThanOrEqual(0);
      expect(geometry.link!.right).toBeLessThanOrEqual(geometry.viewport.width);
      expect(geometry.link!.bottom).toBeLessThanOrEqual(geometry.viewport.height);
      expect(geometry.linkOwnsCentre).toBe(true);
      await link.focus();
      await actual.keyboard.press('Enter');
      const sources = actual.getByText('Historische Bewertungsquellen', { exact: true });
      await expect(sources.locator('..')).toHaveAttribute('open', '');
      await expect(sources).toBeFocused();
    } finally {
      await context.close();
    }
  },
);
