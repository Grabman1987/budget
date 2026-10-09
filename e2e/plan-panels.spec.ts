import AxeBuilder from '@axe-core/playwright';
import { expect, sampleTest as test } from './sample';

test('category detail preserves list context, supports direct links and returns dialog focus', async ({
  page,
}, info) => {
  await page.goto('/einstellungen/kategorien');
  await page.getByRole('switch', { name: /Ausgeblendete zeigen/ }).click();
  const trigger = page.locator('.cat-table .kname-btn').last();
  const name = (await trigger.innerText()).trim();
  await trigger.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => window.scrollY);
  await trigger.click();
  await expect(page).toHaveURL(/\/einstellungen\/kategorien\/[^?]+/);
  const url = page.url();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Brotkrumen' })).toContainText('Kategorien');
  const edit = page.getByRole('button', { name: 'Kategorie bearbeiten', exact: true });
  await edit.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('dialog.panel[open]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(edit).toBeFocused();
  await page.getByRole('link', { name: 'Zurück zu Kategorien' }).click();
  await expect(page.getByRole('switch', { name: /Ausgeblendete zeigen/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0);
  await page.locator('.cat-table .kname-btn').filter({ hasText: name }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/einstellungen\/kategorien\?/);
  await page.goto(url);
  await expect(edit).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('category-detail.png'), fullPage: true });
  await page.getByRole('link', { name: 'Zurück zu Kategorien' }).click();
  await expect(page).toHaveURL(/\/einstellungen\/kategorien\?/);
  await page.goto('/einstellungen/kategorien/unknown-synthetic-category');
  await expect(page.getByText('Diese Kategorie ist nicht vorhanden.')).toBeVisible();
});

test('Plan and report open one goal history page and retain month and return route', async ({
  page,
}, info) => {
  await page.goto('/plan/sparziele?monat=2026-08');
  await page.getByRole('link', { name: 'Urlaub Sommer 2027', exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/sparziele\/[^?]+\?monat=2026-08/);
  const url = page.url();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('goal-soll-chart')).toBeVisible();
  const edit = page.getByRole('button', { name: 'Sparziel bearbeiten', exact: true });
  await edit.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('dialog.panel[open]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(edit).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(/\/plan\/sparziele\?monat=2026-08$/);
  await page.goto(url);
  await expect(edit).toBeVisible();
  await page.getByRole('link', { name: 'Zurück zu Sparzielen' }).click();
  await expect(page).toHaveURL(/\/plan\/sparziele\?monat=2026-08$/);
  await page.goto('/reports/sparziele');
  await page
    .locator('.goals-report-list')
    .getByRole('link', { name: 'Urlaub Sommer 2027', exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan\/sparziele\/[^?]+\?.*quelle=report/);
  await expect(page.getByTestId('goal-soll-chart')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('goal-detail.png'), fullPage: true });
  await page.getByRole('link', { name: 'Zurück zum Sparzielreport' }).click();
  await expect(page).toHaveURL(/\/reports\/sparziele$/);
  await page.goto('/plan/sparziele/unknown-synthetic-goal?monat=2026-08');
  await expect(page.getByText('Dieses Sparziel ist nicht vorhanden.')).toBeVisible();
});

test('year event input keeps year, cancel guard, focus and inline comparison', async ({
  page,
}, info) => {
  await page.goto('/plan/jahr?monat=2026-11');
  const trigger = page.getByRole('button', { name: 'Ereignis planen', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Ereignis einplanen' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('dialog.panel[open]')).toHaveCount(0);
  await dialog.getByLabel('Ereignis', { exact: true }).fill('Synthetisches Ereignis');
  await page.keyboard.press('Escape');
  await expect(dialog.getByText('Ungespeicherte Angaben verwerfen?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await expect(dialog.getByLabel('Ereignis', { exact: true })).toHaveValue(
    'Synthetisches Ereignis',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('event-form.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/plan\/jahr\?monat=2026-11$/);
  await page.goto('/plan/jahr?monat=2026-11&ereignis=neu');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/jahr\?monat=2026-11$/);
});
