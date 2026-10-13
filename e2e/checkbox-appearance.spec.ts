import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { sampleTest as test, expect } from './sample';

// Checkboxes and radios are one drawn control app-wide: a transparent hit area (20 px with a
// fine pointer, the 44 px floor on touch) with a centred 20 px box. The `webkit-iphone` project
// guards the engine in which the 44 px floor used to paint a giant black square (owner report
// 13.10.2026). Set CHECKBOX_EVIDENCE=1 to save the screenshots in docs/evidence/ios-checkbox/.

const BOX = 20;
const SELECTOR = '.ktable tbody tr[data-booking] input[type="checkbox"]';

async function openBookings(page: Page) {
  await page.goto('/konten/buchungen');
  await expect(page.locator('.ktable tbody tr[data-booking]').first()).toBeVisible();
  const checkbox = page.locator(SELECTOR).filter({ visible: true }).first();
  await expect(checkbox).toBeVisible();
  await checkbox.scrollIntoViewIfNeeded();
  return checkbox;
}

async function seriousViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ rule: v.id, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
}

test.describe('checkbox appearance', () => {
  test('the drawn box is 20 px; the hit area stays 44 px on touch', async ({ page }) => {
    const checkbox = await openBookings(page);
    const style = await checkbox.evaluate((el) => {
      const own = getComputedStyle(el);
      const box = getComputedStyle(el, '::before');
      return {
        appearance: own.appearance || own.getPropertyValue('-webkit-appearance'),
        background: own.backgroundColor,
        boxWidth: parseFloat(box.width),
        boxHeight: parseFloat(box.height),
        phone: matchMedia('(max-width: 767px)').matches || matchMedia('(pointer: coarse)').matches,
      };
    });
    expect(style.appearance).toBe('none');
    expect(style.background).toBe('rgba(0, 0, 0, 0)');
    expect(style.boxWidth).toBeCloseTo(BOX, 0);
    expect(style.boxHeight).toBeCloseTo(BOX, 0);
    const hit = (await checkbox.boundingBox())!;
    if (style.phone) {
      expect(hit.width, 'hit width').toBeGreaterThanOrEqual(44);
      expect(hit.height, 'hit height').toBeGreaterThanOrEqual(44);
    } else {
      expect(hit.width).toBeCloseTo(BOX, 0);
      expect(hit.height).toBeCloseTo(BOX, 0);
    }
  });

  test('a tap on the control toggles it and the checked box is filled', async ({
    page,
    hasTouch,
  }) => {
    const checkbox = await openBookings(page);
    await expect(checkbox).not.toBeChecked();
    const unchecked = await checkbox.evaluate(
      (el) => getComputedStyle(el, '::before').backgroundColor,
    );
    if (hasTouch) await checkbox.tap();
    else await checkbox.click();
    await expect(checkbox).toBeChecked();
    const checked = await checkbox.evaluate((el) => {
      const before = getComputedStyle(el, '::before');
      return {
        background: before.backgroundColor,
        tick: getComputedStyle(el, '::after').content,
      };
    });
    expect(checked.background).not.toBe(unchecked);
    expect(checked.tick).not.toBe('none');
    if (hasTouch) await checkbox.tap();
    else await checkbox.click();
    await expect(checkbox).not.toBeChecked();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: axe is clean with checked and unchecked boxes`, async ({
      page,
      hasTouch,
    }, info) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      const checkbox = await openBookings(page);
      if (hasTouch) await checkbox.tap();
      else await checkbox.click();
      await expect(checkbox).toBeChecked();
      expect(await seriousViolations(page), `${scheme} bookings`).toEqual([]);
      if (process.env['CHECKBOX_EVIDENCE'] && info.project.name === 'webkit-iphone') {
        await page.evaluate(() => scrollBy(0, 160));
        await page.screenshot({ path: `docs/evidence/ios-checkbox/iphone-${scheme}.png` });
      }
    });
  }
});
