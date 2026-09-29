import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ROUTES } from './routes';

/** Serious and critical WCAG 2.x A/AA violations fail the test (audit D8). */
async function violations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      rule: v.id,
      impact: v.impact,
      targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    }));
}

test.describe('axe: no serious or critical violations', () => {
  test('every route of the sitemap', async ({ page }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    const failures: Record<string, unknown> = {};
    for (const path of ROUTES) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const found = await violations(page);
      if (found.length > 0) failures[path] = found;
    }
    expect(failures).toEqual({});
  });

  test('dark theme, open panel and login page', async ({ page, browser }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    for (const path of ['/', '/plan/monat', '/reports', '/einstellungen/sicherheit']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      expect(await violations(page), `dark ${path}`).toEqual([]);
    }
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    await page.goto('/plan/monat?panel=posteingang');
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await violations(page), 'panel open').toEqual([]);

    // The login page, without a session.
    const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const login = await anonymous.newPage();
    await login.goto('/login', { waitUntil: 'load' });
    await expect(login.getByRole('button', { name: 'Mit Passkey anmelden' })).toBeVisible();
    expect(await violations(login), 'login').toEqual([]);
    await anonymous.close();
  });
});
