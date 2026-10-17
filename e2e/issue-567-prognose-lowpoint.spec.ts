import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { LiquidityReportView } from '@budget/db';
import { eur, longDay, shortDay } from '../apps/web/src/ledger/format';
import { expect as baseExpect, sampleTest as test } from './sample';

const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ timeout: 120_000 });

const PATH = '/plan/prognose';

for (const theme of ['light', 'dark'] as const) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme });

    async function open(page: Page) {
      const res = await page.request.get('/api/liquidity?horizon=6m');
      expect(res.status()).toBe(200);
      const view = (await res.json()) as LiquidityReportView;
      await page.goto(PATH);
      await expect(page.getByTestId('liquidity-chart')).toBeVisible();
      await page.evaluate(async (value) => {
        document.documentElement.dataset['theme'] = value;
        await document.fonts.ready;
      }, theme);
      return view.report!;
    }

    test('Tiefststand marks the minimum of the plotted series, to the cent, with its date', async ({
      page,
    }) => {
      const report = await open(page);
      let min = report.points[0]!;
      for (const p of report.points) if (p.balanceCents < min.balanceCents) min = p;
      const mark = page.getByTestId('liquidity-lowpoint');
      await expect(mark).toHaveAttribute('data-cents', String(min.balanceCents));
      await expect(mark).toHaveAttribute('data-day', min.day);
      await expect(mark).toContainText(eur(min.balanceCents));
      await expect(mark).toContainText(`TIEFSTSTAND · ${shortDay(min.day)}`);
      // The figure above the chart and the accessible chart summary tell the same low.
      await expect(page.getByTestId('liq-low')).toHaveText(eur(min.balanceCents));
      await expect(page.getByTestId('liquidity-chart')).toHaveAttribute(
        'aria-label',
        new RegExp(`Tiefststand ${eur(min.balanceCents)} am ${longDay(min.day)}`),
      );
    });

    test('HEUTE and GEHALT marks stand on their days; the label is inside the chart and clear of the line', async ({
      page,
    }) => {
      const report = await open(page);
      const chart = page.getByTestId('liquidity-chart');
      await expect(page.getByTestId('liquidity-mark-heute')).toHaveText('HEUTE');
      const salary = report.movements
        .flatMap((m) => m.rows)
        .find((r) => r.cents > 0 && !r.planned && r.label.toLowerCase().includes('gehalt'));
      expect(salary, 'the sample has a salary in the forecast').toBeTruthy();
      await expect(page.getByTestId('liquidity-mark-gehalt')).toHaveText(
        `GEHALT ${shortDay(salary!.day)}`,
      );

      const geometry = await chart.evaluate((svg) => {
        const box = svg.getBoundingClientRect();
        const label = svg
          .querySelector('[data-testid="liquidity-lowpoint"]')!
          .querySelectorAll('text');
        const rects = [...label].map((t) => t.getBoundingClientRect());
        const path = svg.querySelector<SVGPathElement>('path.l-forecast')!;
        const ctm = path.getScreenCTM()!;
        const length = path.getTotalLength();
        const crossed: number[] = [];
        for (let at = 0; at <= length; at += 1) {
          const p = path.getPointAtLength(at);
          const x = p.x * ctm.a + ctm.e;
          const y = p.y * ctm.d + ctm.f;
          for (const r of rects)
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) crossed.push(at);
        }
        return {
          inside: rects.every(
            (r) => r.left >= box.left && r.right <= box.right && r.top >= box.top,
          ),
          crossed: crossed.length,
          fontSize: Math.min(
            ...[...label].map((t) => Number.parseFloat(getComputedStyle(t).fontSize)),
          ),
        };
      });
      expect(geometry.inside).toBe(true);
      expect(geometry.crossed).toBe(0);
      expect(geometry.fontSize).toBeGreaterThanOrEqual(11);
    });

    test('Nächste Buchungsereignisse lists the movements behind the chart in order', async ({
      page,
    }) => {
      const report = await open(page);
      const expected = report.movements.flatMap((m) => m.rows).slice(0, 10);
      expect(expected.length).toBeGreaterThan(2);
      const items = page.getByTestId('liq-next-event');
      await expect(items).toHaveCount(expected.length);
      for (const [i, row] of expected.entries()) {
        const item = items.nth(i);
        await expect(item.locator('.lq-no')).toHaveText(String(i + 1).padStart(2, '0'));
        await expect(item).toContainText(row.label);
        await expect(item).toContainText(longDay(row.day));
        await expect(item.locator('strong')).toHaveText(eur(row.cents, { sign: true }));
      }
      // Dates never run backwards, and every listed row is one of the plotted days.
      const days = expected.map((r) => r.day);
      expect([...days].sort()).toEqual(days);
      for (const d of days) expect(report.points.some((p) => p.day === d)).toBe(true);
    });

    test('no horizontal page scroll, no Axe violations, touch targets of the page body', async ({
      page,
      isMobile,
    }, info) => {
      await open(page);
      await expect(page.getByTestId('liq-next-events')).toBeVisible();
      expect(
        await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          viewport: window.innerWidth,
        })),
      ).toEqual({ overflow: false, viewport: isMobile ? 390 : 1440 });
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations).toEqual([]);
      if (isMobile) {
        const undersized = await page
          .locator(
            'main a[href]:visible, main button:visible, main input:visible, main select:visible',
          )
          .evaluateAll((els) =>
            els
              .map((el) => ({ target: el.outerHTML.slice(0, 120), ...el.getBoundingClientRect() }))
              .filter(({ width, height }) => width < 44 || height < 44)
              .map(({ target, width, height }) => ({ target, width, height })),
          );
        expect(undersized).toEqual([]);
      }
      await page.screenshot({
        fullPage: true,
        animations: 'disabled',
        path: info.outputPath(`prognose-${theme}.png`),
      });
    });
  });
}
