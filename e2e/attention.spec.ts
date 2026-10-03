import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';

test('attention links and the unclassified row are usable at both viewport sizes', async ({
  page,
}, info) => {
  await page.goto('/?monat=2026-09');
  const bar = page.getByRole('region', { name: 'Braucht Aufmerksamkeit' });
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await expect(bar.getByRole('link', { name: /überzogene Envelopes/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath('attention-strip.png') });
  await bar.getByRole('link', { name: /überzogene Envelopes/ }).click();
  await expect(page).toHaveURL(/ansicht=triage/);
  await expect(page.getByRole('button', { name: /Triage/, exact: false }).first()).toBeVisible();
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

test('attention strip disappears when the loaded read models have no open items', async ({
  page,
}) => {
  await page.route('**/api/budget/*', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.summary.envelopes = [];
    await route.fulfill({ response, json: body });
  });
  await page.route('**/api/goals?**', (route) => route.fulfill({ json: { goals: [] } }));
  await page.route('**/api/inbox/count', (route) => route.fulfill({ json: { count: 0 } }));
  await page.route('**/api/heute?**', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.upcoming14 = [];
    await route.fulfill({ response, json: body });
  });
  const reads = Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/budget/')),
    page.waitForResponse((response) => response.url().includes('/api/goals?')),
    page.waitForResponse((response) => response.url().includes('/api/inbox/count')),
  ]);
  await page.goto('/?monat=2026-09');
  await reads;
  await expect(page.getByTestId('heute-lead-value')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('region', { name: 'Braucht Aufmerksamkeit' })).toHaveCount(0);
});
