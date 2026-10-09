import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';

test('attention links and the unclassified row are usable at both viewport sizes', async ({
  page,
}, info) => {
  await page.goto('/?monat=2026-09');
  const bar = page.getByRole('region', { name: 'Braucht Aufmerksamkeit' });
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: /Envelopes überzogen/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath('attention-strip.png') });
  await page.goto('/plan/monat?monat=2026-09&ansicht=triage');
  await expect(page).toHaveURL(/ansicht=triage/);
  await expect(
    page.getByRole('button', { name: /Überziehungen prüfen/, exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Noch ohne Kategorie' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('plan-unclassified.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('attention explains the empty state when Heute has no open items', async ({ page }) => {
  await page.route('**/api/heute?**', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.nextSteps = { items: [], count: 0 };
    body.attention = { inboxCount: 0, pendingCount: 0, pendingBefore: '2026-09-10' };
    body.financeCheck.actionRules = [];
    await route.fulfill({ response, json: body });
  });
  await page.goto('/?monat=2026-09');
  const attention = page.getByRole('region', { name: 'Braucht Aufmerksamkeit' });
  await expect(attention).toContainText('Keine offenen Aufgaben aus den Heute-Prüfungen.');
  await expect(attention.getByRole('link')).toHaveCount(0);
});
