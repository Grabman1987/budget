import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { sampleTest as test, expect } from './sample';
import { MIN_TARGET_PX } from './ledger-helpers';
import { expectHeuteVisualReady, freezeHeuteVisual } from './heute-visual-fixture';

async function evidence(page: Page, info: TestInfo, name: string, target?: Locator) {
  const path = info.outputPath(`${name}.png`);
  if (target) await target.screenshot({ path });
  else await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: 'image/png' });
}

for (const theme of ['light', 'dark']) {
  test(`shared controls keep quiet boundaries, keyboard focus and touch geometry (${theme})`, async ({
    page,
  }, info) => {
    await page.goto('/dev/bauteile');
    await expect(page.locator('[data-budget-redesign="1"]')).toBeVisible();
    const basics = page.locator('section#grundbausteine');
    const button = basics.getByRole('button', { name: 'Buchung', exact: true });
    const secondary = basics.getByRole('button', { name: 'Posteingang', exact: true });
    const field = basics.getByRole('textbox', { name: 'Empfänger', exact: true });
    const segments = basics.getByRole('group', { name: 'Zeitraum', exact: true });
    const compact = await page.evaluate(
      () => matchMedia('(pointer: fine) and (min-width: 1024px)').matches,
    );
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    await expect(button).toHaveCSS('height', compact ? '36px' : '44px');
    await expect(field).toHaveCSS('height', compact ? '38px' : '44px');
    await expect(secondary).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
    await expect(field).toHaveCSS('border-width', '1px');
    await expect(field).toHaveCSS('border-radius', '8px');
    await expect(basics.getByRole('textbox', { name: 'Kategorie', exact: true })).toHaveCSS(
      'border-color',
      theme === 'light' ? 'rgb(196, 42, 31)' : 'rgb(255, 139, 123)',
    );
    await expect(field).toHaveCSS(
      'border-color',
      theme === 'light' ? 'rgb(103, 134, 172)' : 'rgb(73, 135, 188)',
    );
    await expect(segments).toHaveCSS('height', compact ? '38px' : '48px');
    await segments.getByRole('button', { name: '1J', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(segments.getByRole('button', { name: '1J', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    for (const control of [
      button,
      secondary,
      field,
      segments.getByRole('button', { name: '1J', exact: true }),
    ]) {
      await control.focus();
      await expect(control).toHaveCSS('outline-style', 'solid');
      await expect(control).toHaveCSS('outline-width', '2px');
      await expect(control).toHaveCSS('outline-offset', '2px');
    }
    expect(
      (await new AxeBuilder({ page }).include('section#grundbausteine').analyze()).violations,
    ).toEqual([]);
    await evidence(page, info, `controls-${theme}`, basics);
    // The compact rule needs both a wide viewport and a fine pointer.
    await page.setViewportSize({ width: compact ? 1023 : 1440, height: 900 });
    await expect(button).toHaveCSS('height', '44px');
    await expect(field).toHaveCSS('height', '44px');
  });
}

for (const path of ['/vermoegen', '/vermoegen/portfolio']) {
  test(`period segments preserve URL state on ${path}`, async ({ page }) => {
    await page.goto(`${path}?zeitraum=3M`);
    const period = page.getByRole('group', { name: 'Zeitraum', exact: true });
    await expect(period.getByRole('button', { name: '3M', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await period.getByRole('button', { name: '1J', exact: true }).click();
    await expect(page).toHaveURL(/zeitraum=1J/);
    await page.reload();
    await expect(period.getByRole('button', { name: '1J', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const compact = await page.evaluate(
      () => matchMedia('(pointer: fine) and (min-width: 1024px)').matches,
    );
    await expect(period).toHaveCSS('height', compact ? '38px' : '48px');
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('a page primary action makes the global capture action secondary', async ({ page }) => {
  await page.goto('/einstellungen/konten');
  const create = page.getByRole('button', { name: 'Konto anlegen', exact: true });
  await expect(create).toBeVisible();
  await expect(page.locator('.topbar .btn-primary')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
  await expect(create).toHaveCSS('background-color', 'rgb(23, 71, 166)');
});

test('Today retains its desktop side column and the phone dock clears safe areas', async ({
  page,
}, info) => {
  await freezeHeuteVisual(page);
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
  await expectHeuteVisualReady(page);
  const phone = (page.viewportSize()?.width ?? 1440) < 768;
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(
      page.locator('.topbar').getByRole('button', { name: /Panel|Inspektor/ }),
    ).toHaveCount(0);
    if (phone) {
      const dock = page.locator('.tabbar');
      await expect(dock).toHaveCSS('padding-bottom', '8px');
      await expect(dock).toHaveCSS('height', '52px');
      for (const link of await dock.getByRole('link').all()) {
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      }
      await expect(page.locator('.hv-revisions td:nth-child(2)').first()).toHaveCSS(
        'overflow-wrap',
        'break-word',
      );
      const fab = (await page.locator('.fab').boundingBox())!;
      for (const action of await page.locator('.hv-revisions td:last-child a').all()) {
        const box = (await action.boundingBox())!;
        expect(
          box.x + box.width <= fab.x || box.y + box.height <= fab.y || box.y >= fab.y + fab.height,
        ).toBe(true);
      }
      await page.evaluate(() =>
        document.documentElement.style.setProperty('--mobile-safe-bottom', '34px'),
      );
      await expect(dock).toHaveCSS('padding-bottom', '34px');
      await expect(dock).toHaveCSS('height', '78px');
      await page.evaluate(() =>
        document.documentElement.style.removeProperty('--mobile-safe-bottom'),
      );
    } else {
      await expect(page.locator('.topbar .global-search-launch')).toHaveCSS('height', '38px');
      await expect(page.locator('.topbar .month-switch .icon-btn').first()).toHaveCSS(
        'height',
        '36px',
      );
      await expect(page.locator('.topbar .month-switch')).toHaveCSS('border-radius', '8px');
      await expect(page.locator('.topbar .btn-primary')).toHaveCount(1);
      const aside = page.locator('.hv-aside');
      await expect(aside).toBeVisible();
      expect((await aside.boundingBox())!.x).toBeGreaterThan(
        (await page.locator('.hv-main').boundingBox())!.x,
      );
      await page
        .locator('.topbar')
        .getByRole('button', { name: 'Seitenleiste einklappen', exact: true })
        .click();
      await expect(aside).toBeVisible();
      await page
        .locator('.topbar')
        .getByRole('button', { name: 'Seitenleiste ausklappen', exact: true })
        .click();
      await expect(aside).toBeVisible();
    }
    await evidence(page, info, `heute-${theme}`);
  }
  if (!phone) {
    await page.goto('/plan/monat');
    const inspector = page.getByRole('complementary', { name: 'Plan-Inspektor' });
    await expect(inspector).toBeVisible();
    await expect(inspector).toHaveCSS('position', 'sticky');
    const action = inspector.locator('.btn').first();
    await expect(action).toBeVisible();
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(34);
    expect((await action.boundingBox())!.height).toBeLessThanOrEqual(38);
    await expect(
      page.locator('.topbar').getByRole('button', { name: /Panel|Inspektor/ }),
    ).toHaveCount(0);
    await page.reload();
    await expect(inspector).toBeVisible();
    await evidence(page, info, 'plan-inspector');
  }
});

test('account period segments inherit the shared density after the page stylesheet loads', async ({
  page,
}) => {
  await page.goto('/konten/acc-giro');
  await page.getByLabel('Kontoverlauf einstellen', { exact: true }).click();
  const segments = page.locator('.kchart-head .seg').first();
  await expect(segments).toBeVisible();
  const compact = await page.evaluate(
    () => matchMedia('(pointer: fine) and (min-width: 1024px)').matches,
  );
  await expect(segments).toHaveCSS('height', compact ? '38px' : '48px');
});
