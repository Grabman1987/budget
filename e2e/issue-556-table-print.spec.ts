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
    // The fixed year matrix always includes category detail; its old depth switch is superseded.
    if (report === 'jahresansicht') await expect(body.locator('[data-template-row^="cat:"]').first()).toBeVisible();
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
    // The first document h1 is the hidden mobile shell title, not the printed report.
    await expect(page.locator('.titleblock .report-heading h1')).toBeVisible();
    const expectedPalette = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const rgb = (token: string) => {
        const value = root.getPropertyValue(token).trim().slice(1);
        // The built stylesheet minifies #ffffff to #fff.
        const hex =
          value.length === 3 ? Array.from(value, (digit) => digit + digit).join('') : value;
        return `rgb(${[0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`;
      };
      const ink = rgb('--ink');
      return { paper: rgb('--surface'), body: ink, heading: ink };
    });
    await expect
      .poll(() =>
        page.evaluate(() => ({
          paper: getComputedStyle(document.body).backgroundColor,
          body: getComputedStyle(document.body).color,
          heading: getComputedStyle(document.querySelector('.titleblock .report-heading h1')!)
            .color,
        })),
      )
      .toEqual(expectedPalette);
    const printInk = await page.evaluate(() => ({
      token: getComputedStyle(document.documentElement).getPropertyValue('--ink'),
      body: getComputedStyle(document.body).color,
      heading: getComputedStyle(document.querySelector('.titleblock .report-heading h1')!).color,
    }));
    // Cells can legitimately use muted/percentage/delta roles. Strict Axe covers
    // all visible printed values instead of assuming a generic first td uses --ink.
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
    const numericTokens = await body.locator('table.rtable').evaluateAll((tables) => {
      let checked = 0;
      const broken: Array<{ token: string; cell: string | null; lines: number }> = [];
      for (const table of tables) {
        const walker = document.createTreeWalker(table, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const parent = node.parentElement;
          if (!parent || parent.closest('.sr-only, [hidden]')) continue;
          for (const match of (node.textContent ?? '').matchAll(/[+−-]?\d[\d.]*(?:,\d+)?/g)) {
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
            if (!rects.length) continue;
            checked++;
            const lines = new Set(rects.map((rect) => rect.top)).size;
            if (lines > 1)
              broken.push({
                token: match[0],
                cell: parent.closest('th, td')?.textContent ?? null,
                lines,
              });
          }
        }
      }
      return { checked, broken };
    });
    expect(numericTokens.checked).toBeGreaterThan(0);
    expect(numericTokens.broken).toEqual([]);
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
      // A named-page transition must not append an empty terminal page, even
      // when that extra page happens to inherit the same landscape dimensions.
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const loadingTask = getDocument({ data: new Uint8Array(pdf) });
      const pdfDocument = await loadingTask.promise;
      try {
        expect(pdfDocument.numPages).toBe(pages.length);
        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
          const pdfPage = await pdfDocument.getPage(pageNumber);
          const content = await pdfPage.getTextContent();
          const text = content.items
            .flatMap((item) => ('str' in item ? [item.str] : []))
            .join('')
            .trim();
          expect(text, `${report}: PDF page ${pageNumber} must contain report text`).not.toBe('');
        }
      } finally {
        await loadingTask.destroy();
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
