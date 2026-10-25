import AxeBuilder from '@axe-core/playwright';
import type { InboxView } from '../apps/web/src/inbox/api';
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
  ['pruefen', '/konten/pruefen', '[role="group"][aria-label="Teil von Prüfen"]'],
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
          const response = await request.get('/api/inbox?segment=auto');
          expect(response.ok()).toBe(true);
          const inbox: InboxView = await response.json();
          const counts = inbox.segments!;
          const shown = inbox.segment!;
          // Axe must scan a populated part, never an empty Prüfen state. The sample seed (served by the real API,
          // not the mocked count in header-q5.spec) holds four open non-overspent items, so the shown part has rows.
          expect(counts[shown]).toBeGreaterThan(0);
          await expect(page.getByTestId('inbox-row').first()).toBeVisible();
          // The segment control has accessible names with the server counters and exactly one pressed part.
          const group = page.getByRole('group', { name: 'Teil von Prüfen' });
          const umsaetze = group.getByRole('button', {
            name: `Umsätze · ${counts.umsaetze}`,
            exact: true,
          });
          const aufgaben = group.getByRole('button', {
            name: `Aufgaben · ${counts.aufgaben}`,
            exact: true,
          });
          await expect(group.getByRole('button')).toHaveCount(2);
          await expect(umsaetze).toHaveAttribute('aria-pressed', String(shown === 'umsaetze'));
          await expect(aufgaben).toHaveAttribute('aria-pressed', String(shown === 'aufgaben'));
          // Overspent categories are no part of Prüfen any more (they live in Heute and Plan).
          expect(inbox.entries.filter((entry) => entry.type === 'envelope')).toEqual([]);
          await expect(page.getByTestId('inbox-overspent-summary')).toHaveCount(0);
          await expect(
            page.getByTestId('inbox-row').filter({ hasText: 'ist überzogen' }),
          ).toHaveCount(0);
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
