import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import { sampleTest as test, expect } from './sample';
import { openCustomExplorer } from './explorer-controls';

const areas = [
  ['Heute', '/?monat=2026-09', '[data-testid="heute-lead-value"]'],
  ['Plan Monat', '/plan/monat?monat=2026-09', '.plan'],
  ['Plan Jahr', '/plan/jahr', '.plan-year-v2'],
  ['Plan Erwartet', '/plan/erwartet', '.payments-v2'],
  ['Konten', '/konten', '.account-overview-redesign'],
  ['Buchungen', '/konten/buchungen', '.ktable'],
  ['Prüfen', '/konten/pruefen', '.inbox-task-sources tbody tr'],
  ['Vermögen', '/vermoegen/nettovermoegen', '.wealth-redesign'],
  ['Portfolio', '/vermoegen/portfolio', '.wealth-redesign'],
  ['Reports', '/reports', '.report-hub-catalog'],
  ['Kontakte', '/reports/kontakte', '.r4-contact-report'],
  ['Monatsbericht', '/reports/onepager?monat=2026-08', '[data-testid="r5-month-summary"]'],
  ['Jahresbericht', '/reports/jahresreport', '[data-testid="r5-year-summary"]'],
  ['Explorer', '/reports/explorer', '[data-testid="ex-table"]'],
  ['Einstellungen', '/einstellungen/profil', '.settings-redesign'],
  ['Kontaktstammdaten', '/einstellungen/kontakte', '.settings-contacts-v2'],
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme, reducedMotion: 'reduce' });
    for (const [area, path, ready] of areas) {
      test(`${area}: main content has measurable, sufficient contrast`, async ({ page }, info) => {
        if (area === 'Explorer') await openCustomExplorer(page);
        else await page.goto(path);
        await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
        await expect(page.locator(ready).first()).toBeVisible();
        await expect(page.locator('.main [aria-busy="true"]:visible')).toHaveCount(0);
        await page.evaluate(async (value) => {
          document.documentElement.dataset['theme'] = value;
          await document.fonts.ready;
        }, theme);
        const result = await new AxeBuilder({ page }).include('.main').analyze();
        const auditPath = info.outputPath('axe-main.json');
        writeFileSync(auditPath, JSON.stringify(result, null, 2));
        await info.attach('axe-main.json', {
          path: auditPath,
          contentType: 'application/json',
        });
        if (
          [
            'Plan Monat',
            'Konten',
            'Monatsbericht',
            'Jahresbericht',
            'Explorer',
            'Einstellungen',
          ].includes(area)
        ) {
          const screenshotPath = info.outputPath('contrast-view.png');
          await page.screenshot({ path: screenshotPath });
          await info.attach('contrast-view.png', {
            path: screenshotPath,
            contentType: 'image/png',
          });
        }
        expect(result.violations).toEqual([]);
        // Keep every axe rule active. Native select arrows and SVG/math diagnostics also occur
        // without the grid; the attached report retains them for review. The grid must never
        // turn content into pseudoContent or add an unknown gradient under text.
        const incomplete = result.incomplete
          .filter((rule) => rule.id === 'color-contrast')
          .flatMap((rule) => rule.nodes);
        for (const node of incomplete) {
          const reasons = node.any.map((check) => check.data?.messageKey as string);
          expect(reasons, JSON.stringify(node.target)).not.toContain('pseudoContent');
          if (reasons.includes('bgGradient')) {
            expect(
              await page.locator(node.target[0] as string).evaluate((element) => {
                const style = getComputedStyle(element);
                return (
                  element instanceof HTMLSelectElement &&
                  style.backgroundImage.startsWith('linear-gradient(45deg,') &&
                  style.backgroundImage.includes('linear-gradient(135deg,') &&
                  // WebKit collapses identical list entries; each layer still uses 5 px.
                  ['5px 5px', '5px 5px, 5px 5px'].includes(style.backgroundSize)
                );
              }),
              JSON.stringify(node.target),
            ).toBe(true);
          }
        }
        const measured = (result.passes.find((rule) => rule.id === 'color-contrast')?.nodes ?? [])
          .filter((node) =>
            node.any.some(
              (check) =>
                Number.isFinite(check.data?.contrastRatio) &&
                check.data?.fgColor &&
                check.data?.bgColor,
            ),
          )
          .map((node) => node.target[0] as string);
        if (area === 'Prüfen') {
          for (const selector of ['[data-konten-slot="inbox-actions"] a']) {
            expect(
              await page
                .locator(selector)
                .evaluate(
                  (element, selectors) =>
                    selectors.some((candidate) => document.querySelector(candidate) === element),
                  measured,
                ),
              selector,
            ).toBe(true);
          }
        }
        const sentinels = page
          .locator(
            '.main #overview-lead-title:visible, [data-testid="budget-accounts-balance"]:visible, .main h1:not(.sr-only):visible, .main .area-page-menu > summary:not(:has(.sr-only)):visible, .main .month-reference-income:visible, [data-testid="heute-lead-value"]:visible, [data-testid="report-frame-result"]:visible, [data-testid="r5-month-income"]:visible, [data-testid="r5-year-income"]:visible',
          )
          .filter({ hasText: /\S/ });
        expect(await sentinels.count()).toBeGreaterThan(0);
        for (const sentinel of await sentinels.all()) {
          await expect(sentinel).toBeInViewport();
          expect(
            await sentinel.evaluate(
              (element, selectors) =>
                selectors.some((selector) => {
                  const candidate = document.querySelector(selector);
                  return (
                    candidate !== null && (element === candidate || element.contains(candidate))
                  );
                }),
              measured,
            ),
            await sentinel.textContent(),
          ).toBe(true);
        }
        const grid = await page.locator('.main').evaluate((element) => {
          const style = getComputedStyle(element);
          return { image: style.backgroundImage, size: style.backgroundSize };
        });
        expect(grid.image).toContain('linear-gradient');
        expect(grid.size).toBe('40px 40px, 40px 40px, 8px 8px, 8px 8px');
        if (area === 'Prüfen') {
          await page.getByLabel('Was zählt bei Prüfen?', { exact: true }).click();
          const explanation = page.locator(
            '[data-konten-slot="inbox-info"] .konten-menu-content p',
          );
          await expect(explanation).toBeVisible();
          // Axe cannot resolve the differing stacks beneath overlay text (elmPartiallyObscuring).
          // Check its actual opaque foreground/surface pair against the same WCAG text threshold.
          const contrast = await explanation.evaluate((element) => {
            const text = getComputedStyle(element);
            const surface = getComputedStyle(element.closest('.konten-menu-content')!);
            const luminance = (color: string) => {
              const channels = color.match(/[\d.]+/g)!.map(Number);
              if (channels.length > 3 && channels[3] !== 1)
                throw new Error('Expected opaque contrast colors');
              return channels.slice(0, 3).reduce((sum, channel, index) => {
                const value = channel / 255;
                return (
                  sum +
                  [0.2126, 0.7152, 0.0722][index]! *
                    (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
                );
              }, 0);
            };
            const foreground = luminance(text.color);
            const background = luminance(surface.backgroundColor);
            return {
              ratio:
                (Math.max(foreground, background) + 0.05) /
                (Math.min(foreground, background) + 0.05),
              textOpacity: text.opacity,
              surfaceOpacity: surface.opacity,
              backgroundImage: surface.backgroundImage,
            };
          });
          expect(contrast.textOpacity).toBe('1');
          expect(contrast.surfaceOpacity).toBe('1');
          expect(contrast.backgroundImage).toBe('none');
          expect(contrast.ratio).toBeGreaterThanOrEqual(4.5);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await page.screenshot({ path: info.outputPath('inbox-help.png') });
        }
      });
    }
  });
}
