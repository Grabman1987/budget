import { sampleTest, expect } from './sample';

const pages = [
  ['/', '.heute'],
  ['/plan/monat?monat=2026-09', '.plan'],
  ['/reports/pallocation', '.portfolio-allocation-report'],
] as const;

sampleTest(
  'Heute, Plan and Allocation use the desktop content width',
  async ({ page, isMobile }) => {
    sampleTest.skip(isMobile, 'desktop width contract');
    await page.setViewportSize({ width: 1920, height: 1080 });
    for (const [path, body] of pages) {
      await page.goto(path);
      await expect(page.locator(body)).toBeVisible();
      for (const selector of ['main.sheet', body]) {
        const box = await page.locator(selector).boundingBox();
        expect(box?.width, `${path} ${selector}`).toBeGreaterThanOrEqual(1500);
      }
    }
  },
);

for (const width of [390, 1280, 1440, 1920, 2560]) {
  sampleTest(`page layouts stay contained at ${width}px`, async ({ page, isMobile }, info) => {
    sampleTest.skip(isMobile, 'explicit viewport matrix runs once');
    sampleTest.setTimeout(180_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
    for (const path of [
      ...pages.map(([path]) => path),
      '/reports',
      '/konten',
      '/vermoegen/nettovermoegen',
      '/vermoegen/portfolio',
      '/einstellungen/konten',
      '/einstellungen/datenquellen',
      '/reports/onepager?monat=2026-09',
      '/reports/jahresreport',
    ]) {
      await page.goto(path);
      await expect(page.locator('main.sheet')).toBeVisible();
      await expect(page.locator('main h1')).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState('networkidle');
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: path })
        .toBe(width);
      // Adjacent grid items must not cover each other; scrollable tables keep their own overflow.
      const overlaps = await page.locator('main').evaluate((main) => {
        const problems: string[] = [];
        for (const grid of main.querySelectorAll<HTMLElement>('*')) {
          if (getComputedStyle(grid).display !== 'grid') continue;
          const boxes = [...grid.children]
            .filter((el) => getComputedStyle(el).position !== 'absolute')
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.width > 0 && r.height > 0);
          boxes.forEach((a, i) => {
            for (const b of boxes.slice(i + 1)) {
              if (
                Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
              )
                problems.push(grid.className);
            }
          });
        }
        return problems;
      });
      expect(overlaps, path).toEqual([]);
      if (
        [390, 1440, 1920, 2560].includes(width) &&
        ['/', '/reports/pallocation', '/reports', '/konten'].includes(path)
      ) {
        await page.screenshot({
          path: info.outputPath(`${path.replaceAll('/', '-') || 'heute'}-${width}.png`),
          fullPage: true,
        });
      }
    }
  });
}
