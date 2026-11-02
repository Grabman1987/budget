import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { MIN_TARGET_PX } from './ledger-helpers';
import { sampleTest as test, expect } from './sample';

// Run against the matching build flag; both states preserve their own readiness contract.
const redesign = process.env['VITE_BUDGET_REDESIGN'] === '1';

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
async function readableNextWork(page: Page, enlarged: boolean) {
  const rows = page.locator('.heute-priorities .heute-attention > .attention-row');
  await expect(rows).toHaveCount(4);
  for (const row of await rows.all()) {
    await row.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
    const layout = await row.evaluate((element) => {
      const description = element.querySelector(':scope > span')!;
      const d = description.getBoundingClientRect();
      const b = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(description);
      return {
        box: { x: b.x, y: b.y, width: b.width, height: b.height },
        description: { x: d.x, y: d.y, width: d.width, height: d.height },
        lines: [...range.getClientRects()].map((r) => ({
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        })),
      };
    });
    for (const line of layout.lines) {
      expect(line.x).toBeGreaterThanOrEqual(layout.description.x);
      expect(line.x + line.width).toBeLessThanOrEqual(
        layout.description.x + layout.description.width,
      );
      expect(line.y).toBeGreaterThanOrEqual(layout.description.y);
      expect(line.y + line.height).toBeLessThanOrEqual(
        layout.description.y + layout.description.height,
      );
    }
    const actions = row.locator('a:visible, button:visible, summary:visible');
    for (const action of await actions.all()) {
      await readableControl(action, true);
      const box = (await action.boundingBox())!;
      const description = await row.locator(':scope > span').boundingBox();
      const rowBox = (await row.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(rowBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
      expect(box.y).toBeGreaterThanOrEqual(rowBox.y);
      expect(box.y + box.height).toBeLessThanOrEqual(rowBox.y + rowBox.height);
      expect(rectsApart(description!, box)).toBe(true);
      if (enlarged) expect(box.y).toBeGreaterThanOrEqual(description!.y + description!.height);
    }
    const actionBoxes = await actions.evaluateAll((elements) =>
      elements.map((element) => {
        const b = element.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      }),
    );
    for (let index = 0; index < actionBoxes.length; index++)
      for (const other of actionBoxes.slice(index + 1))
        expect(rectsApart(actionBoxes[index]!, other)).toBe(true);
    if (enlarged) expect(layout.description.width).toBe(layout.box.width);
  }
  const boxes = await rows.evaluateAll((elements) =>
    elements.map((element) => {
      const b = element.getBoundingClientRect();
      return { y: b.y, height: b.height };
    }),
  );
  for (let index = 1; index < boxes.length; index++)
    expect(boxes[index]!.y).toBeGreaterThanOrEqual(boxes[index - 1]!.y + boxes[index - 1]!.height);
  await page.evaluate(() => window.scrollTo(0, 0));
}

test('same-context focus refresh preserves money only in the redesign and clears failed reads', async ({
  page,
}, info) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto('/?monat=2026-09&period=month');
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
  test(`H1 hierarchy keeps canonical money, current-day scopes and all homes in ${colorScheme}`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto('/?monat=2026-09&period=month');
    await expect(page.locator('[data-budget-redesign="1"]')).toHaveCount(redesign ? 1 : 0);
    const primary = page.getByRole('region', { name: 'Spielraum bis Gehalt' });
    if (!redesign) {
      await expect(page.locator('.heute--redesign')).toHaveCount(0);
      await expect(primary.getByTestId('heute-lead-value')).toHaveCount(0);
      return;
    }
    const response = await page.request.get('/api/heute?period=month&month=2026-09');
    const source = await response.json();
    expect(source.lead.freeCents).toBe(98_826);
    expect(source.forecast35d.report.low.cents).toBe(19_101);
    await expect(primary.getByTestId('heute-lead-value')).toHaveText('988,26 €');
    await expect(primary).toContainText('kein Kontostand und kein Überziehungsrahmen');
    await expect(primary).toContainText('Stand heute · 17.09.2026');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.heute-forecast-low')).toHaveAttribute('data-cents', '19101');
    const attention = page.locator('.heute-priorities .heute-attention');
    await expect(attention).toBeVisible();
    const rows = attention.locator(':scope > .attention-row');
    await expect(rows).toHaveCount(4);
    expect(await rows.allTextContents()).toEqual([
      expect.stringContaining('Kategorien überzogen'),
      expect.stringContaining('Regelbefunde'),
      expect.stringContaining('unter Prüfen'),
      expect.stringContaining('Konten warten'),
    ]);
    const leadBox = (await primary.boundingBox())!;
    const workBox = (await attention.boundingBox())!;
    if (page.viewportSize()!.width === 1440) {
      expect(workBox.x).toBeGreaterThanOrEqual(leadBox.x + leadBox.width);
      expect(workBox.y).toBe(leadBox.y);
    } else {
      expect(leadBox.y).toBeLessThan(page.viewportSize()!.height);
      expect(workBox.y).toBeLessThan(page.viewportSize()!.height);
    }
    await readableControl(primary.getByTestId('heute-lead-value'), false);
    const initial = page.viewportSize()!.height >= 844 ? rows : rows.first();
    for (const action of await initial.locator('a:visible, button:visible').all())
      await readableControl(action, false);
    await readableNextWork(page, false);
    await expect(page.getByRole('region', { name: 'Finanz-Check' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Letzte Buchungen', exact: true }),
    ).toBeVisible();
    const due = page.getByRole('region', { name: 'Fällig 14 Tage' });
    await expect(due.locator('li')).toHaveCount(4);
    const separated = await due
      .locator('.heute-account-preview')
      .first()
      .evaluate((link) => {
        const detail = link.parentElement!.querySelector('.heute-upcoming-meta')!;
        return detail.getBoundingClientRect().top >= link.getBoundingClientRect().bottom;
      });
    expect(separated).toBe(true);
    const expand = due.getByRole('button', { name: /Weitere .* Fälligkeiten/ });
    await expand.focus();
    await page.keyboard.press('Space');
    await expect(due.locator('li')).toHaveCount(8);
    await due.getByRole('button', { name: 'Weniger Fälligkeiten' }).click();
    await page.evaluate(() => document.fonts.ready);
    for (const control of await page
      .locator('.heute--redesign :is(button, a, summary):visible')
      .all()) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    }
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath(`hierarchy-${colorScheme}.png`),
      fullPage: true,
    });
    const fold = page.getByRole('button', { name: 'Mehr zum Monat', exact: true });
    const original = await fold.getAttribute('aria-expanded');
    await fold.focus();
    await page.keyboard.press('Space');
    await expect(fold).toHaveAttribute('aria-expanded', original === 'true' ? 'false' : 'true');
    await page.reload();
    await expect(fold).toHaveAttribute('aria-expanded', original === 'true' ? 'false' : 'true');
    await page.goto('/?monat=2026-09&period=payday');
    await expect(primary.getByTestId('heute-lead-value')).toHaveText('988,26 €');
    await expect(
      page.getByTestId('heute-kennzahlen').getByRole('heading', { name: 'Verfügbar im Budget' }),
    ).toBeVisible();
    await page.keyboard.press('Control+Shift+H');
    await expect(primary.getByTestId('heute-lead-value')).not.toContainText('988');
    await expect(primary.getByTestId('heute-lead-value')).not.toHaveAttribute('aria-label', /988/);
    await page.keyboard.press('Control+Shift+H');
    await expect(primary.getByTestId('heute-lead-value')).toHaveText('988,26 €');
    await fold.scrollIntoViewIfNeeded();
    const foldBox = (await fold.boundingBox())!;
    const controls = await page
      .locator('.tabbar:visible, .fab:visible')
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
    if (controls.length)
      expect(foldBox.y + foldBox.height).toBeLessThanOrEqual(Math.min(...controls));
    await page.goto('/?monat=2026-08&period=month');
    await expect(primary.getByTestId('heute-lead-value')).toHaveText('988,26 €');
    await expect(page.getByTestId('heute-month-note')).toContainText('August 2026');
    await expect(
      page.getByRole('heading', { name: 'August 2026 · Pace', exact: true }),
    ).toBeVisible();
    await expect(primary).toContainText('Stand heute · 17.09.2026');
    await expect(attention).toContainText('Stand heute · 17.09.2026');
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    // Programmatic text enlargement of the existing type tokens, not a native device text-setting claim.
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
    await readableControl(primary.getByTestId('heute-lead-value'), true);
    await expect(primary.getByTestId('heute-lead-value')).toHaveText('988,26 €');
    await readableNextWork(page, true);
    for (const row of await due.locator('li').all()) {
      const separation = await row.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element.querySelector('time')!);
        const date = range.getBoundingClientRect();
        const source = element.querySelector('.heute-account-preview')!.getBoundingClientRect();
        return { dateRight: date.right, sourceLeft: source.left };
      });
      expect(separation.dateRight).toBeLessThanOrEqual(separation.sourceLeft);
    }
    const wrapped = [
      page.getByTestId('heute-month-note').getByRole('button', { name: 'Zum aktuellen Monat' }),
      due.getByRole('button', { name: /Diesen Monat streichen/ }).first(),
      due.getByRole('button', { name: /Weitere .* Fälligkeiten/ }),
    ];
    for (const control of wrapped) {
      await readableControl(control, true);
    }
    const strike = (await wrapped[1]!.boundingBox())!;
    const expansion = (await wrapped[2]!.boundingBox())!;
    expect(rectsApart(strike, expansion)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    if (!fits)
      console.log(
        'H1 large-text overflow',
        await page.evaluate(() =>
          [...document.querySelectorAll('body *')]
            .flatMap((element) => {
              const box = element.getBoundingClientRect();
              return box.width > 0 && (box.right > innerWidth || box.left < 0)
                ? [
                    {
                      tag: element.tagName,
                      class: element.className,
                      text: element.textContent?.slice(0, 70),
                      x: box.x,
                      width: box.width,
                    },
                  ]
                : [];
            })
            .slice(0, 25),
        ),
      );
    expect(fits).toBe(true);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    // Keep the complete page at CSS-pixel output: 3x WebKit exceeds the bitmap limit.
    await page.screenshot({
      path: info.outputPath(`large-text-${colorScheme}.png`),
      fullPage: true,
      scale: 'css',
    });
  });
}
