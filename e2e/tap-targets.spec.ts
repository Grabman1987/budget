import type { Locator } from '@playwright/test';
import { sampleTest as test, expect } from './sample';

async function expectTouchTargets(controls: Locator) {
  expect(await controls.count()).toBeGreaterThan(0);
  for (const control of await controls.all()) {
    await control.scrollIntoViewIfNeeded();
    const box = (await control.boundingBox())!;
    const name = await control.evaluate((el) => el.getAttribute('aria-label') || el.textContent);
    expect(box.width, `${name}: width`).toBeGreaterThanOrEqual(44);
    expect(box.height, `${name}: height`).toBeGreaterThanOrEqual(44);
  }
}

test.describe('UX-3b touch controls', () => {
  test.use({ hasTouch: true });

  test('shared controls stay at least 44 × 44 on coarse pointers, including wide screens', async ({
    page,
  }) => {
    await page.goto('/dev/bauteile');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await expectTouchTargets(page.locator('#grundbausteine button:visible'));
    await page.getByRole('button', { name: 'Seitenpanel öffnen' }).click();
    const dialog = page.getByRole('dialog', { name: 'Kontostand prüfen' });
    const close = dialog.getByRole('button', { name: 'Schließen', exact: true });
    await expectTouchTargets(close);
    await expect(close.locator('.control-label')).toBeVisible();
    await close.click();
    await expect(dialog).not.toBeVisible();
  });

  test('phone navigation, booking status, dialog controls and FAB have usable touch areas', async ({
    page,
    isMobile,
  }, info) => {
    test.skip(!isMobile, '390 px phone project');
    test.setTimeout(60_000);
    await page.goto('/konten/buchungen');
    await expect(page.locator('.ktable tbody tr[data-booking]').first()).toBeVisible();
    await expectTouchTargets(page.locator('.tabbar a, .registers a, .fab'));
    for (const tab of await page.locator('.tabbar a, .registers a').all()) {
      expect(
        await tab.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      ).toBeGreaterThanOrEqual(13);
    }
    await expectTouchTargets(page.locator('button.kstatus-btn').first());
    await expectTouchTargets(page.locator('.kflagpick.in-list .kflagbtn').first());
    await expectTouchTargets(
      page.locator('.ktable input[type="checkbox"]').filter({ visible: true }).first(),
    );
    const selectable = page.locator('tr[data-booking]:has(button.kflagbtn)').first();
    const checkbox = selectable.getByRole('checkbox');
    await checkbox.scrollIntoViewIfNeeded();
    const covered = await checkbox.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return [box.left + 1, box.right - 1].some((x) => {
        const target = document.elementFromPoint(x, box.top + box.height / 2);
        return target !== el && !el.contains(target);
      });
    });
    expect(covered, 'row selection must not overlap the flag target').toBe(false);
    await checkbox.tap();
    await expect(checkbox).toBeChecked();
    await checkbox.tap();

    await page.getByRole('link', { name: 'Buchung erfassen', exact: true }).tap();
    const dialog = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
    await expect(dialog).toBeVisible();
    await expectTouchTargets(dialog.locator('button:visible, input:visible, select:visible'));
    for (const segment of await dialog.locator('.seg button').all()) {
      expect(
        await segment.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      ).toBeGreaterThanOrEqual(13);
    }
    const flag = dialog.getByRole('button', { name: 'Markierung: keine', exact: true });
    expect(await flag.evaluate((el) => getComputedStyle(el, '::after').content)).toContain(
      'Markierung',
    );
    await flag.tap();
    await expectTouchTargets(dialog.getByRole('menuitemradio'));
    await page.keyboard.press('Escape');
    await expect(flag).toBeFocused();
    const close = dialog.getByRole('button', { name: 'Schließen', exact: true });
    expect(await close.evaluate((el) => getComputedStyle(el, '::after').content)).toContain(
      'Schließen',
    );
    await page.screenshot({ path: info.outputPath('phone-390-dialog.png') });
    await close.tap();
    await expect(dialog).not.toBeVisible();
    await page.screenshot({ path: info.outputPath('phone-390-ledger.png') });
  });
});

test.describe('fine pointer controls', () => {
  test.use({ hasTouch: false });

  test('phone width applies the touch floor even with a fine pointer', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, '390 px viewport');
    await page.goto('/dev/bauteile');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(false);
    await expectTouchTargets(page.locator('#grundbausteine button:visible'));
  });

  test('desktop keeps compact segmented controls', async ({ page, isMobile }, info) => {
    test.skip(isMobile, '1440 px desktop project');
    await page.goto('/dev/bauteile');
    const segment = page
      .getByRole('group', { name: 'Zeitraum', exact: true })
      .getByRole('button', { name: '1J', exact: true });
    expect((await segment.boundingBox())!.height).toBe(28);
    await page.screenshot({ path: info.outputPath('desktop-1440.png') });
  });
});
