import AxeBuilder from '@axe-core/playwright';
import { expect, sampleTest as test } from './sample';

const reports = ['jahresansicht', 'kategorien', 'sparquote'] as const;

for (const report of reports) {
  test(`${report}: landscape print preserves columns and expands remembered sections`, async ({
    page,
    browserName,
  }, info) => {
    test.slow();
    await page.goto(`/reports/${report}`);
    const body = page.locator('.report-table-print');
    await expect(body.locator('table.rtable').first()).toBeVisible();
    const toggle = body.locator('.section-toggle').first();
    await expect(toggle).toBeVisible();
    const section = toggle.locator('xpath=ancestor::section[1]');
    const content = section.locator(':scope > :not([data-section-head], .section-toggle)').first();
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
    await expect(content).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (info.project.name !== 'desktop') {
        const size = await toggle.boundingBox();
        expect(size!.width).toBeGreaterThanOrEqual(44);
        expect(size!.height).toBeGreaterThanOrEqual(44);
      }
    }
    await toggle.click();
    await expect(section).toHaveAttribute('data-collapsed', 'true');
    await expect(content).not.toBeVisible();
    const remembered = await page.evaluate(() =>
      localStorage.getItem(`budget.report-sections.${location.pathname}`),
    );
    // A4 landscape minus the declared 10 mm margins, in CSS pixels at 96 dpi.
    await page.setViewportSize({ width: 1047, height: 718 });
    await page.emulateMedia({ media: 'print' });
    await expect(content).toBeVisible();
    await expect(toggle).not.toBeVisible();
    await expect(page.locator('.sidebar')).not.toBeVisible();
    await expect(page.locator('.topbar')).not.toBeVisible();
    await expect(page.locator('.registers').first()).not.toBeVisible();
    expect(await page.locator('.sheet').evaluate((element) => getComputedStyle(element).page)).toBe(
      'report-table',
    );
    const bounds = await body.locator('table.rtable').evaluateAll((tables) =>
      tables.map((table) => {
        const rect = table.getBoundingClientRect();
        const cells = Array.from(table.querySelectorAll('th, td'));
        return {
          width: rect.width,
          scroll: table.scrollWidth,
          client: table.clientWidth,
          cellsFit: cells.every((cell) => {
            const box = cell.getBoundingClientRect();
            return (
              box.left >= rect.left - 1 &&
              box.right <= rect.right + 1 &&
              cell.scrollWidth <= cell.clientWidth + 1
            );
          }),
        };
      }),
    );
    expect(bounds.length).toBeGreaterThan(0);
    expect(
      bounds.every(
        (table) => table.width <= 1047 && table.scroll <= table.client + 1 && table.cellsFit,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() =>
        localStorage.getItem(`budget.report-sections.${location.pathname}`),
      ),
    ).toBe(remembered);
    await page.screenshot({ path: info.outputPath(`${report}-print.png`), fullPage: true });
    if (browserName === 'chromium' && info.project.name === 'desktop') {
      const pdf = await page.pdf({
        path: info.outputPath(`${report}.pdf`),
        preferCSSPageSize: true,
        printBackground: true,
      });
      expect(pdf.byteLength).toBeGreaterThan(1000);
      const pages = Array.from(
        pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g),
      );
      expect(pages.length).toBeGreaterThan(0);
      for (const dimensions of pages) {
        expect(Number(dimensions[1])).toBeGreaterThan(Number(dimensions[2]));
        expect(Math.abs(Number(dimensions[1]) - 841.89)).toBeLessThan(1);
        expect(Math.abs(Number(dimensions[2]) - 595.28)).toBeLessThan(1);
      }
    }
    await page.emulateMedia({ media: 'screen' });
    await expect(content).not.toBeVisible();
    await expect(section).toHaveAttribute('data-collapsed', 'true');
  });
}

test('the specialized One-Pager and Jahresreport keep their portrait page contract', async ({
  page,
  browserName,
}, info) => {
  test.slow();
  for (const [path, sheet] of [
    ['/reports/onepager?monat=2026-08', '.psheet'],
    ['/reports/jahresreport', '.ov-sheet'],
  ]) {
    await page.goto(path!);
    await expect(page.locator(sheet!).first()).toBeVisible();
    await expect(page.locator('.report-table-print')).toHaveCount(0);
    await page.emulateMedia({ media: 'print' });
    expect(
      await page.locator('.sheet').evaluate((element) => getComputedStyle(element).page),
    ).not.toBe('report-table');
    if (browserName === 'chromium' && info.project.name === 'desktop') {
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      const pages = Array.from(
        pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g),
      );
      expect(pages.length).toBeGreaterThan(0);
      for (const dimensions of pages) {
        expect(Number(dimensions[2])).toBeGreaterThan(Number(dimensions[1]));
        expect(Math.abs(Number(dimensions[1]) - 595.28)).toBeLessThan(1);
        expect(Math.abs(Number(dimensions[2]) - 841.89)).toBeLessThan(1);
      }
    }
    await page.emulateMedia({ media: 'screen' });
  }
});
