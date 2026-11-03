import { expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { redesignReportsOn } from './report-frame';
import { sampleTest as test } from './sample';

const aliases = [
  ['pallocation', 'einzahlungen', 'einzahlungen', '.portfolio-contributions-report'],
  ['pallocation', 'rendite', 'rendite', '.portfolio-performance-report'],
  ['pallocation', 'invalid', 'verteilung', '.portfolio-allocation-report'],
  ['peinzahlungen', 'rendite', 'einzahlungen', '.portfolio-contributions-report'],
  ['prendite', 'verteilung', 'rendite', '.portfolio-performance-report'],
  ['vermoegen', 'rendite', 'verlauf', '.wealth-history-report'],
  ['gesamtuebersicht', 'rendite', 'gesamt', '.whole-picture'],
] as const;
for (const [alias, incoming, view, body] of aliases)
  test(`866 ${alias}/${incoming} preserves its literal intent, period, month and fragment`, async ({
    page,
  }) => {
    await page.goto(
      `/reports/${alias}?darstellung=${incoming}&zeitraum=2026-01..2026-08&monat=2026-08#details`,
    );
    const on = await redesignReportsOn(page);
    const portfolio = ['pallocation', 'peinzahlungen', 'prendite'].includes(alias);
    await expect(page).toHaveURL(
      (url) =>
        url.pathname ===
        (on || !portfolio ? '/reports/vermoegen-schulden' : '/reports/pallocation'),
    );
    await expect(page.locator(body)).toBeVisible();
    const url = new URL(page.url());
    expect(url.searchParams.get('zeitraum')).toBe('2026-01..2026-08');
    expect(url.searchParams.get('monat')).toBe('2026-08');
    expect(url.hash).toBe('#details');
    if (on)
      await expect(
        page.getByRole('combobox', { name: 'Darstellung des Vermögensreports' }),
      ).toHaveValue(view);
    await page.reload();
    await expect(page).toHaveURL(url.href);
    await expect(page.locator(body)).toBeVisible();
  });

const wealthAliases = [
  ['/vermoegen/freiheit', '/reports/vermoegen-schulden', 'freiheit', '.freedom-report'],
  [
    '/vermoegen/portfolio/kennzahlen',
    '/reports/vermoegen-schulden',
    'rendite',
    '.portfolio-metrics',
  ],
  ['/vermoegen/nettovermoegen', '/vermoegen', '', '.wealth-overview'],
  [
    '/vermoegen/nettovermoegen?ansicht=analyse',
    '/reports/vermoegen-schulden',
    'bilanz',
    '.asset-composition',
  ],
] as const;
test('866 net-worth analysis materializes its original YTD fallback for an invalid period', async ({
  page,
}) => {
  await page.goto('/vermoegen/nettovermoegen?ansicht=analyse&zeitraum=invalid#details');
  if (!(await redesignReportsOn(page))) return;
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/reports/vermoegen-schulden' &&
      url.searchParams.get('darstellung') === 'bilanz' &&
      url.searchParams.get('zeitraum') === 'YTD' &&
      url.hash === '#details',
  );
  await expect(page.getByTestId('networth-chart')).toBeVisible();
});
for (const [alias, destination, view, body] of wealthAliases)
  test(`866 wealth alias ${alias} retains complete content, context and fragment`, async ({
    page,
  }, info) => {
    await page.goto(
      `${alias}${alias.includes('?') ? '&' : '?'}zeitraum=3J&monat=2026-08&fokus=investment#details`,
    );
    if (!(await redesignReportsOn(page))) {
      await expect(page).toHaveURL((url) => url.pathname === alias.split('?')[0]);
      return;
    }
    await expect(page).toHaveURL((url) => url.pathname === destination);
    await expect(page.locator(body)).toBeVisible();
    if (alias.includes('kennzahlen') || alias.includes('ansicht=analyse')) {
      mkdirSync('docs/evidence/redesign-reports-20261103-b', { recursive: true });
      await page.screenshot({
        fullPage: true,
        animations: 'disabled',
        path: `docs/evidence/redesign-reports-20261103-b/alias-${alias.includes('kennzahlen') ? 'metrics' : 'networth'}-${info.project.name === 'desktop' ? '1440' : '390'}.png`,
      });
    }
    const target = new URL(page.url());
    expect(target.searchParams.get('zeitraum')).toBe('3J');
    expect(target.searchParams.get('monat')).toBe('2026-08');
    expect(target.searchParams.get('fokus')).toBe('investment');
    expect(target.hash).toBe('#details');
    if (view) expect(target.searchParams.get('darstellung')).toBe(view);
    await page.reload();
    await expect(page).toHaveURL(target.href);
    await expect(page.locator(body)).toBeVisible();
  });
