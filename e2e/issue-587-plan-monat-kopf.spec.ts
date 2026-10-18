import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';
import { expect, sampleTest as test } from './sample';

/**
 * Plan › Monat head (#587): month switch in the title block, "Zu verteilen" states with a visible
 * reason when "Geld verteilen" is off, Einnahmen link, the promoted "Monat abschließen" button, and
 * no position numbers in the rows. Read-only on the shared sample ledger (responses are faked).
 */

const EVIDENCE = 'docs/evidence/issue-587-plan-monat-kopf';

/** Fakes only the "Zu verteilen" figure of the month; nothing is written. */
async function withToBeAssigned(page: Page, cents: number) {
  await page.route('**/api/budget/2026-09', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as BudgetMonthView;
    body.summary.toBeAssignedCents = cents;
    await route.fulfill({ response, json: body });
  });
}

test('the month switch in the title block moves across the year boundary', async ({ page }) => {
  await page.goto('/plan/monat?monat=2026-01');
  const title = page.locator('.titleblock').getByRole('heading', { level: 1 });
  await expect(title).toContainText('2026');
  await page.getByRole('button', { name: 'Vormonat' }).click();
  await expect(page).toHaveURL(/monat=2025-12/);
  await expect(title).toContainText('2025');
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await expect(page).toHaveURL(/monat=2026-01/);
  await expect(title).toContainText('2026');
});

test('"Zu verteilen" is green when positive, red only when negative, neutral at zero', async ({
  page,
}) => {
  const hero = page.locator('.plan-tba');
  const send = page.getByRole('button', { name: 'Geld verteilen' });
  const hint = page.getByTestId('distribute-hint');

  await withToBeAssigned(page, 12_345);
  await page.goto('/plan/monat?monat=2026-09');
  await expect(page.getByTestId('to-be-assigned')).toHaveText('123,45 €');
  await expect(hero).toHaveClass(/is-positive/);
  await expect(hero).not.toHaveClass(/is-negative/);
  await expect(send).toBeEnabled();
  await expect(hint).toHaveCount(0);

  await page.unroute('**/api/budget/2026-09');
  await withToBeAssigned(page, -5_000);
  await page.reload();
  await expect(page.getByTestId('to-be-assigned')).toHaveText('−50,00 €');
  await expect(hero).toHaveClass(/is-negative/);
  await expect(send).toBeDisabled();
  await expect(hint).toHaveText('Zu viel zugewiesen');
  await expect(send).toHaveAccessibleDescription('Zu viel zugewiesen');

  await page.unroute('**/api/budget/2026-09');
  await withToBeAssigned(page, 0);
  await page.reload();
  await expect(page.getByTestId('to-be-assigned')).toHaveText('0,00 €');
  await expect(hero).not.toHaveClass(/is-positive|is-negative/);
  await expect(send).toBeDisabled();
  await expect(hint).toHaveText('Nichts zu verteilen');
  await expect(hint).toBeVisible();
});

test('Einnahmen link and "Monat abschließen" are visible without a menu', async ({ page }) => {
  await page.goto('/plan/monat?monat=2026-09');
  const income = page.locator('.titleblock').getByRole('button', { name: /Einnahmen im Detail/ });
  await expect(income).toBeVisible();
  const close = page.getByRole('link', { name: 'Monat abschließen', exact: true });
  await expect(close).toBeVisible();
  await close.click();
  await expect(page).toHaveURL(/\/monatsabschluss\/2026-09/);
  await expect(
    page.getByRole('heading', { name: 'Monatsabschluss · September 2026', exact: true }),
  ).toBeVisible();

  await page.goto('/plan/monat?monat=2026-09');
  await income.click();
  await expect(page).toHaveURL(/\/plan\/monat\/einnahmen/);
});

test('rows carry no position numbers and the first category row is in the first viewport', async ({
  page,
  isMobile,
}) => {
  await page.goto('/plan/monat?monat=2026-09');
  const rows = page.locator('.ptable-zero tr.prow');
  await expect(rows.first()).toBeVisible();
  await expect(page.locator('.ptable-zero .col-pos, .ptable-zero .grp-no')).toHaveCount(0);
  if (isMobile) return;
  const viewportHeight = page.viewportSize()!.height;
  const bottom = async () => (await rows.first().boundingBox())!.y + 1;
  expect(await bottom()).toBeLessThan(viewportHeight);
  // With the inspector open (a category selected) the first row is still there.
  await rows.first().locator('.pname').click();
  await expect(page.getByRole('complementary', { name: 'Plan-Inspektor' })).toBeVisible();
  expect(await bottom()).toBeLessThan(viewportHeight);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`head is accessible and fits the viewport in ${scheme}`, async ({
    page,
    isMobile,
  }, info) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await withToBeAssigned(page, 0);
    await page.goto('/plan/monat?monat=2026-09');
    await expect(page.getByRole('link', { name: 'Monat abschließen', exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    if (isMobile) {
      for (const selector of ['.plan-close', '.plan-topbar summary', '.plan-chip-scroll > .btn']) {
        const heights = await page
          .locator(selector)
          .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
        for (const h of heights) expect(h, selector).toBeGreaterThanOrEqual(44);
      }
    }
    if (info.project.name === 'desktop') {
      await page.screenshot({ path: `${EVIDENCE}/plan-head-${scheme}.png` });
    }
  });
}

test('no overspending chip in the head; the cover actions open from the Zu verteilen disclosure', async ({
  page,
}) => {
  await page.goto('/plan/monat?monat=2026-09');
  const overspent = page.locator('tr.prow.is-over');
  await expect(overspent.first()).toBeVisible();
  const count = await overspent.count();
  expect(count).toBeGreaterThan(0);
  // Owner decision 18.10.2026: one alarm place, the rows; the head carries no red count.
  await expect(page.locator('.plan-chip-scroll')).not.toContainText('überzogen');
  await expect(page.locator('.plan-chip-scroll .is-over')).toHaveCount(0);
  await expect(page.locator('#cover-all-source')).toBeHidden();
  await page.locator('.plan-tba').click();
  await expect(page.getByRole('group', { name: 'Maßkette Zu verteilen' })).toBeVisible();
  await expect(page.locator('.triage')).toContainText(`${count} Envelopes überzogen`);
  await expect(page.getByLabel('Quelle für alle Überziehungen')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Alle aus .* decken$/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#cover-all-source')).toBeHidden();
});

test('"Zu verteilen" is the largest figure of the Plan head, in the DS2 display size', async ({
  page,
}) => {
  await page.goto('/plan/monat?monat=2026-09');
  await expect(page.getByTestId('to-be-assigned')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const sizes = await page.evaluate(() => {
    const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
    const hero = document.querySelector('[data-testid="to-be-assigned"]')!;
    // Every other amount in the head: title-block values and the chips of the top bar.
    const others = Array.from(
      document.querySelectorAll(
        '.titleblock *, .plan-topbar *:not([data-testid="to-be-assigned"])',
      ),
    )
      .filter((el) => el.children.length === 0 && /\d/.test(el.textContent ?? ''))
      .filter((el) => !el.closest('.plan-popover-content'))
      // The month name in the title (h1) is the page title, not a figure.
      .filter((el) => !el.closest('h1'))
      .map(px);
    return {
      compared: others.length,
      hero: px(hero),
      display: parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--fs-display'),
      ),
      largestOther: Math.max(...others),
    };
  });
  // The comparison must not be empty (Math.max() of nothing is −Infinity).
  expect(sizes.compared).toBeGreaterThan(0);
  expect(sizes.hero).toBe(sizes.display);
  expect(sizes.hero).toBeGreaterThan(sizes.largestOther);
});
