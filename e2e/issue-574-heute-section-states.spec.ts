import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { sampleTest as test, expect as baseExpect } from './sample';
import type { Heute } from '../apps/web/src/heute/api';
import type { SavingsExecutionProposal } from '../apps/web/src/wealth/savings-api';

const expect = baseExpect.configure({ timeout: 15_000 });
const proposal: SavingsExecutionProposal = {
  type: 'savings', id: 'synthetic-574', kind: 'revision', urgent: false,
  planId: 'synthetic-574', month: '2026-09', securityId: 'synthetic-574',
  accountId: 'synthetic-574', securityName: 'Synthetic instrument', accountName: 'Synthetic depot',
  sourceAccountName: 'Synthetic account', currency: 'EUR', date: '2026-09-17', amountCents: 12_345,
};
async function bounds(page: Page) {
  return Promise.all(['.heute-kennzahlen', '.heute-pace', '.heute-compact-forecast', '.heute-wealth-line']
    .map((selector) => page.locator(selector).boundingBox()));
}
async function paceGeometry(page: Page) {
  return page.locator('.heute-pace').evaluate((section) => [...section.querySelectorAll(
    '.head, .head h2, .head .aside, .head .aside > *, .heute-figures, .heute-figure, .heute-figure > *, .heute-chart, .chart-interactive, svg.chart, .heute-pace-state-plot, .chart-legend, .pace-context-toggle, .heute-note',
  )].map((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { tag: element.tagName, class: element.getAttribute('class'),
      x: box.x, y: box.y, width: box.width, height: box.height,
      font: style.font, lineHeight: style.lineHeight, display: style.display,
      alignItems: style.alignItems, verticalAlign: style.verticalAlign,
      margin: style.margin, padding: style.padding, minHeight: style.minHeight };
  }));
}
async function accessible(page: Page, retry?: Locator) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  if (!fits) console.log('Heute horizontal overflow', await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth,
    elements: [...document.querySelectorAll('main *')].flatMap((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && (box.left < 0 || box.right > innerWidth)
        ? [{ tag: element.tagName, class: element.getAttribute('class'), id: element.id,
          x: box.x, y: box.y, width: box.width, right: box.right }] : [];
    }).slice(0, 12),
  })));
  expect(fits).toBe(true);
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  if (retry && page.viewportSize()!.width === 390) {
    const box = (await retry.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
}

test('initial section placeholders keep above-fold geometry while independent reads render', async ({ page }, info) => {
  test.setTimeout(60_000);
  const response = await page.request.get('/api/heute?month=2026-09&period=month');
  const data: Heute = await response.json();
  let release!: () => void;
  let held: Promise<void>;
  await page.route('**/api/heute?*', async (route) => { await held; await route.fulfill({ json: data }); });
  for (const colorScheme of ['light', 'dark'] as const) {
    held = new Promise<void>((resolve) => { release = resolve; });
    try {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto('/?monat=2026-09&period=month');
    await expect(page.locator('[data-kennzahl="zu-verteilen"]')).toBeVisible();
    await expect(page.getByTestId('liquidity-chart')).toBeVisible();
    await expect(page.locator('.heute-pace')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.heute-wealth-line')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('region', { name: 'Letzte Buchungen' })).toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => document.fonts.ready);
    const pending = await bounds(page);
    const pendingPace = await paceGeometry(page);
    expect(pending.every(Boolean)).toBe(true);
    await accessible(page);
    release();
    await expect(page.getByTestId('heute-wealth-history')).toBeVisible();
    await expect(page.getByTestId('heute-pace-chart')).toBeVisible();
    const settled = await bounds(page);
    if (JSON.stringify(settled) !== JSON.stringify(pending))
      console.log('Heute Pace slot comparison', { pending: pendingPace, settled: await paceGeometry(page) });
    expect(settled).toEqual(pending);
    if (info.project.name === 'desktop') {
      for (const box of settled) expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    }
    await accessible(page);
    await page.screenshot({ path: info.outputPath(`574-settled-${colorScheme}.png`) });
    } finally {
      release();
    }
  }
});

test('the independent forecast reserves its own initial pending plot before its real response arrives', async ({ page }, info) => {
  test.setTimeout(60_000);
  let release!: () => void;
  let held: Promise<void>;
  await page.route('**/api/liquidity?*', async (route) => {
    await held;
    await route.continue();
  });
  for (const colorScheme of ['light', 'dark'] as const) {
    held = new Promise<void>((resolve) => { release = resolve; });
    try {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/?monat=2026-09&period=month');
      await expect(page.getByTestId('heute-wealth-history')).toBeVisible();
      await expect(page.locator('[data-kennzahl="zu-verteilen"]')).toBeVisible();
      const forecast = page.getByRole('region', { name: 'Kontoprognose · 35 Tage' });
      await expect(forecast.getByTestId('liquidity-chart')).toHaveCount(0);
      await expect(forecast.getByText('Kontoprognose werden geladen …')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const pending = await bounds(page);
      expect(pending.every(Boolean)).toBe(true);
      release();
      await expect(forecast.getByTestId('liquidity-chart')).toBeVisible();
      expect(await bounds(page)).toEqual(pending);
      await accessible(page);
      await page.screenshot({ path: info.outputPath(`574-forecast-${colorScheme}-settled.png`) });
    } finally {
      release();
    }
  }
});

for (const read of ['heute', 'budget', 'liquidity', 'savings'] as const) {
  test(`${read} failure stays in its read boundary and retries without hiding successful sections`, async ({ page }, info) => {
    test.setTimeout(60_000);
    let fail = true;
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push(request.method());
    });
    const pattern = read === 'heute' ? '**/api/heute?*' : read === 'budget' ? '**/api/budget/2026-09'
      : read === 'liquidity' ? '**/api/liquidity?*' : '**/api/savings-plans/execution-proposals';
    await page.route('**/api/savings-plans/execution-proposals', (route) => route.fulfill({ json: { proposals: [proposal] } }));
    await page.route(pattern, (route) => fail ? route.fulfill({ status: 503, json: { error: 'synthetic_unavailable' } })
      : read === 'savings' ? route.fulfill({ json: { proposals: [proposal] } }) : route.fallback());
    for (const colorScheme of ['light', 'dark'] as const) {
      fail = true;
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/?monat=2026-09&period=month');
      const budget = page.locator('[aria-labelledby="kennzahl-zu-verteilen-title"]');
      const forecast = page.getByRole('region', { name: 'Kontoprognose · 35 Tage' });
      const savings = page.getByRole('region', { name: 'Zu tun' });
      if (read === 'heute') {
        await expect(page.locator('[data-kennzahl="nettovermoegen"]')).toHaveCount(0);
        await expect(page.getByTestId('heute-wealth-history')).toHaveCount(0);
      } else await expect(page.getByTestId('heute-wealth-history')).toBeVisible();
      if (read !== 'budget') await expect(budget.getByTestId('kennzahl-value')).toBeVisible();
      if (read === 'liquidity') {
        await expect(forecast.getByTestId('liquidity-chart')).toHaveCount(0);
        await expect(forecast.locator('.heute-forecast-low')).toHaveCount(0);
      } else await expect(forecast.getByTestId('liquidity-chart')).toBeVisible();
      if (read === 'savings') {
        await expect(savings).not.toContainText('Synthetic instrument');
        await expect(savings).not.toContainText('123,45');
      } else {
        const summary = savings.getByText('1 Sparplanausführung prüfen');
        await expect(summary).toBeVisible();
        await summary.click();
        await expect(savings).toContainText('Synthetic instrument');
        await expect(savings).toContainText('123,45');
      }
      const boundary = read === 'budget' ? budget : read === 'liquidity' ? forecast : read === 'savings' ? savings : page.locator('.heute');
      const retry = boundary.getByRole('button', { name: 'Erneut versuchen' }).first();
      await expect(retry).toBeVisible();
      // Compare layout, independently of scrolling caused by the retry control's focus.
      if (read === 'liquidity') await page.evaluate(() => window.scrollTo(0, 0));
      const errorBounds = read === 'liquidity' ? await bounds(page) : undefined;
      await accessible(page, retry);
      await page.screenshot({ path: info.outputPath(`574-${read}-${colorScheme}-error.png`) });
      fail = false;
      await retry.click();
      if (read === 'budget') await expect(budget.getByTestId('kennzahl-value')).toBeVisible();
      else if (read === 'liquidity') await expect(forecast.getByTestId('liquidity-chart')).toBeVisible();
      else if (read === 'savings') await expect(savings.getByText('1 Sparplanausführung prüfen')).toBeVisible();
      else await expect(page.getByTestId('heute-wealth-history')).toBeVisible();
      if (errorBounds) {
        await page.evaluate(() => window.scrollTo(0, 0));
        expect(await bounds(page)).toEqual(errorBounds);
      }
      await accessible(page);
    }
    expect(writes).toEqual([]);
  });
}
