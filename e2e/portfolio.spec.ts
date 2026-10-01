import AxeBuilder from '@axe-core/playwright';
import { expect as baseExpect, test as plainTest, type Locator, type Page } from '@playwright/test';
import { sampleTest as test, expect } from './sample';
import { VISUAL_BASELINE_PLATFORM } from './visual';

/**
 * Vermögen › Portfolio on the seeded sample server (17.09.2026): the prototype's figures, the
 * savings-plan proposal with undo, the product panel and the price refresh. Desktop and phone
 * share the sample database; only the desktop run writes (and undoes its write).
 */

const toast = (page: Page) => page.locator('.toast.is-open');

test.describe('figures of the prototype', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/vermoegen/portfolio');
    await expect(page.getByTestId('portfolio-value')).toBeVisible();
  });

  test('lead: value, state, chain, KPI row and the link to the reports', async ({ page }) => {
    await expect(page.getByTestId('portfolio-value')).toHaveText('88.000,00 €');
    await expect(page.getByTestId('pf-state')).toHaveText('2 Klassen außerhalb des Bands');
    const chain = page.getByRole('group', { name: 'Maßkette Portfoliowert' });
    await expect(chain).toContainText('Einstand');
    await expect(chain).toContainText('Wertzuwachs');
    await expect(chain).toContainText('88.000 €');
    const labels = await page.locator('.pf-kpi dt').allTextContents();
    expect(labels).toEqual(['Wert', 'TTWROR', 'IRR', 'Weltindex', 'Kosten', 'Ausschüttungen']);
    await expect(page.getByTestId('kpi-wert')).toContainText('88.000 €');
    await page.getByRole('link', { name: /Wie haben sich die Entscheidungen ausgewirkt/ }).click();
    await expect(page).toHaveURL(/\/reports\/prendite$/);
  });

  test('allocation: Soll/Ist per class, outside the band flagged', async ({ page }) => {
    const rows = page.getByTestId('alloc-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Aktien Welt');
    await expect(rows.nth(0)).toContainText('77,8 %');
    await expect(rows.nth(0)).toContainText('Soll 80,0 %');
    await expect(rows.nth(0)).not.toHaveClass(/is-out/);
    await expect(rows.nth(1)).toContainText('Schwellenländer');
    await expect(rows.nth(1)).toContainText('8,0 %');
    await expect(rows.nth(1)).toContainText('Abweichung vom Soll −4,0 Pp');
    await expect(rows.nth(1)).toHaveClass(/is-out/);
    await expect(rows.nth(2)).toContainText('Spekulativ');
    await expect(rows.nth(2)).toContainText('Einzelaktien, Krypto, P2P');
    await expect(rows.nth(2)).toContainText('14,2 %');
    await expect(rows.nth(2)).toHaveClass(/is-out/);
  });

  test('rebalancing: revision A in red pencil, B for R15', async ({ page }) => {
    const rebal = page.locator('.pf-rebal');
    await expect(rebal.locator('tr.rev-row')).toHaveCount(2);
    await expect(rebal.locator('tr.rev-row').nth(0)).toHaveClass(/is-urgent/);
    await expect(rebal).toContainText('Schwellenländer unter Soll');
    await expect(rebal).toContainText('3.560 € fehlen');
    await expect(rebal).toContainText('Spekulativer Anteil 14,2 % über 10 % (R15)');
    await expect(rebal).toContainText('3.700 € über der Grenze');
    await rebal.getByRole('button', { name: 'Sparplan umlenken' }).click();
    await expect(page.getByRole('button', { name: 'Vorschlag übernehmen' })).toBeFocused();
  });

  test('positions by class with group sums, and the platforms', async ({ page }) => {
    const table = page.locator('.pf-pos');
    await expect(table.locator('tr.kgroup')).toHaveCount(3);
    await expect(table.locator('tr.kgroup').nth(0)).toContainText('68.500 €');
    await expect(table.locator('tr.kgroup').nth(2)).toContainText('12.500 €');
    await expect(table.locator('tr.kgroup').nth(2)).toContainText('14,2 %');
    await expect(page.getByTestId('position-row')).toHaveCount(6);
    const etf = page.getByTestId('position-row').filter({ hasText: 'ETF Welt' });
    await expect(etf).toContainText('68.500 €');
    await expect(etf).toContainText('77,8 %');
    await expect(etf).toContainText('+36,5 %');
    await expect(page.getByTestId('position-row').filter({ hasText: 'P2P-Kredite' })).toContainText(
      'manuell',
    );
    await expect(page.locator('.vplat')).toContainText('Broker C');
    await expect(page.locator('.vplat')).toContainText('90,3 %');
    await expect(page.locator('.vplat')).toContainText('R14');
  });

  test('a position opens its price history with the source of every price', async ({ page }) => {
    await page.getByRole('button', { name: 'ETF Welt, Kursverlauf öffnen' }).click();
    const panel = page.getByRole('dialog', { name: 'ETF Welt' });
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('price-chart')).toBeVisible();
    await expect(panel).toContainText('Letzte Kurse');
    await expect(panel).toContainText('Quellen aller');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });
});

test('apply the proposal, then undo it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one writer on the shared sample server');
  const rates = async () => {
    const res = await page.request.get('/api/savings-plans');
    expect(res.ok()).toBe(true);
    const { plans } = (await res.json()) as { plans: { id: string; amountCents: number }[] };
    return plans.map((p) => `${p.id}:${p.amountCents}`).sort();
  };
  await page.goto('/vermoegen/portfolio');
  const before = await rates();
  const table = page.locator('.pf-plan-table');
  await expect(table.getByTestId('plan-row')).toHaveCount(5);
  const welt = table.getByTestId('plan-row').filter({ hasText: 'ETF Welt' });
  await expect(welt).toContainText('317 €');
  await expect(welt).toContainText('300 €');
  await expect(welt).toContainText('bleibt Hauptposition');
  await expect(
    table.getByTestId('plan-row').filter({ hasText: 'ETF Schwellenländer' }),
  ).toContainText('100 €');
  await expect(page.locator('.pf-plans')).toContainText('400 € im Monat');
  await expect(page.locator('.pf-plans')).toContainText(
    'Die Bank ändert den Sparplan nicht automatisch; die App erinnert dich.',
  );

  await page.getByRole('button', { name: 'Vorschlag übernehmen' }).click();
  await expect(toast(page)).toContainText('Sparplan-Vorschlag übernommen');
  await expect.poll(rates).not.toEqual(before);

  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(toast(page)).toContainText('Rückgängig gemacht');
  await expect.poll(rates).toEqual(before);
  await expect(table.getByTestId('plan-row')).toHaveCount(5);
});

test.describe('regression baselines (own screenshots)', () => {
  // The crops leave out the savings plans: the apply test above changes them for a moment.
  const crops = (page: Page) =>
    [
      ['lead', page.locator('.pf-lead')],
      ['allocation', page.locator('.valloc')],
      ['positions', page.locator('.vpos')],
    ] as const;
  const shoot = async (locator: Locator, name: string) => {
    if (process.platform !== VISUAL_BASELINE_PLATFORM) {
      test.info().annotations.push({
        type: 'visual comparison skipped',
        description: `${name}: baselines exist for ${VISUAL_BASELINE_PLATFORM} only`,
      });
      return;
    }
    await baseExpect(locator).toHaveScreenshot(name);
  };

  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme} vermoegen-portfolio`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/vermoegen/portfolio');
      await expect(page.getByTestId('portfolio-value')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      for (const [name, locator] of crops(page)) {
        await shoot(locator, `vermoegen-portfolio-${name}-${scheme}.png`);
      }
    });
  }
});

test.describe('axe', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`no serious or critical violations (${scheme}, product panel open)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/vermoegen/portfolio');
      await expect(page.getByTestId('portfolio-value')).toBeVisible();
      const scan = async () =>
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze()
        ).violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => ({
            rule: v.id,
            targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
          }));
      expect(await scan(), 'page').toEqual([]);
      await page.getByRole('button', { name: 'ETF Welt, Kursverlauf öffnen' }).click();
      await expect(page.getByTestId('product-panel')).toBeVisible();
      expect(await scan(), 'product panel').toEqual([]);
    });
  }
});

// The main server starts empty: the page must work without any portfolio, and the refresh runs
// on its fixture sources (no network, nothing to price).
plainTest('empty portfolio: calm states and the price refresh toast', async ({ page }) => {
  await page.goto('/vermoegen/portfolio');
  await expect(page.getByTestId('portfolio-value')).toBeVisible();
  await expect(page.getByTestId('portfolio-value')).toHaveText('0,00 €');
  await expect(page.locator('.pf-rebal')).toContainText('Alle Anlageklassen liegen im Band.');
  await expect(page.locator('.pf-plans')).toContainText('Noch keine Sparpläne');
  await expect(page.locator('.vpos')).toContainText('Noch keine Positionen');
  const viewport = page.viewportSize();
  const phone = viewport !== null && viewport.width < 768;
  const refresh = phone
    ? page.locator('.pf-refresh-phone').getByRole('button', { name: 'Kurse aktualisieren' })
    : page.getByRole('button', { name: 'Kurse aktualisieren' }).first();
  await refresh.click();
  await expect(page.locator('.toast.is-open')).toContainText('Kurse aktualisiert');
});
