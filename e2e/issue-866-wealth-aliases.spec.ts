import { expect } from '@playwright/test';
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
