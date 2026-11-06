import { detectHeuteRedesign, heuteReviewUrl } from './heute-visual-fixture';
import AxeBuilder from '@axe-core/playwright';
import type { Locator } from '@playwright/test';
import { MIN_TARGET_PX } from './ledger-helpers';
import { sampleTest as test, expect } from './sample';

// Run against the matching build flag; both states preserve their own readiness contract.
let redesign = false;
test.beforeAll(async ({ browser }) => {
  redesign = await detectHeuteRedesign(browser);
});

const rectsApart = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
async function readableControl(control: Locator, scroll: boolean) {
  if (scroll)
    await control.evaluate((element) =>
      element.scrollIntoView({ block: 'center', inline: 'nearest' }),
    );
  await expect(control).toBeVisible();
  const result = await control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const text = [];
    while (walker.nextNode())
      if (walker.currentNode.textContent?.trim()) {
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        text.push(
          ...[...range.getClientRects()].map((r) => ({
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
          })),
        );
      }
    const radius = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
    const insetX = Math.min(Math.max(1, radius), box.width / 4);
    const insetY = Math.min(Math.max(1, radius), box.height / 4);
    const points = [
      [box.x + box.width / 2, box.y + box.height / 2],
      [box.x + insetX, box.y + insetY],
      [box.right - insetX, box.y + insetY],
      [box.x + insetX, box.bottom - insetY],
      [box.right - insetX, box.bottom - insetY],
    ];
    return {
      html: element.outerHTML,
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      text,
      overlays: [...document.querySelectorAll('.fab, .tabbar, .m-head, .topbar')]
        .filter((el) => el.checkVisibility())
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      hits: points.map(([x, y]) => {
        const hit = document.elementFromPoint(x!, y!);
        return element === hit || element.contains(hit);
      }),
    };
  });
  expect(result.box.width, result.html).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  expect(result.box.height, result.html).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  for (const text of result.text) {
    expect(text.x, result.html).toBeGreaterThanOrEqual(result.box.x);
    expect(text.x + text.width, result.html).toBeLessThanOrEqual(result.box.x + result.box.width);
    expect(text.y, result.html).toBeGreaterThanOrEqual(result.box.y);
    expect(text.y + text.height, result.html).toBeLessThanOrEqual(result.box.y + result.box.height);
  }
  for (const overlay of result.overlays)
    expect(rectsApart(result.box, overlay), result.html).toBe(true);
  expect(result.hits, result.html).toEqual([true, true, true, true, true]);
}
test('same-context focus refresh preserves money only in the redesign and clears failed reads', async ({
  page,
}, info) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto(heuteReviewUrl(redesign, '/?monat=2026-09&period=month'));
    const net = page.locator('[data-kennzahl="nettovermoegen"]');
    const budget = page.locator('[data-kennzahl="zu-verteilen"]');
    const low = page.locator('.heute-forecast-low');
    await expect(net).toBeVisible();
    await expect(page.locator('[data-budget-redesign="1"]')).toHaveCount(redesign ? 1 : 0);
    await expect(budget).toBeVisible();
    await expect(low).toBeVisible();
    const netText = await net.textContent();
    const budgetText = await budget.textContent();
    const lowCents = await low.getAttribute('data-cents');
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/heute?*', async (route) => {
      await held;
      await route.fulfill({ status: 503, json: { error: 'synthetic_unavailable' } });
    });
    const read = page.waitForRequest('**/api/heute?*');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      window.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await read;
    try {
      if (redesign) {
        await expect(page.getByText(/Heute-Daten werden aktualisiert/)).toBeVisible();
        await expect(net).toHaveText(netText!);
        await expect(low).toHaveAttribute('data-cents', lowCents!);
        await expect(page.locator('.heute-compact-forecast')).toContainText('17.09.2026');
        await expect(page.locator('.heute-compact-forecast')).toContainText('wird aktualisiert');
      } else await expect(net).toHaveCount(0);
      await expect(budget).toHaveText(budgetText!);
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`refresh-${colorScheme}.png`),
        fullPage: true,
      });
    } finally {
      release();
    }
    await expect(net).toHaveCount(0);
    await expect(page.getByText(/Heute-Daten werden aktualisiert/)).toHaveCount(0);
    await expect(budget).toHaveText(budgetText!);
    await page.unroute('**/api/heute?*');
  }
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`H1 compact hierarchy keeps canonical money, source scopes and all homes in ${colorScheme}`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto('/?monat=2026-09&period=month');
    await expect(page.locator('[data-budget-redesign="1"]')).toHaveCount(redesign ? 1 : 0);
    if (!redesign) {
      await expect(page.locator('.heute-screen')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Zu verteilen', exact: true })).toBeVisible();
      return;
    }
    if (page.viewportSize()!.width < 768) await page.setViewportSize({ width: 390, height: 844 });
    const source = await (await page.request.get('/api/heute?period=month&month=2026-09')).json();
    expect(source.lead.freeCents).toBe(98_826);
    expect(source.forecast35d.report.low.cents).toBe(19_101);
    const primary = page.getByRole('region', { name: 'Frei bis Gehalt', exact: true });
    await expect(primary.getByTestId('heute-lead-value')).toHaveText('988,26 €');
    await expect(primary).toHaveAttribute('data-as-of', '2026-09-17');
    await expect(page.locator('.heute-forecast-low')).toHaveAttribute('data-cents', '19101');
    const tasks = page.locator('.hv-revisions tbody tr');
    await expect(tasks).toHaveCount(4);
    expect(await tasks.allTextContents()).toEqual([
      expect.stringContaining('Kategorien überzogen'),
      expect.stringContaining('Konten zu prüfen'),
      expect.stringContaining('unter Prüfen'),
      expect.stringContaining('Regelbefunde'),
    ]);
    await page.evaluate(() => document.fonts.ready);
    const leadBox = (await primary.boundingBox())!;
    const first = (await tasks.first().boundingBox())!;
    expect(leadBox.y).toBeLessThan(first.y);
    expect(first.y + first.height).toBeLessThanOrEqual(
      page.viewportSize()!.height - (info.project.name === 'desktop' ? 0 : 64),
    );
    await readableControl(page.locator('.hv-lead-value'), true);
    for (const action of await page.locator('.hv-revisions a').all())
      await readableControl(action, true);
    for (const control of await page.locator('.heute-screen :is(a, button):visible').all()) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    }
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath(`hierarchy-${colorScheme}.png`),
      fullPage: true,
    });
    await page.locator('.hv-due').getByRole('link').click();
    const due = page.getByRole('region', { name: 'Fällig 14 Tage' });
    await expect(due.locator('li')).toHaveCount(4);
    const expand = due.getByRole('button', { name: /Weitere .* Fälligkeiten/ });
    await expand.focus();
    await page.keyboard.press('Space');
    await expect(due.locator('li')).toHaveCount(8);
    await due.getByRole('button', { name: 'Weniger Fälligkeiten' }).click();
    await page.getByRole('link', { name: 'Zurück zu Heute', exact: true }).click();
    await page.getByRole('link', { name: 'Mehr zum Monat', exact: true }).click();
    const fold = page.getByRole('button', { name: 'Mehr zum Monat', exact: true });
    const original = await fold.getAttribute('aria-expanded');
    await fold.focus();
    await page.keyboard.press('Space');
    await page.reload();
    await expect(fold).toHaveAttribute('aria-expanded', original === 'true' ? 'false' : 'true');
    await page.goto('/?monat=2026-08&period=month');
    await expect(primary.getByTestId('heute-lead-value')).toHaveText('988,26 €');
    await expect(page.locator('.hv-head:visible .month-name')).toHaveText('August 2026');
    await expect(primary).toHaveAttribute('data-as-of', '2026-09-17');
    await page.keyboard.press('Control+Shift+H');
    await expect(primary.getByTestId('heute-lead-value')).not.toContainText('988');
    await page.keyboard.press('Control+Shift+H');
    await expect(primary.getByTestId('heute-lead-value')).toHaveText('988,26 €');
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => {
      const root = document.documentElement;
      const style = getComputedStyle(root);
      for (const token of [
        'body',
        'meta',
        'label',
        'title',
        'headline',
        'display',
        'figure',
        'dimension',
      ]) {
        const value = Number.parseFloat(style.getPropertyValue(`--fs-${token}`));
        if (Number.isFinite(value)) root.style.setProperty(`--fs-${token}`, `${value * 2}px`);
      }
    });
    await readableControl(page.locator('.hv-lead-value'), true);
    for (const action of await page.locator('.hv-revisions a').all())
      await readableControl(action, true);
    const overflowingBookings = await page
      .locator('.hv-booking-list strong')
      .evaluateAll((labels) =>
        labels
          .filter((label) => label.getBoundingClientRect().right > innerWidth)
          .map((label) => label.textContent),
      );
    expect(overflowingBookings).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`large-text-${colorScheme}.png`),
      fullPage: true,
      scale: 'css',
    });
  });
}
