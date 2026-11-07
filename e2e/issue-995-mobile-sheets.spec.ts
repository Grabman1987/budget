import type { Locator, Page } from '@playwright/test';
import { sampleTest as test, expect } from './sample';
import { MIN_TARGET_PX } from './ledger-helpers';

async function swipe(page: Page, grip: Locator, dx: number, dy: number) {
  const box = (await grip.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

for (const theme of ['light', 'dark']) {
  test(`safe-area dock, native date list and sheet (${theme})`, async ({
    page,
    isMobile,
  }, info) => {
    test.setTimeout(120_000);
    if (isMobile) await page.setViewportSize({ width: 390, height: 844 });
    // A finite date-filtered sample: reaching the end must not append another history page.
    await page.goto('/konten/buchungen?von=2026-09-15&bis=2026-09-17', {
      waitUntil: 'networkidle',
    });
    await expect(page.getByRole('button', { name: 'Weitere Buchungen laden' })).toHaveCount(0);
    await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      /viewport-fit=cover/,
    );
    await page.evaluate((value) => {
      document.documentElement.style.setProperty('--mobile-safe-bottom', '34px');
      document.documentElement.style.setProperty('--mobile-safe-top', '47px');
      document.documentElement.dataset['theme'] = value;
    }, theme);
    const dock = page.locator('.tabbar');
    if (isMobile) {
      await expect(dock).toHaveCSS('height', '83px');
      await expect(dock).toHaveCSS('padding-bottom', '34px');
      await expect(dock.locator('a[aria-current="page"]')).toHaveText('Konten');
      expect((await page.locator('.m-head').boundingBox())!.y).toBe(47);
      const links = await dock.getByRole('link').evaluateAll((items) =>
        items.map((link) => {
          const box = link.getBoundingClientRect();
          return {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            fontSize: getComputedStyle(link).fontSize,
            iconWidth: link.querySelector('svg')!.getBoundingClientRect().width,
          };
        }),
      );
      expect(links).toHaveLength(5);
      for (const box of links) {
        expect(box.x).toBeGreaterThanOrEqual(12);
        expect(box.x + box.width).toBeLessThanOrEqual(378);
        expect(box.y + box.height).toBeLessThanOrEqual(810);
        expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        expect(box.fontSize).toBe('11px');
        expect(box.iconWidth).toBe(24);
      }
      const fab = (await page.locator('.fab').boundingBox())!;
      expect(fab.y + fab.height).toBeLessThanOrEqual(745);
      await expect(page.locator('.kregister-day').first()).toBeVisible();
    } else {
      await expect(dock).toBeHidden();
      await expect(page.locator('.ktx thead')).toBeVisible();
      await expect(page.locator('.kregister-day').first()).toBeHidden();
    }
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/') && ['POST', 'PATCH', 'DELETE'].includes(request.method()))
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    const rows = page.locator('.ktx [data-booking]:not(.is-upcoming)');
    await expect(rows.first()).toBeVisible();
    await rows.first().scrollIntoViewIfNeeded();
    if (isMobile) await page.evaluate(() => window.scrollBy(0, -60));
    await page.screenshot({ path: info.outputPath(`register-${theme}.png`) });
    const opener = rows.first().locator('.kname-btn');
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Buchung bearbeiten', exact: true });
    await expect(dialog).toBeVisible();
    if (isMobile) {
      const grip = dialog.getByRole('button', { name: 'Blatt schließen' });
      await expect(grip).toBeVisible();
      const box = (await dialog.boundingBox())!;
      expect(box.y).toBe(47);
      expect(box.y + box.height).toBe(844);
      await expect(dialog.locator('.bk-foot')).toHaveCSS('padding-bottom', '8px');
      await page.screenshot({ path: info.outputPath(`sheet-${theme}.png`) });
      // Keyboard-sized capture reclaims decorative chrome, but never the notch or home area.
      await page.setViewportSize({ width: 390, height: 430 });
      await expect(grip).toBeHidden();
      const compact = (await dialog.boundingBox())!;
      expect(compact.y).toBe(47);
      expect(compact.y + compact.height).toBe(430);
      const close = (await dialog
        .getByRole('button', { name: 'Schließen', exact: true })
        .boundingBox())!;
      expect(close.y).toBeGreaterThanOrEqual(47);
      const save = (await dialog
        .getByRole('button', { name: 'Speichern', exact: true })
        .boundingBox())!;
      expect(save.y + save.height).toBeLessThanOrEqual(430 - 34);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(grip).toBeVisible();
      await swipe(page, grip, 0, 90);
    } else {
      await expect(dialog.getByRole('button', { name: 'Blatt schließen' })).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`dialog-${theme}.png`) });
      await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
    }
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    expect(writes).toEqual([]);
    if (isMobile) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      // The final row clears the reserved FAB slot even when scrolling has hidden the FAB.
      await expect
        .poll(() =>
          page
            .locator('.ktx [data-booking]')
            .last()
            .evaluate((el) => el.getBoundingClientRect().bottom),
        )
        .toBeLessThanOrEqual(844 - 83 - 16 - 58 - 16);
      await page.screenshot({ path: info.outputPath(`register-end-${theme}.png`) });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
  });
}

test('sheet swipes keep unsaved edits guarded and sideways drags open', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(120_000);
  test.skip(!isMobile, 'Phone sheet interaction');
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/') && ['POST', 'PATCH', 'DELETE'].includes(request.method()))
      writes.push(request.method());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/konten/buchungen?von=2026-09-01&bis=2026-09-17&q=Hausverwaltung');
  await page.locator('.ktx [data-booking] .kname-btn').first().click();
  const dialog = page.getByRole('dialog', { name: 'Buchung bearbeiten', exact: true });
  const grip = dialog.getByRole('button', { name: 'Blatt schließen' });
  await expect(grip).toBeVisible();
  await swipe(page, grip, 70, 10);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Notiz', { exact: true }).fill('Synthetic unsaved note');
  await swipe(page, grip, 0, 90);
  await expect(
    dialog.getByRole('button', { name: 'Weiter bearbeiten', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Weiter bearbeiten', exact: true }).click();
  await expect(dialog.getByLabel('Notiz', { exact: true })).toHaveValue('Synthetic unsaved note');
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  await dialog.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(writes).toEqual([]);
});
