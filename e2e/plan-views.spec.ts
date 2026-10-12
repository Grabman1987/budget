import AxeBuilder from '@axe-core/playwright';
import { expect, sampleTest as test } from './sample';

/**
 * Plan › Monat on the seeded sample (17.09.2026): the month status tells the real state, 50/30/20
 * shows no meaningless shares, the triage view reads as a list and the time view counts the
 * expected payments. Read-only.
 */

test('plan views: status, 50/30/20, triage groups and the time view', async ({ page }) => {
  await page.goto('/plan/monat?monat=2026-09');
  await expect(page.getByTestId('to-be-assigned')).toBeVisible();

  // Uncovered overspending from the previous month and cash overspending are named, worst first;
  // "Nichts ist überzogen." never appears next to them.
  await page.locator('.plan-details > summary').click();
  const status = page.getByRole('list', { name: 'Zustand des Monats' });
  await expect(status).toContainText('Ungedeckt aus dem Vormonat');
  await expect(status).toContainText('Envelopes überzogen');
  await expect(status).not.toContainText('Nichts ist überzogen');

  // Assigned money far above the income: the bar runs past 100 % with an overflow label
  // (owner 04.10.2026: overspending must be visible, shares are of income, not renormalised).
  const split = page.locator('.split-band');
  await expect(split).toContainText('über Einnahmen');
  await expect(split.locator('.sb-legend')).toContainText(/Bedarf \d+ %/);

  // Triage: title and hint left-aligned on their own lines, the affected envelopes inside.
  await page.getByLabel('Ansicht', { exact: true }).selectOption('triage');
  const over = page.locator('tr.pgroup', { hasText: 'Überzogen' });
  await expect(over.locator('.grp-title')).toHaveText('Überzogen');
  await expect(over.locator('.grp-toggle')).toHaveCSS('text-align', /^(left|start)$/);
  await expect(page.locator('tr.prow', { hasText: 'Zeitung digital' }).first()).toBeVisible();
  const axeTriage = await new AxeBuilder({ page }).include('main').analyze();
  expect(axeTriage.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);

  // Time: envelopes with expected payments are listed under their next date.
  await page.getByLabel('Ansicht', { exact: true }).selectOption('time');
  const next14 = page.locator('tr.pgroup', { hasText: 'Nächste 14 Tage' });
  await expect(next14).toBeVisible();
  await expect(page.locator('tr.prow .pname[title*="erwartet"]').first()).toHaveAttribute(
    'title',
    /erwartet/,
  );
});
