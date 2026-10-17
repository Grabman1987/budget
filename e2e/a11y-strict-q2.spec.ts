import AxeBuilder from '@axe-core/playwright';
import type { InboxView } from '../apps/web/src/inbox/api';
import { eur } from '../apps/web/src/ledger/format';
import { expect as baseExpect, sampleTest as test } from './sample';

const expect = baseExpect.configure({ timeout: 60_000 });
test.describe.configure({ timeout: 150_000 });

// Separate from the existing serious/critical checks: no impact, rule, tag or page exclusions.
const pages = [
  ['sparquote', '/reports/sparquote', '[data-testid="savings-chart"]'],
  ['cashflow', '/reports/cashflow', '[data-testid="cashflow-net-chart"]'],
  ['vermoegen-schulden', '/reports/vermoegen-schulden', '[data-testid="assets-debts-chart"]'],
  ['vergleich', '/reports/vergleich', '[data-testid="vg-consumption"]'],
  ['projekte', '/reports/projekte', '.pp-project .pp-chart'],
  ['gesamtuebersicht', '/reports/gesamtuebersicht', '[data-testid="whole-chart"]'],
  ['pruefen', '/konten/pruefen', '[data-testid="inbox-overspent-summary"]'],
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme });

    for (const [name, path, ready] of pages) {
      test(`${name}: zero Axe violations at every impact level`, async ({
        page,
        request,
        isMobile,
      }, info) => {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        // Wait for populated content, so a passing scan cannot just cover a loading/empty page.
        await expect(page.locator(ready).first()).toBeVisible();
        await page.evaluate(async (value) => {
          document.documentElement.dataset['theme'] = value;
          await document.fonts.ready;
        }, theme);

        if (name === 'pruefen') {
          const response = await request.get('/api/inbox');
          expect(response.ok()).toBe(true);
          const inbox: InboxView = await response.json();
          const envelopes = inbox.entries.filter((entry) => entry.type === 'envelope');
          expect(envelopes.length).toBeGreaterThan(1);
          const deficitCents = envelopes.reduce((sum, entry) => sum + entry.deficitCents, 0);
          expect(Number.isSafeInteger(deficitCents)).toBe(true);
          const summary = page.getByTestId('inbox-overspent-summary');
          await expect(summary).toHaveCount(1);
          await expect(summary).toContainText(`${envelopes.length} Kategorien überzogen`);
          await expect(summary).toContainText(eur(deficitCents));
          await expect(
            page.getByTestId('inbox-row').filter({ hasText: 'ist überzogen' }),
          ).toHaveCount(0);
          await expect(
            summary.getByRole('link', { name: 'Im Plan decken', exact: true }),
          ).toHaveAttribute('href', /\/plan\/monat\?monat=2026-09&ansicht=triage/);
        }

        const axe = await new AxeBuilder({ page }).analyze();
        await info.attach('axe.json', {
          body: JSON.stringify(axe, null, 2),
          contentType: 'application/json',
        });
        expect.soft(axe.violations, `${path} ${theme}: all impacts`).toEqual([]);

        if (isMobile) {
          expect(page.viewportSize()?.width).toBe(390);
          expect
            .soft(
              await page.evaluate(() => ({
                viewport: window.innerWidth,
                overflow: document.documentElement.scrollWidth > window.innerWidth,
              })),
              `${path} ${theme}: no horizontal page scroll`,
            )
            .toEqual({ viewport: 390, overflow: false });

          const controls = page.locator(
            'a[href]:visible, button:visible, input:visible, select:visible, textarea:visible, ' +
              'summary:visible, [role="button"]:visible, [role="link"]:visible, ' +
              '[tabindex]:not([tabindex="-1"]):visible',
          );
          expect(await controls.count()).toBeGreaterThan(0);
          const undersized = await controls.evaluateAll((elements) =>
            elements
              .map((element) => {
                const { width, height } = element.getBoundingClientRect();
                return {
                  target: element.outerHTML.slice(0, 200),
                  width,
                  height,
                };
              })
              .filter(({ width, height }) => width < 44 || height < 44),
          );
          expect.soft(undersized, `${path} ${theme}: touch targets >= 44 × 44 px`).toEqual([]);
        }

        await info.attach(`${name}-${theme}.png`, {
          body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
          contentType: 'image/png',
        });
      });
    }
  });
}
