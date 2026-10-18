import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Issue #561: Konten › Prüfen shows "Umsätze · Aufgaben" with counters, type icons with accessible
 * names, no "Rev." column and no overspent-category row. The queue is a synthetic fixture.
 */

const task = (id: string, kind: string, title: string, refType: string | null = null) => ({
  type: 'stored',
  id,
  kind,
  title,
  detail: null,
  refType,
  refId: null,
  urgent: false,
  createdAt: '2026-09-17T12:00:00Z',
});
const entries = [
  task('t-1', 'consent', 'Einwilligung erneuern'),
  task('t-2', 'stale_value', 'Wert veraltet'),
];
const segments = { umsaetze: 0, aufgaben: 2 };

for (const theme of ['light', 'dark'] as const) {
  test(`Prüfen segments, counters and icons (${theme})`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.route(/\/api\/inbox\?/, (route) => {
      const url = new URL(route.request().url());
      const shown = url.searchParams.get('segment') === 'umsaetze' ? 'umsaetze' : 'aufgaben';
      const list = shown === 'aufgaben' ? entries : [];
      return route.fulfill({
        json: {
          asOf: '2026-09-17',
          count: 2,
          entries: list,
          overspentSummary: null,
          readSourceSummaries: [],
          segment:
            shown === 'aufgaben' && url.searchParams.get('segment') === 'auto' ? 'aufgaben' : shown,
          segments,
          totalEntries: list.length,
          countsByKind: { consent: 1, stale_value: 1 },
          limit: 50,
          offset: 0,
          next: null,
        },
      });
    });
    await page.route(/\/api\/inbox\/count/, (route) =>
      route.fulfill({ json: { asOf: '2026-09-17', count: 2 } }),
    );
    await page.goto('/konten/pruefen');

    // Opens on the part with work; counters equal the lists and the pill their sum.
    const group = page.getByRole('group', { name: 'Teil von Prüfen' });
    await expect(group.getByRole('button', { name: 'Umsätze · 0' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(group.getByRole('button', { name: 'Aufgaben · 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('inbox-row')).toHaveCount(2);

    // Type icons carry accessible names; no revision column, no overspent row.
    await expect(page.getByRole('img', { name: 'Einwilligung' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Veralteter Wert' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Rev.' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Aufgabe' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Aktion' })).toBeVisible();
    await expect(page.getByTestId('inbox-overspent-summary')).toHaveCount(0);
    await expect(page.getByText('Gehaltszettel hochladen')).toHaveCount(0);

    // Switching to Umsätze shows the empty part, the counters stay.
    await group.getByRole('button', { name: 'Umsätze · 0' }).click();
    await expect(page.getByText('Keine offenen Umsätze.')).toBeVisible();
    await group.getByRole('button', { name: 'Aufgaben · 2' }).click();
    await expect(page.getByTestId('inbox-row')).toHaveCount(2);

    // No horizontal page scroll, touch targets of at least 44 px on the phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    if (info.project.name !== 'desktop') {
      for (const button of await group.getByRole('button').all()) {
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }

    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({
      path: `docs/evidence/issue-561-pruefen-segments/pruefen-${info.project.name}-${theme}.png`,
      fullPage: true,
    });
  });
}
