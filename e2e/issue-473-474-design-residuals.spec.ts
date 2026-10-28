import AxeBuilder from '@axe-core/playwright';
import { sampleTest, expect } from './sample';
import { test as isolatedTest } from './isolated-ledger';

sampleTest(
  'Sankey keeps Archivo values and technical labels at rendered sizes',
  async ({ page }, info) => {
    await page.goto('/reports/geldfluss?monat=2026-09');
    const chart = page.getByTestId('sankey-chart');
    await expect(chart).toBeVisible();

    if (page.viewportSize()!.width < 600) {
      const phoneValue = chart.locator('.sk-phone ul strong').first();
      const phoneLabel = chart.locator('.sk-phone > li > strong.tech').first();
      await expect(phoneValue).toBeVisible();
      await expect(phoneValue).toHaveCSS('font-family', /^(?:"|')?Archivo(?:"|')?,/);
      await expect(phoneValue).toHaveCSS('font-variant-numeric', 'tabular-nums');
      await expect(phoneLabel).toHaveCSS('font-family', /^(?:"|')?Barlow Semi Condensed(?:"|')?,/);
    } else {
      const compactValue = chart.locator('text.svg-label-strong tspan.svg-value').first();
      const tallValue = chart.locator('text.svg-label.svg-value').first();
      const technicalLabel = chart.locator('text.svg-label-strong').first();
      for (const value of [compactValue, tallValue]) {
        await expect(value).toBeVisible();
        await expect(value).toHaveCSS('font-family', /^(?:"|')?Archivo(?:"|')?,/);
        await expect(value).toHaveCSS('font-variant-numeric', 'tabular-nums');
      }
      await expect(technicalLabel).toHaveCSS(
        'font-family',
        /^(?:"|')?Barlow Semi Condensed(?:"|')?,/,
      );
    }

    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await expect(page.locator('main')).toBeVisible();
      expect(await new AxeBuilder({ page }).include('main').analyze()).toMatchObject({
        violations: [],
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (
        (info.project.name === 'desktop' && theme === 'light') ||
        (info.project.name === 'webkit-iphone' && theme === 'dark')
      ) {
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          window.scrollTo(0, 0);
        });
        await page.mouse.move(0, 0);
        await page.screenshot({
          path: info.outputPath(`issue-473-sankey-${info.project.name}-${theme}.png`),
          fullPage: true,
        });
      }
    }
  },
);

// Verify the rendered Plan suggestion affordance keeps its border geometry and keyboard/touch behavior.
isolatedTest(
  'waterfall suggestion keeps an invisible border on hover and keyboard focus',
  async ({ page, request, baseURL }, info) => {
    const send = async (method: 'POST' | 'PUT', path: string, data: unknown) => {
      const res = await request.fetch(`/api${path}`, {
        method,
        data,
        headers: { origin: baseURL! },
      });
      expect(res.ok(), await res.text()).toBe(true);
      return res.json();
    };
    await send('POST', '/accounts', {
      name: 'Testgeld',
      type: 'checking',
      openingDate: '2026-07-01',
      openingBalanceCents: 103_329,
    });
    const { group } = await send('POST', '/categories/groups', { name: 'Testvorschlag' });
    const { category } = await send('POST', '/categories', {
      name: 'Testziel',
      groupId: group.id,
      class: 'need',
      kind: 'variable',
      stage: 2,
    });
    await send('PUT', `/categories/${category.id}/target`, {
      validFrom: '2026-10',
      target: { kind: 'monthly', amountCents: 40_001 },
    });

    await page.goto('/plan/monat?monat=2026-10');
    const menu = page.locator('.plan-menu-verteilen');
    await menu.locator('summary').click();
    await menu.getByRole('button', { name: 'Wasserfall-Assistent', exact: true }).click();
    const suggestion = page.getByRole('button', { name: /Vorschlag .* für Testziel übernehmen/ });
    await expect(suggestion).toBeVisible();
    await expect(suggestion).toHaveCSS('border-top-width', '1px');
    await expect(suggestion).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    await suggestion.hover();
    await expect(suggestion).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    await page.keyboard.press('Tab');
    await suggestion.focus();
    await expect(suggestion).toBeFocused();
    await expect(suggestion).toHaveCSS('outline-width', '2px');
    if (page.viewportSize()!.width < 768)
      expect((await suggestion.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await suggestion.evaluate((element) => element.blur());
    await page.mouse.move(0, 0);
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await expect(page.locator('main')).toBeVisible();
      expect(await new AxeBuilder({ page }).include('main').analyze()).toMatchObject({
        violations: [],
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (
        (info.project.name === 'desktop' && theme === 'light') ||
        (info.project.name === 'webkit-iphone' && theme === 'dark')
      ) {
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          window.scrollTo(0, 0);
        });
        await page.mouse.move(0, 0);
        await page.screenshot({
          path: info.outputPath(`issue-474-plan-ghost-${info.project.name}-${theme}.png`),
          fullPage: true,
        });
      }
    }
  },
);
