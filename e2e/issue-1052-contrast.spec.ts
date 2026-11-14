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
      });
    }
  });
}
