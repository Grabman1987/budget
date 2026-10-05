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
  const status = page.getByRole('list', { name: 'Zustand des Monats' });
  await expect(status).toContainText('Ungedeckt aus dem Vormonat');
  await expect(status).toContainText('bar überzogen');
  await expect(status).not.toContainText('Nichts ist überzogen');

  // Assigned money far above the income: dashes and a sentence, no 595 % bar.
  const split = page.locator('.split-band');
  await expect(split).toContainText('über Einnahmen');
  await expect(split.locator('.sb-legend')).not.toContainText(/\d+ %/);
  await expect(split.locator('.sb-seg')).toHaveCount(0);

  // Triage: title and hint left-aligned on their own lines, the affected envelopes inside.
  await page.getByRole('button', { name: /^Triage/ }).click();
  const over = page.locator('tr.pgroup', { hasText: 'Überzogen' });
  await expect(over.locator('.grp-title')).toHaveText('Überzogen');
  await expect(over.locator('.grp-toggle')).toHaveCSS('text-align', /^(left|start)$/);
  const title = await over.locator('.grp-title').boundingBox();
  const hint = await over.locator('.grp-sub').boundingBox();
  expect(title && hint && Math.abs(title.x - hint.x) < 2).toBe(true);
  await expect(page.locator('tr.prow', { hasText: 'Zeitung digital' }).first()).toBeVisible();
  const axeTriage = await new AxeBuilder({ page }).include('main').analyze();
  expect(axeTriage.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);

  // Time: envelopes with expected payments are listed under their next date.
  await page.getByRole('button', { name: 'Zeit', exact: true }).click();
  const next14 = page.locator('tr.pgroup', { hasText: 'Nächste 14 Tage' });
  await expect(next14).toBeVisible();
  await expect(page.locator('tr.prow .pdue').first()).toContainText('erwartet');
});
