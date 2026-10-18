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

test('no Überzogen chip in the head: rows keep their marking, cover actions sit in the Zu verteilen disclosure', async ({
  page,
}) => {
  await page.goto('/plan/monat?monat=2026-09');
  const head = page.locator('.plan-topbar');
  await expect(page.getByTestId('to-be-assigned')).toBeVisible();
  // Single alarm place: no red count anywhere in the head, whatever the markup.
  // (The count only appears inside the opened disclosure, not in the hero or the chip row.)
  await expect(head.locator('.plan-hero, .plan-chip-scroll').getByText(/überzogen/)).toHaveCount(0);
  await expect(head.locator('.plan-chip.is-over')).toHaveCount(0);
  // Overspent categories stay visible and marked in the list.
  const overspent = await page.locator('tr.prow.is-over').count();
  expect(overspent).toBeGreaterThan(0);
  // The cover actions are one click away in the disclosure (read-only: nothing is booked here).
  await page.getByTestId('to-be-assigned').click();
  const triage = page.locator('.triage');
  await expect(triage).toContainText(`${overspent} Envelopes überzogen`);
  await expect(page.getByLabel('Quelle für alle Überziehungen')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Maßkette Zu verteilen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(triage).toBeHidden();
});

test('"Zu verteilen" is the largest figure of the head and uses the display token', async ({
  page,
  isMobile,
}) => {
  await page.goto('/plan/monat?monat=2026-09');
  const hero = page.getByTestId('to-be-assigned');
  await expect(hero).toBeVisible();
  // T2 display: 28 px on the desktop, 24 px on the phone.
  await expect(hero).toHaveCSS('font-size', isMobile ? '24px' : '28px');
  const largestOther = await page.evaluate(() => {
    const sizes: number[] = [];
    for (const el of document.querySelectorAll('.plan-topbar *, .titleblock *')) {
      if (el.matches('[data-testid="to-be-assigned"]') || el.children.length > 0) continue;
      if (!/\d.*€/.test(el.textContent ?? '')) continue;
      sizes.push(parseFloat(getComputedStyle(el).fontSize));
    }
    return Math.max(0, ...sizes);
  });
  const heroSize = await hero.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(largestOther).toBeGreaterThan(0);
  expect(heroSize).toBeGreaterThan(largestOther);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`head is accessible and fits the viewport in ${scheme}`, async ({ page, isMobile }) => {
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
    await page.screenshot({
      path: `${EVIDENCE}/plan-head-${scheme}${isMobile ? '-phone' : ''}.png`,
    });
  });
}
