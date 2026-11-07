import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';

for (const theme of ['light', 'dark'] as const)
  test(`Plan calm grid retains full-width bars, amount columns and keyboard actions · ${theme}`, async ({
    page,
  }, info) => {
    const phone = page.viewportSize()!.width < 768;
    const widths = phone ? [390] : [1440, 1280];
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/'))
        writes.push(request.method());
    });
    for (const width of widths) {
      await page.setViewportSize({ width, height: phone ? 844 : 900 });
      await page.goto('/plan/monat?monat=2026-09');
      await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
      await expect(page.locator('.ptable .prow').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      const path = info.outputPath(`plan-grid-${width}-${theme}.png`);
      await page.screenshot({ path, fullPage: !phone });
      await info.attach(`plan-grid-${width}-${theme}`, { path, contentType: 'image/png' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      if (!phone) {
        const tableScroll = page.locator('.pmulti-scroll:has(.ptable-zero)');
        expect(
          await tableScroll.evaluate((element) => element.scrollWidth - element.clientWidth),
        ).toBe(0);
        const rows = await page.locator('.ptable-zero .prow:not(.is-empty)').evaluateAll((rows) =>
          rows.map((row) => {
            const element = (selector: string) => row.querySelector<HTMLElement>(selector)!;
            const box = (selector: string) => element(selector).getBoundingClientRect();
            const bar = box('.spending-bar');
            const name = box('.pname');
            const checkbox = box('input[type="checkbox"]');
            const status = box('.spending-status');
            const cell = box('.col-name');
            const statusStyle = getComputedStyle(element('.spending-status'));
            const add = row.querySelector('.plan-add');
            const addLabel = document.createRange();
            if (add) addLabel.selectNodeContents(add);
            return {
              category: element('.pname').textContent,
              grid: getComputedStyle(element('.col-name')).gridTemplateColumns,
              barColumn: getComputedStyle(element('.spending-bar')).gridColumn,
              barStart: bar.left,
              nameStart: name.left,
              barEnd: bar.right,
              nameCellEnd:
                cell.right - parseFloat(getComputedStyle(element('.col-name')).paddingRight),
              statusEnd: status.right,
              nameBottom: name.bottom,
              nameHeight: name.height,
              nameWidth: name.width,
              statusTop: status.top,
              statusBottom: status.bottom,
              statusHeight: status.height,
              addBottom: add?.getBoundingClientRect().bottom ?? null,
              addLabelBottom: add ? addLabel.getBoundingClientRect().bottom : null,
              barTop: bar.top,
              belowBar: row.getBoundingClientRect().bottom - bar.bottom,
              checkboxSize: [checkbox.width, checkbox.height],
              checkboxInkSize: getComputedStyle(element('input[type="checkbox"]'), '::before')
                .width,
              checkboxCenter: checkbox.top + checkbox.height / 2,
              blockCenter: (name.top + bar.bottom) / 2,
              statusPosition: statusStyle.position,
              statusColor: statusStyle.color,
              secondaryColor: getComputedStyle(row).getPropertyValue('--ink-2').trim(),
              amounts: ['.col-assign', '.col-act', '.col-avail'].map((selector) => ({
                width: box(selector).width,
                align: getComputedStyle(element(selector)).textAlign,
                figures: getComputedStyle(element(selector)).fontVariantNumeric,
              })),
              underlines: ['.assign-btn', '.activity-link', '.pill'].map(
                (selector) => getComputedStyle(element(selector)).textDecorationLine,
              ),
              arrows: row.querySelectorAll('.col-avail svg').length,
            };
          }),
        );
        expect(rows.length).toBeGreaterThan(1);
        for (const row of rows) {
          expect(row.barStart).toBeCloseTo(row.nameStart, 0);
          expect(row.barEnd).toBeCloseTo(row.nameCellEnd, 0);
          expect(row.statusEnd).toBeCloseTo(row.barEnd, 0);
          expect(row.nameHeight).toBe(44);
          expect(row.nameWidth).toBeGreaterThan(0);
          expect(row.nameBottom).toBeLessThanOrEqual(row.statusTop);
          expect(row.statusHeight).toBeLessThanOrEqual(40);
          expect(row.statusBottom).toBeLessThanOrEqual(row.barTop);
          if (row.addBottom !== null) expect(row.addBottom).toBeLessThanOrEqual(row.statusTop);
          if (row.addLabelBottom !== null)
            expect(row.addLabelBottom).toBeLessThanOrEqual(row.statusTop);
          expect(row.belowBar).toBeGreaterThanOrEqual(8);
          expect(row.checkboxSize).toEqual([16, 16]);
          expect(row.checkboxInkSize).toBe('16px');
          expect(row.checkboxCenter).toBeCloseTo(row.blockCenter, 0);
          expect(row.statusPosition).toBe('static');
          expect(row.amounts).toEqual(
            Array(3).fill({ width: 128, align: 'right', figures: 'tabular-nums' }),
          );
          expect(row.underlines).toEqual(['none', 'none', 'none']);
          expect(row.arrows).toBe(0);
        }
        await info.attach(`plan-grid-geometry-${width}-${theme}`, {
          body: JSON.stringify(rows),
          contentType: 'application/json',
        });
      } else {
        for (const selector of ['.pname', '.plan-available']) {
          const control = await page.locator(`.ptable ${selector}`).first().boundingBox();
          expect(control!.height).toBeGreaterThanOrEqual(44);
          expect(control!.width).toBeGreaterThanOrEqual(44);
        }
      }
      const axe = await new AxeBuilder({ page }).include('.ptable-zero').analyze();
      expect(axe.violations).toEqual([]);
      if (!phone) {
        const assigned = page.locator('.ptable .assign-btn').first();
        await assigned.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.ptable .assign-input')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.locator('.ptable .assign-input')).toHaveCount(0);
        const cover = page.locator('.ptable .prow.is-over .cover-row').first();
        await expect(cover).toHaveAccessibleName(/decken$/);
        await expect(cover).toHaveAccessibleDescription(/−[\d.,]+ €/);
        await cover.focus();
        await page.keyboard.press('Enter');
        const inspector = page.getByRole('complementary', { name: 'Plan-Inspektor' });
        await expect(inspector.getByRole('button', { name: /^Mit .* decken$/ })).toBeVisible();
        await page.keyboard.press('Escape');
      }
    }
    expect(writes).toEqual([]);
  });
