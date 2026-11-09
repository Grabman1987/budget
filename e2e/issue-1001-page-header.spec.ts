import type { Locator } from '@playwright/test';
import { sampleTest as test, expect } from './sample';
import { MIN_TARGET_PX } from './ledger-helpers';

test.setTimeout(120_000);

const pages = [
  ['Heute', '/?monat=2026-09', 'heute-lead-value'],
  ['Plan', '/plan/monat?monat=2026-09', 'to-be-assigned'],
  ['Konten', '/konten', 'budget-accounts-balance'],
  ['Vermögen', '/vermoegen', 'wealth-net-value'],
  ['Reports', '/reports', null],
] as const;

async function box(locator: Locator) {
  await expect(locator).toBeVisible();
  return (await locator.boundingBox())!;
}

for (const theme of ['light', 'dark'] as const) {
  test(`shared header geometry and screenshots (${theme})`, async ({ page, isMobile }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    const widths = isMobile ? [390] : [1440, 1280];
    for (const width of widths) {
      await page.setViewportSize({ width, height: isMobile ? 844 : 900 });
      let reference: Awaited<ReturnType<typeof box>>[] | undefined;
      for (const [title, url, ready] of pages) {
        await page.goto(url);
        if (ready) await expect(page.getByTestId(ready)).toBeVisible();
        await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
        const header = page.locator('.page-header');
        await expect(header.locator('.page-header-title')).toHaveText(title);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(header.getByRole('link', { name: /^Prüfen, \d+ offen$/ })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const elements = [
          header.locator('.page-header-title'),
          header.locator('.page-header-search button'),
          header.locator('.page-header-actions'),
          header.getByRole('button', { name: 'Beträge verbergen' }),
          header.locator('.review-pill'),
          header.getByRole('link', { name: 'Buchung', exact: true }),
        ];
        const boxes = await Promise.all(elements.map(box));
        if (reference) {
          boxes.forEach((actual, index) => {
            for (const key of ['x', 'y', 'width', 'height'] as const)
              expect(
                Math.abs(actual[key] - reference![index]![key]),
                `${title}: ${index}.${key}`,
              ).toBeLessThanOrEqual(0.5);
          });
        } else reference = boxes;
        for (const target of boxes.slice(1)) {
          expect(target.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          expect(target.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          expect(target.x + target.width).toBeLessThanOrEqual(width);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        if (width !== 1280) {
          const name = `header-${title}-${theme}-${width}.png`;
          const path = info.outputPath(name);
          await page.screenshot({ path });
          await info.attach(name, { path, contentType: 'image/png' });
        }
      }
    }
  });
}

test('shared utilities preserve page context and phone safe-area clearance', async ({
  page,
  isMobile,
}) => {
  await page.goto('/plan/monat?monat=2026-09');
  const header = page.locator('.page-header');
  const search = header.locator('.page-header-search button');
  await search.click();
  await expect(page.getByRole('dialog', { name: 'Suchen', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toBeFocused();
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-09/);
  await header.getByRole('button', { name: 'Beträge verbergen' }).click();
  await expect(header.getByRole('button', { name: 'Beträge verbergen' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await header.getByRole('button', { name: 'Beträge verbergen' }).click();
  await header.getByRole('link', { name: 'Buchung', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  if (isMobile) {
    for (const safe of [0, 34]) {
      await page.evaluate(
        (bottom) =>
          document.documentElement.style.setProperty('--mobile-safe-bottom', `${bottom}px`),
        safe,
      );
      const dock = await box(page.locator('.tabbar'));
      for (const link of await page.locator('.tabbar a').all()) {
        const target = await box(link);
        expect(target.y + target.height).toBeLessThanOrEqual(dock.y + dock.height - safe);
      }
    }
  }
});
