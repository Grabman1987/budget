import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, sampleTest as test } from './sample';

/**
 * Plan › Monat toolbar (#588): "Verteilen ▾" and "Optionen ▾" replace "Schnell zuweisen", the
 * "Ansicht" select, the month-span buttons and the ⋯ menu. Read-only on the shared sample ledger.
 * The booking calls are pinned in `issue-588-plan-menus-undo.spec.ts` and the unit tests.
 */

const EVIDENCE = 'docs/evidence/issue-588-plan-menus';
const menuSummary = (page: Page, name: string) =>
  page.locator('.plan-menu summary', { hasText: name });
/** The panel of one menu only (both panels exist in the DOM). */
const menuPanel = (page: Page, name: string) =>
  page
    .locator('details.plan-menu', { has: page.locator('summary', { hasText: name }) })
    .locator('.plan-menu-panel');

test('the old controls are gone; both menus are keyboard operable and named', async ({
  page,
  isMobile,
}) => {
  await page.goto('/plan/monat?monat=2026-09');
  await expect(menuSummary(page, 'Verteilen')).toBeVisible();
  await expect(menuSummary(page, 'Optionen')).toBeVisible();
  await expect(page.getByText('Schnell zuweisen')).toHaveCount(0);
  await expect(page.getByLabel('Weitere Monatsaktionen')).toHaveCount(0);
  await expect(page.locator('.ptoolbar select')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Monat abschließen', exact: true })).toBeVisible();

  // Enter opens, arrows walk, Esc closes and gives the focus back to the summary.
  const verteilen = menuSummary(page, 'Verteilen');
  await verteilen.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('group', { name: 'Verteilen', exact: true });
  await expect(panel).toBeVisible();
  const items = panel.getByRole('button');
  await page.keyboard.press('ArrowDown');
  await expect(items.first()).toBeFocused();
  await expect(items.first()).toHaveText('Leere füllen');
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(verteilen).toBeFocused();
  // Space opens as well.
  await page.keyboard.press('Space');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');

  // Optionen: Ansicht defaults to "Gruppen", no "Nur Überzogene".
  const optionen = menuSummary(page, 'Optionen');
  await optionen.focus();
  await page.keyboard.press('Enter');
  const ansicht = page.getByRole('group', { name: 'Ansicht', exact: true });
  await expect(ansicht.getByRole('button')).toHaveText([
    'Gruppen',
    'Wasserfall',
    'Zeit',
    'Klassen',
  ]);
  await expect(ansicht.getByRole('button', { name: 'Gruppen' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('Nur Überzogene')).toHaveCount(0);
  if (!isMobile) {
    const months = page.getByRole('group', { name: 'Anzahl Monate' });
    await expect(months.getByRole('button')).toHaveText(['1 Monat', '2 Monate', '3 Monate']);
  }
  await expect(
    page.getByRole('link', { name: 'Monatsabschluss starten oder fortsetzen' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Zeit', exact: true }).click();
  await expect(menuPanel(page, 'Optionen')).toBeHidden();
  await expect(optionen).toBeFocused();
  await optionen.click();
  await expect(page.getByRole('button', { name: 'Zeit', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('"Alle einklappen" and the month span work from "Optionen ▾"', async ({ page, isMobile }) => {
  await page.goto('/plan/monat?monat=2026-09');
  const optionen = menuSummary(page, 'Optionen');
  await expect(page.locator('tr.pgroup').first()).toBeVisible();
  await optionen.click();
  await menuPanel(page, 'Optionen')
    .getByRole('button', { name: 'Alle einklappen', exact: true })
    .click();
  await expect(page.locator('tr.pgroup:not(.is-collapsed)')).toHaveCount(0);
  await optionen.click();
  await menuPanel(page, 'Optionen')
    .getByRole('button', { name: 'Alle ausklappen', exact: true })
    .click();
  await expect(page.locator('tr.pgroup.is-collapsed')).toHaveCount(0);
  if (isMobile) return;
  await optionen.click();
  await page.getByRole('button', { name: '2 Monate', exact: true }).click();
  await expect(page.locator('.plan-grid.is-wide')).toBeVisible();
  await optionen.click();
  await expect(page.getByRole('button', { name: '2 Monate', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '1 Monat', exact: true }).click();
  await expect(page.locator('.plan-grid.is-wide')).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`both menus open without overflow and pass Axe in ${scheme}`, async ({
    page,
    isMobile,
  }, info) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/plan/monat?monat=2026-09');
    await page.evaluate(() => document.fonts.ready);
    for (const name of ['Verteilen', 'Optionen']) {
      await menuSummary(page, name).click();
      const panel = page.locator('.plan-menu-panel:visible');
      await expect(panel).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${name}: no horizontal page scroll`,
      ).toBe(true);
      const box = (await panel.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      if (isMobile) {
        for (const selector of ['.plan-menu summary', '.plan-menu-panel .plan-menu-item']) {
          const heights = await page
            .locator(`${selector}:visible`)
            .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
          for (const h of heights) expect(h, selector).toBeGreaterThanOrEqual(44);
        }
      }
      const axe = await new AxeBuilder({ page }).include('main').analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
      if (info.project.name === 'desktop') {
        await page.screenshot({ path: `${EVIDENCE}/${name.toLowerCase()}-${scheme}.png` });
      }
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
    }
  });
}
