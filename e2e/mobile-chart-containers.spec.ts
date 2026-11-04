import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';

test.describe('UX-3c phone chart and table containers', () => {
  test.skip(({ isMobile }) => !isMobile, '390 px phone project');
  test.setTimeout(90_000);

  for (const [path, ready] of [
    ['/reports/liquiditaet', '[data-testid="liq-outlook"]'],
    ['/reports/geldfluss', '[data-testid="flow-list"]'],
    [
      '/plan/jahr?monat=2026-09',
      '.plan-v2-page .year-table tbody:has(.year-group) tr:not(.year-group), .year-phone-row',
    ],
    ['/vermoegen/portfolio/allokation', '.vallo .va-track'],
  ]) {
    test(`${path} stays inside the phone in both themes`, async ({ page }, info) => {
      await page.goto(path!);
      if (path!.startsWith('/plan/jahr')) {
        const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
        const group = page
          .locator(on ? '.year-table .year-group button' : '.year-phone-summary')
          .first();
        await expect(group).toHaveAttribute('aria-expanded', on ? 'true' : 'false');
        if (on) {
          await group.click();
          await expect(group).toHaveAttribute('aria-expanded', 'false');
        }
        await group.click();
        await expect(group).toHaveAttribute('aria-expanded', 'true');
      }
      await expect(page.locator(ready!).first()).toBeVisible({ timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready);
      for (const theme of ['light', 'dark']) {
        await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
        await page.screenshot({ fullPage: true, path: info.outputPath(`${theme}.png`) });
      }
    });
  }

  test('liquidity tables expose amounts by local scrolling and keep the first column', async ({
    page,
  }) => {
    await page.goto('/reports/liquiditaet');
    const table = page.getByTestId('liq-outlook');
    await expect(table).toBeVisible({ timeout: 30_000 });
    const region = table.locator('..');
    await expect(region.getByText('Seitlich wischen für weitere Spalten')).toBeVisible();
    const first = table.locator('tbody tr').first().locator('td').first();
    const before = (await first.boundingBox())!.x;
    await region.evaluate((el) => (el.scrollLeft = el.scrollWidth));
    expect((await first.boundingBox())!.x).toBeCloseTo(before, 0);
    const last = (await table.locator('thead th').last().boundingBox())!;
    expect(last.x + last.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test('flow has a phone diagram with readable values, no horizontal chart scroll', async ({
    page,
  }) => {
    await page.goto('/reports/geldfluss?monat=2026-09');
    await expect(page.getByTestId('flow-list')).toBeVisible();
    const chart = page.locator('.mr-sankey');
    expect(await chart.evaluate((el) => el.scrollWidth <= el.parentElement!.clientWidth)).toBe(
      true,
    );
    await expect(page.getByRole('list', { name: 'Geldfluss nach Stufen' })).toBeVisible();
    const month = page.getByTestId('report-month');
    expect(
      await month.evaluate(
        (el) => el.scrollHeight <= parseFloat(getComputedStyle(el).lineHeight) + 1,
      ),
    ).toBe(true);
  });

  test('liquidity axis labels never overlap for any horizon and the title is complete', async ({
    page,
  }) => {
    await page.goto('/reports/liquiditaet');
    const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
    const title = on
      ? page.getByLabel('Planansicht wählen: Prognose', { exact: true })
      : page.locator('.m-title-text');
    expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    for (const [value, horizon] of [
      ['90d', '90 Tage'],
      ['6m', '6 Monate'],
      ['12m', '12 Monate'],
    ]) {
      if (on) await page.getByRole('combobox', { name: 'Prognosezeitraum' }).selectOption(value!);
      else await page.getByRole('button', { name: horizon, exact: true }).click();
      const chart = page.getByTestId('liquidity-chart');
      await expect(chart).toBeVisible();
      const labels = await chart
        .locator(on ? 'text[y="212"]' : 'text[y="252"]')
        .evaluateAll((elements) =>
          elements.map((el) => {
            const b = el.getBoundingClientRect();
            return { left: b.left, right: b.right };
          }),
        );
      expect(labels.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < labels.length; i++)
        expect(labels[i]!.left).toBeGreaterThan(labels[i - 1]!.right + 4);
    }
  });

  test('portfolio tracks fill the whole row below name and values', async ({ page }) => {
    await page.goto('/vermoegen/portfolio/allokation');
    const track = page.locator('.vallo .va-track').first();
    await expect(track).toBeVisible({ timeout: 30_000 });
    const row = (await page.locator('.vallo li').first().boundingBox())!;
    const bar = (await track.boundingBox())!;
    expect(bar.width).toBeGreaterThanOrEqual(row.width - 2);
    expect(bar.height).toBe(16);
  });

  test('Jahresansicht exposes its final average column without page scrolling', async ({
    page,
  }) => {
    await page.goto('/reports/jahresansicht?monat=2026-09');
    const region = page.getByRole('region', {
      name: 'Jahresansicht, bei Bedarf horizontal verschiebbar',
      exact: true,
    });
    await expect(region).toBeVisible({ timeout: 30_000 });
    await region.focus();
    await expect(region).toBeFocused();
    await region.evaluate((el) => (el.scrollLeft = el.scrollWidth));
    const last = (await region
      .getByRole('columnheader', { name: 'Ø Monat', exact: true })
      .boundingBox())!;
    expect(last.x + last.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
});
