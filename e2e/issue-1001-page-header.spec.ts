import type { Locator } from '@playwright/test';
import { sampleTest as test, expect } from './sample';
import { MIN_TARGET_PX } from './ledger-helpers';
import { minimumControlHeight } from './control-geometry';

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
      let frame: { height: number; top: number; bottom: number } | undefined;
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
        // The whole bar keeps one height and the page body starts at the same offset everywhere.
        const actualFrame = await page.evaluate(() => ({
          height: document.querySelector('.page-header')!.getBoundingClientRect().height,
          top: document.querySelector('main')!.getBoundingClientRect().top,
          bottom: document.querySelector('.page-header')!.getBoundingClientRect().bottom,
        }));
        if (frame) {
          expect(
            Math.abs(actualFrame.height - frame.height),
            `${title}: header height ${JSON.stringify([actualFrame, frame])}`,
          ).toBe(0);
          // On phones the linked status line (open items) sits between header and body on some pages.
          if (!isMobile)
            expect(Math.abs(actualFrame.top - frame.top), `${title}: content top`).toBe(0);
          else
            expect(Math.abs(actualFrame.bottom - frame.bottom), `${title}: header bottom`).toBe(0);
        } else frame = actualFrame;
        if (reference) {
          boxes.forEach((actual, index) => {
            for (const key of ['x', 'y', 'width', 'height'] as const)
              expect(
                Math.abs(actual[key] - reference![index]![key]),
                `${title}: ${index}.${key}`,
              ).toBeLessThanOrEqual(0.5);
          });
        } else reference = boxes;
        for (const [index, target] of boxes.slice(1).entries()) {
          if (index === 1) continue; // the action group only wraps the three controls
          const minimum = await minimumControlHeight(elements[index + 1]!);
          expect(target.width).toBeGreaterThanOrEqual(Math.min(minimum, MIN_TARGET_PX));
          expect(target.height).toBeGreaterThanOrEqual(minimum);
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

test('Heute page controls are never clipped or hidden at desktop and tablet widths', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Phone Heute renders its own body controls');
  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?monat=2026-09');
    await expect(page.getByTestId('heute-lead-value')).toBeVisible();
    const head = page.locator('.page-header');
    expect((await box(head)).height, `${width}: header height`).toBeLessThanOrEqual(65);
    const container = page.locator('.hv-head:not(.hv-head-phone)').first();
    const outer = await box(container);
    const controls = container.locator('.month-switch button, .seg button');
    expect(await controls.count()).toBeGreaterThanOrEqual(4);
    for (const control of await controls.all()) {
      await expect(control).toBeVisible();
      const target = await box(control);
      expect(target.x, `${width}: left`).toBeGreaterThanOrEqual(0);
      expect(target.x + target.width, `${width}: right`).toBeLessThanOrEqual(width);
      expect(target.x, `${width}: container left`).toBeGreaterThanOrEqual(outer.x - 0.5);
      expect(target.x + target.width, `${width}: container right`).toBeLessThanOrEqual(
        outer.x + outer.width + 0.5,
      );
    }
    // Controls that are not in the header must not remain focusable-while-hidden inside it.
    const inHeader = await head.locator('.page-header-controls .month-switch').count();
    if (!inHeader) expect(await head.locator('.page-header-controls *').count()).toBe(0);
  }
});

test('Heute shows the Stand line once in the body at every desktop width', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Phone Heute renders its own header controls');
  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?monat=2026-09');
    await expect(page.getByTestId('heute-lead-value')).toBeVisible();
    // The phone header and lead foot carry their own Stand text, hidden on desktop.
    const stand = page.getByText(/^Stand (\d|nicht verfügbar)/).filter({ visible: true });
    await expect(stand, `${width}: Stand once`).toHaveCount(1);
    await expect(stand).toBeVisible();
    await expect(stand).toHaveAttribute('title', /Stichtag/);
    expect((await box(page.locator('.page-header'))).height, `${width}: header`).toBe(64);
    const standBox = await box(stand);
    expect(standBox.y, `${width}: Stand sits in the body`).toBeGreaterThanOrEqual(
      (await box(page.locator('.page-header'))).height - 1,
    );
  }
});

test('Heute controls keep keyboard focus when they move between header and body', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Phone Heute renders its own header controls');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?monat=2026-09');
  await expect(page.getByTestId('heute-lead-value')).toBeVisible();
  const prev = page.locator('.month-switch button').first();
  await prev.focus();
  const index = await page.evaluate(() => {
    const root = document.activeElement!.closest('.page-header-controls, .page-controls-row')!;
    return Array.from(root.querySelectorAll('button')).indexOf(document.activeElement as never);
  });
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const active = document.activeElement;
          const root = active?.closest('.page-header-controls, .page-controls-row');
          return root ? Array.from(root.querySelectorAll('button')).indexOf(active as never) : -1;
        }),
      )
      .toBe(index);
    expect((await box(page.locator('.page-header'))).height).toBe(64);
  }
});
