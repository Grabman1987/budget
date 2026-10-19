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
    if (report === 'jahresansicht') await expect(body.locator('.seg-depth')).toBeVisible();
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
    const screenColumns = await body
      .locator('table.rtable')
      .evaluateAll((tables) =>
        tables.map((table) =>
          Array.from(table.querySelectorAll('thead th'), (cell) => cell.textContent),
        ),
      );
    // A4 landscape minus the declared 10 mm margins, in CSS pixels at 96 dpi.
    await page.setViewportSize({ width: 1047, height: 718 });
    await page.emulateMedia({ media: 'print' });
    await expect(content).toBeVisible();
    await expect(toggle).not.toBeVisible();
    await expect(page.locator('.sidebar')).not.toBeVisible();
    await expect(page.locator('.topbar')).not.toBeVisible();
    await expect(page.locator('.registers').first()).not.toBeVisible();
    await expect(body.locator('.seg-depth')).not.toBeVisible();
    // Print media can settle incrementally after screen-mode accessibility analysis.
    // Require the actual paper/foreground palette before measuring its contrast.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect
      .poll(() =>
        page.evaluate(() => {
          const root = getComputedStyle(document.documentElement);
          const rgb = (token: string) => {
            const hex = root.getPropertyValue(token).trim().slice(1);
            return `rgb(${[0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`;
          };
          const ink = rgb('--ink');
          return {
            paper: getComputedStyle(document.body).backgroundColor === rgb('--surface'),
            body: getComputedStyle(document.body).color === ink,
            heading: getComputedStyle(document.querySelector('h1')!).color === ink,
            value: getComputedStyle(document.querySelector('.rtable td')!).color === ink,
          };
        }),
      )
      .toEqual({ paper: true, body: true, heading: true, value: true });
    const printInk = await page.evaluate(() => ({
      token: getComputedStyle(document.documentElement).getPropertyValue('--ink'),
      body: getComputedStyle(document.body).color,
      heading: getComputedStyle(document.querySelector('h1')!).color,
      cell: getComputedStyle(document.querySelector('.rtable td')!).color,
    }));
    expect(
      (await new AxeBuilder({ page }).include('main').analyze()).violations,
      JSON.stringify(printInk),
    ).toEqual([]);
    // WebKit parses named @page rules but exposes an empty computed `page` value.
    // Check the actual printed columns/bounds here; Chromium's PDF below checks paper size.
    expect(
      await body
        .locator('table.rtable')
        .evaluateAll((tables) =>
          tables.map((table) =>
            Array.from(table.querySelectorAll('thead th'), (cell) => cell.textContent),
          ),
        ),
    ).toEqual(screenColumns);
    const bounds = await body.locator('table.rtable').evaluateAll((tables) =>
      tables.map((table) => {
        const rect = table.getBoundingClientRect();
        const cells = Array.from(table.querySelectorAll('th, td'));
        const overflowingCells = cells.flatMap((cell) => {
          const box = cell.getBoundingClientRect();
          if (
            box.left >= rect.left - 1 &&
            box.right <= rect.right + 1 &&
            cell.scrollWidth <= cell.clientWidth + 1
          ) {
            return [];
          }
          const style = getComputedStyle(cell);
          return [
            {
              text: cell.textContent,
              width: box.width,
              scroll: cell.scrollWidth,
              client: cell.clientWidth,
              whiteSpace: style.whiteSpace,
              fontSize: style.fontSize,
            },
          ];
        });
        return {
          width: rect.width,
          scroll: table.scrollWidth,
          client: table.clientWidth,
          cellsFit: overflowingCells.length === 0,
          overflowingCells: overflowingCells.slice(0, 10),
        };
      }),
    );
    expect(bounds.length).toBeGreaterThan(0);
    expect(
      bounds.every(
        (table) => table.width <= 1047 && table.scroll <= table.client + 1 && table.cellsFit,
      ),
      JSON.stringify(bounds),
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
    if (report === 'jahresansicht') await expect(body.locator('.seg-depth')).toBeVisible();
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
    await expect(page.locator(sheet!).first()).toBeVisible();
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
