import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';

// Run against the matching build flag; both states preserve their own readiness contract.
const redesign = process.env['VITE_BUDGET_REDESIGN'] === '1';

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
    await expect(page.getByRole('region', { name: 'Finanz-Check' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Letzte Buchungen', exact: true }),
    ).toBeVisible();
    const due = page.getByRole('region', { name: 'Fällig 14 Tage' });
    await expect(due.locator('li')).toHaveCount(4);
    const expand = due.getByRole('button', { name: /Weitere .* Fälligkeiten/ });
    await expand.focus();
    await page.keyboard.press('Space');
    await expect(due.locator('li')).toHaveCount(8);
    await due.getByRole('button', { name: 'Weniger Fälligkeiten' }).click();
    await page.evaluate(() => document.fonts.ready);
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
    await page.screenshot({
      path: info.outputPath(`large-text-${colorScheme}.png`),
      fullPage: true,
    });
    expect(fits).toBe(true);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  });
}
