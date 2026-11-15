import { performance } from 'node:perf_hooks';
import { expect, sampleTest as test } from './sample';
import { setTheme } from './theme';

// Diagnostic comparison, not a speed threshold: runner load affects all three modes.
// Keep the ordinary product specs and their timeouts/assertions unchanged.
for (const theme of ['light', 'dark'] as const) {
  for (const mode of ['background', 'legacy-layer', 'none'] as const) {
    test(`1064 grid timing: ${theme}, ${mode}`, async ({ page, browser }, info) => {
      await page.addInitScript(() => {
        localStorage.setItem('budget.plan.months', '1');
        localStorage.removeItem('budget.plan.overview');
      });
      await page.goto('/plan/monat?monat=2026-09');
      await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
      const main = page.locator('.main');
      await expect(page.getByRole('complementary', { name: 'Plan-Inspektor' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      // Reconstruct #1049's ON layer using the same grid tokens and origin as today's background.
      // The third mode removes both sources; neither override changes layout or content.
      if (mode !== 'background') {
        // Use the already loaded same-origin CSSOM; the app correctly rejects inline styles.
        await page.evaluate((value) => {
          const sheet = [...document.styleSheets].find((item) =>
            item.href?.startsWith(location.origin),
          );
          if (!sheet) throw new Error('Expected a same-origin app stylesheet');
          sheet.insertRule(
            `.app[data-budget-redesign='1'] .main { background-image: none !important; }`,
            sheet.cssRules.length,
          );
          sheet.insertRule(
            `.app[data-budget-redesign='1'] .main::before {
                 display: ${value === 'none' ? 'none' : 'block'} !important;
                 inset: 0; width: auto; height: auto; mask-image: none;
                 background-image: var(--drafting-grid);
                 background-size: var(--drafting-grid-size);
                 background-position: 0 0; overflow-anchor: none;
               }`,
            sheet.cssRules.length,
          );
        }, mode);
      }
      const themeStart = performance.now();
      await setTheme(page, theme);
      const themeMs = performance.now() - themeStart;
      const styles = await main.evaluate((element) => {
        const background = getComputedStyle(element);
        const layer = getComputedStyle(element, '::before');
        return {
          backgroundImage: background.backgroundImage,
          backgroundSize: background.backgroundSize,
          layerDisplay: layer.display,
          layerImage: layer.backgroundImage,
          layerSize: layer.backgroundSize,
          layerMask: layer.maskImage,
        };
      });
      expect(styles.backgroundImage === 'none').toBe(mode !== 'background');
      expect(styles.layerDisplay).toBe(mode === 'legacy-layer' ? 'block' : 'none');
      if (mode === 'legacy-layer') {
        expect(styles.layerImage).toContain('linear-gradient(');
        expect(styles.layerSize).toContain('40px 40px');
        expect(styles.layerSize).toContain('8px 8px');
        expect(styles.layerMask).toBe('none');
      } else if (mode === 'background') {
        expect(styles.backgroundImage).toContain('linear-gradient(');
        expect(styles.backgroundSize).toContain('40px 40px');
        expect(styles.backgroundSize).toContain('8px 8px');
      }
      const frames = await page.evaluate(async () => {
        const gaps: number[] = [];
        let previous = await new Promise<number>(requestAnimationFrame);
        const maxScroll = document.documentElement.scrollHeight - innerHeight;
        for (let index = 0; index < 12; index++) {
          window.scrollTo(0, index % 2 === 0 ? maxScroll : 0);
          const now = await new Promise<number>(requestAnimationFrame);
          gaps.push(now - previous);
          previous = now;
        }
        return { gaps, maxScroll, scrollY: window.scrollY };
      });
      expect(frames.maxScroll).toBeGreaterThan(0);
      expect(frames.scrollY).toBe(0);
      const geometry = await main.boundingBox();
      expect(geometry).not.toBeNull();
      const screenshotStart = performance.now();
      const screenshot = await page.screenshot({ animations: 'disabled' });
      const screenshotMs = performance.now() - screenshotStart;
      await info.attach('grid-view', { body: screenshot, contentType: 'image/png' });
      await info.attach('grid-timing', {
        body: JSON.stringify({
          theme,
          mode,
          project: info.project.name,
          browser: browser.version(),
          viewport: page.viewportSize(),
          geometry,
          styles,
          themeMs,
          screenshotMs,
          ...frames,
        }),
        contentType: 'application/json',
      });
    });
  }
}
