import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { SETTINGS_GROUPS } from '../apps/web/src/nav/areas';

const ITEMS = SETTINGS_GROUPS.flatMap((group) => group.items);

const settingsNav = (page: Page) => page.getByRole('navigation', { name: 'Einstellungen' });

async function seriousViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ rule: v.id, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
}

const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe('Einstellungen navigation, desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('a grouped rail shows every page, fully visible, next to the content', async ({ page }) => {
    await page.goto('/einstellungen/regelwerk');
    const nav = settingsNav(page);
    await expect(nav).toBeVisible();
    for (const group of SETTINGS_GROUPS)
      await expect(nav.getByRole('list', { name: group.label })).toBeVisible();
    // The old tab row clipped its last entries ("Profi…"): every link must lie inside the viewport.
    const viewport = page.viewportSize()!;
    for (const item of ITEMS) {
      const link = nav.getByRole('link', { name: item.label, exact: true });
      await expect(link).toBeVisible();
      const box = (await link.boundingBox())!;
      expect(box.x, item.label).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, item.label).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height, item.label).toBeLessThanOrEqual(viewport.height);
    }
    // No tab row any more, no sideways scrolling.
    await expect(page.locator('.registers')).toHaveCount(0);
    expect(await fitsWidth(page)).toBe(true);
    const railBox = (await nav.boundingBox())!;
    const bodyBox = (await page.locator('.settings-body').boundingBox())!;
    expect(railBox.x + railBox.width).toBeLessThanOrEqual(bodyBox.x);
  });

  test('every page is reachable from the rail and marked as current', async ({ page }) => {
    await page.goto('/einstellungen/konten');
    for (const item of ITEMS) {
      await settingsNav(page).getByRole('link', { name: item.label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${item.to}$`));
      await expect(settingsNav(page).locator('[aria-current="page"]')).toHaveText(item.label);
      await expect(settingsNav(page).locator('[aria-current="page"]')).toHaveCount(1);
    }
  });

  test('keyboard: links are focusable in order with a visible focus ring, Enter opens a page', async ({
    page,
  }) => {
    await page.goto('/einstellungen/konten');
    const nav = settingsNav(page);
    await nav.getByRole('link', { name: ITEMS[0]!.label, exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('link', { name: ITEMS[1]!.label, exact: true })).toBeFocused();
    const outline = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement!);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThan(0);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${ITEMS[1]!.to}$`));
  });

  test('works in light and dark theme without accessibility violations', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/einstellungen/datenquellen');
      await expect(settingsNav(page)).toBeVisible();
      expect(await seriousViolations(page), scheme).toEqual([]);
    }
  });
});

test.describe('Einstellungen navigation, phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone only');

  test('the index lists all pages in groups as full-width rows', async ({ page }) => {
    await page.goto('/einstellungen');
    await expect(page).toHaveURL(/\/einstellungen$/);
    const nav = settingsNav(page);
    for (const group of SETTINGS_GROUPS)
      await expect(nav.getByRole('list', { name: group.label })).toBeVisible();
    const viewport = page.viewportSize()!;
    for (const item of ITEMS) {
      const link = nav.getByRole('link', { name: item.label, exact: true });
      await expect(link).toBeVisible();
      const box = (await link.boundingBox())!;
      expect(box.height, item.label).toBeGreaterThanOrEqual(43.5);
      expect(box.x + box.width, item.label).toBeLessThanOrEqual(viewport.width);
    }
    await expect(nav.locator('[aria-current]')).toHaveCount(0);
    expect(await fitsWidth(page)).toBe(true);
  });

  test('a page has a back link to the index and names itself; the rail stays hidden', async ({
    page,
  }) => {
    await page.goto('/einstellungen');
    await settingsNav(page).getByRole('link', { name: 'Sicherheit', exact: true }).click();
    await expect(page).toHaveURL(/\/einstellungen\/sicherheit$/);
    await expect(page.getByRole('navigation', { name: 'Einstellungen' })).toBeHidden();
    await expect(page.locator('.settings-here')).toHaveText('Sicherheit');
    const back = page.locator('.settings-back').getByRole('link', { name: 'Einstellungen' });
    const box = (await back.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(43.5);
    await back.click();
    await expect(page).toHaveURL(/\/einstellungen$/);
    await expect(settingsNav(page)).toBeVisible();
  });

  test('works in light and dark theme without accessibility violations', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const path of ['/einstellungen', '/einstellungen/datenquellen']) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await seriousViolations(page), `${scheme} ${path}`).toEqual([]);
      }
    }
  });
});
