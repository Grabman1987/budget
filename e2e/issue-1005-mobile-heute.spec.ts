import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { sampleTest as test, expect } from './sample';
import { MIN_TARGET_PX } from './ledger-helpers';

async function openHeute(page: Page) {
  const loaded = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/heute' && url.searchParams.get('period') === 'payday' && response.ok()
    );
  });
  await page.goto('/?monat=2026-09&period=payday');
  await (await loaded).finished();
  await expect(page.getByTestId('heute-lead-value')).toHaveText('988,26 €');
}

for (const theme of ['light', 'dark'] as const) {
  test(`compact Heute header, task amounts and safe-area tabs (${theme})`, async ({
    page,
    isMobile,
  }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await openHeute(page);
    await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
    await expect(page.getByTestId('heute-lead-value')).toHaveText('988,26 €');
    await expect(page.locator('.hv-revisions tbody tr').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const amounts = page.locator('.hv-revisions tbody .hv-task-amount');
    const amountHeading = page.getByRole('columnheader', { name: 'Betrag', exact: true });
    // Narrow rows retain accessible headings while the action moves below title and amount.
    await expect(amountHeading).toHaveText('Betrag');
    if (!isMobile) await expect(amountHeading).toBeVisible();
    expect(
      await amounts.evaluateAll((items) =>
        items.every((el) => getComputedStyle(el).whiteSpace === 'nowrap'),
      ),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    if (isMobile) {
      const header = page.locator('.m-head');
      const review = header.getByRole('link', { name: /^Prüfen, \d+ offen$/ });
      await expect(review).toBeVisible();
      await expect(header.getByRole('button', { name: 'Suchen' })).toBeVisible();
      await expect(header.locator('.avatar')).toBeVisible();
      await expect(page.locator('.m-status')).toHaveCount(0);
      await expect(page.locator('.hv-lead-value')).toHaveCSS('font-size', '40px');
      const top = (await header.boundingBox())!.y;
      const lead = (await page.getByTestId('heute-lead-value').boundingBox())!;
      expect(lead.y - top).toBeLessThanOrEqual(140);
      const month = (await page.locator('.hv-head-phone .month-switch').boundingBox())!;
      const period = (await page.locator('.hv-head-phone .seg').boundingBox())!;
      expect(month.y).toBe(period.y);
      expect(month.x + month.width).toBeLessThanOrEqual(period.x);
      await expect(page.locator('.hv-head-phone .month-name')).toHaveText('September 2026');
      await expect(page.locator('.hv-head-phone .seg')).toHaveCSS('height', '44px');
      {
        // The sliding pill fills the selected segment, inside the 44px control.
        const group = page.locator('.hv-head-phone .seg');
        const pill = (await group.locator('.seg-thumb').boundingBox())!;
        const selected = (await group.locator('button[aria-pressed="true"]').boundingBox())!;
        expect(Math.abs(pill.x - selected.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(pill.width - selected.width)).toBeLessThanOrEqual(1);
        expect(pill.height).toBeGreaterThanOrEqual(36);
        expect(pill.y).toBeGreaterThanOrEqual(period.y);
        expect(pill.y + pill.height).toBeLessThanOrEqual(period.y + period.height);
      }
      await expect(page.locator('.hv-chain-bar')).toHaveCSS('height', '1px');

      const dock = page.locator('.tabbar');
      for (const safe of [0, 34]) {
        await page.evaluate(
          (bottom) =>
            document.documentElement.style.setProperty('--mobile-safe-bottom', `${bottom}px`),
          safe,
        );
        await expect(dock).toHaveCSS('height', safe ? '78px' : '52px');
        const dockBox = (await dock.boundingBox())!;
        const links = await dock.getByRole('link').evaluateAll((items) =>
          items.map((el) => ({
            ...el.getBoundingClientRect().toJSON(),
            fontSize: getComputedStyle(el).fontSize,
            iconWidth: el.querySelector('svg')!.getBoundingClientRect().width,
          })),
        );
        expect(links).toHaveLength(5);
        for (const box of links) {
          expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          expect(box.y + box.height).toBeLessThanOrEqual(dockBox.y + dockBox.height - safe);
          expect(box.fontSize).toBe('11px');
          expect(box.iconWidth).toBe(22);
        }
      }
      const controls = await page
        .locator('.m-head :is(button, a, summary), .hv-head-phone button')
        .evaluateAll((items) =>
          items
            .filter((el) => el.getClientRects().length)
            .map((el) => el.getBoundingClientRect().toJSON()),
        );
      for (const box of controls) {
        expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      }
      // Test exposed targets in their initial position, before scroll hides the FAB.
      expect(
        await page.locator('.hv-tasks a').evaluateAll((items) => {
          const dockTop = document.querySelector('.tabbar')!.getBoundingClientRect().top;
          return items
            .filter((el) => {
              const box = el.getBoundingClientRect();
              return box.top >= 0 && box.bottom <= dockTop;
            })
            .every((el) => {
              const box = el.getBoundingClientRect();
              return [
                [box.left + 3, box.top + 3],
                [box.right - 3, box.bottom - 3],
              ].every(([x, y]) => {
                const hit = document.elementFromPoint(x!, y!);
                return hit === el || el.contains(hit);
              });
            });
        }),
      ).toBe(true);
    }
    const screenshot = info.outputPath(`heute-${isMobile ? '390' : '1440'}-${theme}.png`);
    await page.screenshot({ path: screenshot, scale: 'css' });
    await info.attach(`Heute ${theme}`, { path: screenshot, contentType: 'image/png' });
  });

  test(`Heute task links remain reachable and accessible (${theme})`, async ({
    page,
    isMobile,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openHeute(page);
    await expect(page.getByTestId('heute-lead-value')).toHaveText('988,26 €');
    expect(
      (await new AxeBuilder({ page }).include('main').include('.m-head').analyze()).violations,
    ).toEqual([]);
    if (isMobile) {
      for (const action of await page.locator('.hv-revisions a').all()) {
        await action.evaluate((el) => el.scrollIntoView({ block: 'center' }));
        await expect
          .poll(() =>
            action.evaluate((el) => {
              const box = el.getBoundingClientRect();
              return [
                [box.left + 3, box.top + 3],
                [box.right - 3, box.bottom - 3],
              ].every(([x, y]) => {
                const hit = document.elementFromPoint(x!, y!);
                return hit === el || el.contains(hit);
              });
            }),
          )
          .toBe(true);
      }
    }
  });

  test(`Heute controls preserve month and review context (${theme})`, async ({
    page,
    isMobile,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    if (isMobile) await page.setViewportSize({ width: 375, height: 844 });
    await openHeute(page);
    const controls = page.locator(isMobile ? '.hv-head-phone' : '.topbar .hv-head');
    await expect(controls.locator('.month-name')).toHaveText('September 2026');
    await controls.getByRole('button', { name: 'Monat', exact: true }).click();
    await expect(page).toHaveURL(/period=month/);
    await controls.getByRole('button', { name: 'Vormonat', exact: true }).click();
    await expect(page).toHaveURL(/monat=2026-08/);
    await expect(controls.locator('.month-name')).toHaveText('August 2026');
    await expect(controls.getByRole('button', { name: 'Bis Gehalt', exact: true })).toBeDisabled();
    const month = (await controls.locator('.month-switch').boundingBox())!;
    const period = (await controls.locator('.seg').boundingBox())!;
    if (isMobile) {
      // 44px arrows + return control + body-size month do not share a 375px row with the segments
      // (#1065): the segments then take their own full-width line below the stepper.
      expect(month.y + month.height).toBeLessThanOrEqual(period.y);
      expect(month.x + month.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    } else {
      expect(month.y + month.height / 2).toBe(period.y + period.height / 2);
      expect(month.x + month.width).toBeLessThanOrEqual(period.x);
    }
    expect(period.x + period.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await controls.getByRole('button', { name: 'Zum aktuellen Monat' }).click();
    await expect(page).toHaveURL(/monat=2026-09/);
    await page.locator('.page-header .review-pill').click();
    await expect(page).toHaveURL(/\/konten\/pruefen/);
    await page.getByRole('link', { name: 'Zurück zur vorherigen Ansicht' }).click();
    await expect(page).toHaveURL(/monat=2026-09/);
  });
}

test('full non-current month and return control fit the 375px phone header', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/?monat=2025-09&period=month');
  const controls = page.locator('.hv-head-phone');
  await expect(controls.locator('.month-name')).toHaveText('September 2025');
  await expect(controls.getByRole('button', { name: 'Zum aktuellen Monat' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    overflow: [...document.querySelectorAll('main *')]
      .filter((el) => el.getBoundingClientRect().right > innerWidth)
      .map((el) => ({ class: el.className, right: el.getBoundingClientRect().right })),
  }));
  expect(layout.width, JSON.stringify(layout.overflow)).toBeLessThanOrEqual(layout.viewport);
});
