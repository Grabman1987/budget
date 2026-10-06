import { sampleTest as test, expect } from './sample';
import type { Heute } from '../apps/web/src/heute/api';
import { eur } from '../apps/web/src/ledger/format';

test('Pace reduces its lines and shares the plan marker and tooltip, with today on Plan bars', async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => localStorage.setItem('budget-heute-more-phone', '1'));
  const { pace } = (await (await page.request.get('/api/heute?month=2026-09')).json()) as Heute;
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 375, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const url of ['/?monat=2026-09', '/reports/onepager?monat=2026-09']) {
    await page.goto(url);
    await expect(page.getByTestId('pace-header')).toHaveCount(0);
    const chart = page.getByTestId('heute-pace-chart');
    await expect(chart).toBeVisible({ timeout: 30_000 });
    if (url.startsWith('/?')) {
      expect(
        await page
          .locator('.heute-lead')
          .evaluate((el) => el.nextElementSibling?.classList.contains('heute-pace')),
      ).toBe(true);
      await expect(page.locator('.heute-lead path.l-actual')).toHaveCSS('stroke-width', '2px');
      await expect(page.locator('.heute-lead path.l-forecast')).toHaveCSS('stroke-width', '1.75px');
    }
    const paceChart = page.locator('.heute-chart').filter({ has: chart });
    await expect(paceChart.locator('.chart-legend')).toHaveText('IstHochrechnungDeckel');
    await expect(chart.locator('.pace-income-line, .l-prev')).toHaveCount(0);
    await expect(chart.locator('.l-plan:not(.pace-limit-line)')).toHaveCount(0);
    await expect(
      chart.getByText(`Plan bis heute ${eur(pace.figures.planToDateCents, { cents: false })}`, {
        exact: true,
      }),
    ).toBeVisible();
    const toggle = paceChart.locator('button.pace-context-toggle');
    await expect(toggle).toHaveText('Mehr anzeigen');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(chart.locator('path.pace-income-line, path.l-prev')).toHaveCount(2);
    await page.keyboard.press('Space');
    await expect(chart.locator('.pace-income-line, .l-prev')).toHaveCount(0);
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(chart.locator('.l-today')).toHaveCount(1);
    await expect(chart.locator('text').filter({ hasText: /^heute$/ })).toHaveCount(1);
    const group = chart.locator('..');
    await group.focus();
    for (let d = 0; d < 17; d++) await page.keyboard.press('ArrowRight');
    const tooltip = page.locator('.chart-tooltip');
    await expect(tooltip.locator('.chart-tooltip-row span')).toHaveText([
      'Ist',
      'Hochrechnung',
      'Deckel',
      'Plan bis heute',
      'Einnahmen bis dahin',
      'Differenz',
      'Vormonat',
    ]);
    await expect(tooltip).toContainText(
      'Hochrechnung = Ausgegeben + offene Fixkosten + Rest des variablen Plans (ab Tag 7 hochgerechnet)',
    );
    for (const [name, value] of [
      ['Ist', pace.figures.spentCents],
      ['Plan bis heute', pace.figures.planToDateCents],
      ['Deckel', pace.figures.limitCents],
      ['Hochrechnung', pace.figures.spentCents],
    ] as const) {
      await expect(
        tooltip
          .locator('.chart-tooltip-row')
          .filter({ has: page.getByText(name, { exact: true }) }),
      ).toContainText(eur(value));
    }
    await page.keyboard.press('Escape');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => {
        document.documentElement.dataset['theme'] = t;
      }, theme);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      expect(
        await chart.evaluate((svg) => {
          const plan = svg.querySelector<SVGGraphicsElement>('.pace-plan-label')!.getBBox();
          const cap = svg.querySelector<SVGGraphicsElement>('.pace-cap-label')!.getBBox();
          const rule = svg.querySelector<SVGGraphicsElement>('.pace-limit-line')!.getBBox();
          const width = (svg as SVGSVGElement).viewBox.baseVal.width;
          return (
            plan.x >= 0 &&
            plan.x + plan.width <= width &&
            plan.y + plan.height < 32 &&
            cap.x > rule.x + rule.width &&
            cap.x + cap.width <= width
          );
        }),
      ).toBe(true);
      for (const [selector, strokeWidth, dash] of [
        ['path.l-actual', '2.5px', 'none'],
        ['path.l-forecast', '2px', '7px, 5px'],
        ['.pace-limit-line', '1px', 'none'],
      ] as const) {
        await expect(chart.locator(selector)).toHaveCSS('stroke-width', strokeWidth);
        await expect(chart.locator(selector)).toHaveCSS('stroke-dasharray', dash);
        await expect(chart.locator(selector)).toHaveCSS('animation-name', 'none');
      }
      if (url.startsWith('/?')) {
        await page
          .locator('.heute-pace')
          .screenshot({ path: info.outputPath(`pace-${theme}.png`) });
      }
      await page.screenshot({
        path: info.outputPath(`${url.startsWith('/reports') ? 'onepager' : 'heute'}-${theme}.png`),
        fullPage: true,
      });
    }
  }
  await page.goto('/plan?monat=2026-09');
  const marks = page.locator('.pbar-tick');
  await expect(marks.first()).toBeVisible();
  await expect(marks.first()).toHaveText('heute');
  expect(
    parseFloat(await marks.first().evaluate((el) => (el as HTMLElement).style.left)),
  ).toBeCloseTo((17 / 30) * 100);
  await page.screenshot({ path: info.outputPath('plan-today.png'), fullPage: true });
  await page.goto('/plan?monat=2026-08');
  await expect(marks).toHaveCount(0);
});
