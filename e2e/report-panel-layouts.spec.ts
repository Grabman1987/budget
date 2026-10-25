import { expect, sampleTest as test } from './sample';
import { inspectReport } from './spending-helpers';

test('secondary report sections follow their main content at full width', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const cases = [
    {
      path: '/reports/ausgaben?zeitraum=1J',
      main: '[aria-labelledby="sa-main"]',
      secondary: '[aria-labelledby="sa-moves"]',
      name: 'spending-inline',
    },
    {
      path: '/reports/finanzcheck',
      main: '[aria-labelledby="fc-today"]',
      secondary: '[aria-labelledby="fc-actions"]',
      name: 'overview-inline',
    },
    {
      path: '/reports/liquiditaet',
      main: '[aria-labelledby="liq-events"]',
      secondary: '[aria-labelledby="liq-levers"]',
      name: 'future-inline',
    },
  ];
  for (const item of cases) {
    await page.goto(item.path);
    if (item.name === 'future-inline') await page.locator('details.rf-tools > summary').click();
    const main = page.locator(item.main);
    const secondary = page.locator(item.secondary);
    await expect(secondary).toBeVisible({ timeout: 40_000 });
    // Read both rectangles in one browser turn. Separate protocol calls can observe different
    // animation/font-loading frames and manufacture an overlap that never exists on screen.
    const boxes = async () =>
      main.evaluate((element, selector) => {
        const following = document.querySelector(selector);
        if (!following) throw new Error(`Missing secondary report section: ${selector}`);
        const snapshot = (node: Element) => {
          const { x, y, width, height } = node.getBoundingClientRect();
          return { x, y, width, height };
        };
        return [snapshot(element), snapshot(following)] as const;
      }, item.secondary);
    await expect
      .poll(async () => {
        const [a, b] = await boxes();
        return b.y - (a.y + a.height) >= 0;
      })
      .toBe(true);
    const [a, b] = await boxes();
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
    expect(Math.abs(b.x - a.x)).toBeLessThan(2);
    expect(Math.abs(b.width - a.width)).toBeLessThan(2);
    await inspectReport(page, info, item.name);
  }
  await page.goto('/reports/kategorien?zeitraum=1J');
  await page.locator('.rc-btn[aria-expanded="false"]').first().click();
  const summary = page.locator('.rc-d').first();
  await expect(summary).toBeVisible();
  const container = (await summary.boundingBox())!;
  const facts = (await summary.locator('.rc-facts').boundingBox())!;
  expect(Math.abs(container.width - facts.width)).toBeLessThan(2);
  await expect(page.locator('.category-month-link').first()).toHaveAttribute(
    'href',
    /basis=category-spending/,
  );
  await inspectReport(page, info, 'category-inline-summary');
});
