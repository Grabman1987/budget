import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { MIN_TARGET_PX } from './ledger-helpers';

test('E1 keeps profile fields, dirty decisions, stale drafts and source returns', async ({
  page,
  request,
  baseURL,
}) => {
  const source = '/reports/inflation?zeitraum=1J&monat=2026-09#synthetic-source';
  const entry = `/einstellungen/profil?von=${encodeURIComponent(source)}`;
  await page.goto(entry);
  const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  const name = page.getByLabel('Name', { exact: true });
  const form = page.locator('section[aria-labelledby="profile-title"]');
  await expect(name).toHaveValue('');
  await name.fill('Synthetic profile');
  await form.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByText('Profil gespeichert.', { exact: true })).toBeVisible();
  await expect(name).toHaveValue('Synthetic profile');
  expect(await (await request.get('/api/profile')).json()).toMatchObject({
    name: 'Synthetic profile',
    initials: 'SP',
    birthDate: '',
    household: null,
    region: null,
  });
  if (!on) {
    await expect(form.getByRole('button', { name: 'Verwerfen' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Zurück zur Ausgangsseite' })).toHaveCount(0);
    return;
  }
  await name.fill('Synthetic unsaved');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Zurück zur Ausgangsseite' }).click();
  await expect(page).toHaveURL(entry);
  await expect(name).toHaveValue('Synthetic unsaved');
  await form.getByRole('button', { name: 'Verwerfen' }).click();
  await expect(name).toHaveValue('Synthetic profile');

  await name.fill('Synthetic stale draft');
  const changed = await request.patch('/api/profile', {
    headers: { origin: baseURL! },
    data: { name: 'Synthetic other device', initials: 'SO' },
  });
  expect(changed.ok()).toBe(true);
  await form.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Aktuellen Stand laden' })).toBeVisible();
  await expect(name).toHaveValue('Synthetic stale draft');
  expect(await (await request.get('/api/profile')).json()).toMatchObject({
    name: 'Synthetic other device',
  });
  await form.getByRole('button', { name: 'Aktuellen Stand laden' }).click();
  await expect(name).toHaveValue('Synthetic other device');

  await page.setViewportSize({ width: 320, height: 844 });
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => {
      localStorage.setItem('budget-theme', value);
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const control of await form.locator('input, select, button').all()) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    }
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      axe.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      ),
    ).toEqual([]);
  }
  await page.reload();
  await expect(name).toHaveValue('Synthetic other device');
  await page.getByRole('link', { name: 'Zurück zur Ausgangsseite' }).click();
  await expect(page).toHaveURL(source);
});
