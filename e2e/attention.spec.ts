import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';

test('attention links and the unclassified row are usable at both viewport sizes', async ({
  page,
}, info) => {
  await page.goto('/?monat=2026-09');
  const bar = page.getByRole('region', { name: 'Zu tun' });
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.topbar .overspent-chip')).toHaveCount(0);
  await expect(bar.getByRole('link', { name: 'Plan prüfen', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('attention-strip.png') });
  await page.goto('/plan/monat?monat=2026-09&ansicht=triage');
  await expect(page).toHaveURL(/ansicht=triage/);
  // #588: the Ansicht select is gone and "Nur Überzogene" is no menu entry; the URL opens the
  // triage view, shown as its own "Überzogen" group while no Optionen view is marked.
  await expect(
    page.locator('tr.pgroup', { hasText: 'Überzogen' }).locator('.grp-title'),
  ).toHaveText('Überzogen');
  await page.locator('.plan-menu summary', { hasText: 'Optionen' }).click();
  await expect(
    page.getByRole('group', { name: 'Ansicht', exact: true }).locator('[aria-pressed="true"]'),
  ).toHaveCount(0);
  await page.locator('.plan-menu summary', { hasText: 'Optionen' }).click();
  await expect(
    page.locator('.plan-topbar summary').filter({ hasText: 'ohne Kategorie' }),
  ).toBeVisible();
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

test('attention hides the entire block when Heute has no open items', async ({ page }) => {
  await page.route('**/api/heute?**', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.nextSteps = { items: [], count: 0 };
    body.attention = { inboxCount: 0, pendingCount: 0, pendingBefore: '2026-09-10' };
    body.financeCheck.actionRules = [];
    body.accountReminders = [];
    await route.fulfill({ response, json: body });
  });
  await page.goto('/?monat=2026-09');
  const attention = page.getByRole('region', { name: 'Zu tun' });
  await expect(page.getByTestId('heute-lead-value')).toBeVisible();
  await expect(attention).toHaveCount(0);
});
