import AxeBuilder from '@axe-core/playwright';
import { expect, sampleTest as test } from './sample';

test('V1 wealth answers, disclosures and accessible desktop/phone layouts', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await page.goto('/vermoegen/portfolio');
  await expect(page.getByTestId('portfolio-return')).toContainText('zeitgewichtet');
  await expect(page.getByTestId('portfolio-overview-chart')).toBeVisible();
  await expect(page.getByTestId('portfolio-gain')).toContainText('€');
  if (info.project.name === 'desktop') {
    const chart = await page.getByTestId('portfolio-overview-chart').boundingBox();
    expect(chart!.y + chart!.height).toBeLessThan(page.viewportSize()!.height);
  }
  const instrument = await page
    .locator('[data-portfolio-security]')
    .first()
    .getAttribute('data-portfolio-security');
  const savings = await page
    .locator('[data-savings-plan]:not([data-savings-plan="neu"])')
    .first()
    .getAttribute('data-savings-plan');
  const routes = [
    ['portfolio', '/vermoegen/portfolio'],
    ['debts', '/vermoegen/schulden'],
    ['freedom', '/vermoegen/freiheit'],
    ['instrument', `/vermoegen/portfolio/instrument/${instrument}`],
    ['savings', `/vermoegen/portfolio/sparplan/${savings}`],
  ];
  for (const [name, route] of routes) {
    await page.goto(route!);
    await expect(page.locator('main')).toBeVisible();
    if (name === 'portfolio')
      await expect(page.getByTestId('portfolio-overview-chart')).toBeVisible();
    if (name === 'debts') {
      await expect(page.getByTestId('debt-total')).toBeVisible();
      await expect(page.getByTestId('debt-history-chart')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Schuldenfrei am …' })).toHaveCount(0);
      await expect(page.locator('.debt-quick-scenario')).toBeHidden();
      await page.getByRole('link', { name: 'Konditionen ergänzen' }).click();
      await expect(page.locator('#debt-adjustments')).toHaveAttribute('open', '');
      await page.locator('#debt-adjustments > summary').click();
    }
    if (name === 'freedom') {
      await expect(page.getByLabel('Sparrate pro Monat', { exact: true })).not.toHaveValue('');
      await expect(page.getByTestId('freedom-chart')).toBeVisible();
      await expect(page.locator('#freedom-expenses')).not.toHaveAttribute('open', '');
    }
    if (name === 'instrument') {
      await expect(page.getByRole('table', { name: /Handel je Datum/ })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Zeitraum', exact: true })).toHaveCount(0);
    }
    if (name === 'savings') {
      await expect(page.getByTestId('savings-next')).toBeVisible();
      await expect(page.getByTestId('savings-paid')).toBeVisible();
      await expect(page.locator('.savings-versions')).not.toHaveAttribute('open', '');
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => {
        document.documentElement.dataset['theme'] = t;
      }, theme);
      await page.evaluate(() => document.fonts.ready);
      if (name === 'portfolio' || name === 'debts') {
        const labels = page.getByTestId(
          name === 'portfolio' ? 'portfolio-overview-chart' : 'debt-history-chart',
        );
        const colors = await labels.locator('text').evaluateAll((nodes) => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--ink-3)';
          document.body.append(probe);
          const expected = getComputedStyle(probe).color;
          probe.remove();
          return { expected, actual: nodes.map((node) => getComputedStyle(node).fill) };
        });
        expect(colors.actual).toHaveLength(2);
        expect(colors.actual).toEqual([colors.expected, colors.expected]);
      }
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
      if (info.project.name !== 'desktop') {
        const small = await page.locator('main').evaluate((main) =>
          Array.from(main.querySelectorAll('button, summary, input, select, a'))
            .filter((el) => {
              const rect = el.getBoundingClientRect();
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                getComputedStyle(el).visibility !== 'hidden' &&
                (rect.height < 44 || rect.width < 44)
              );
            })
            .map((el) => ({
              text: el.textContent?.trim().slice(0, 50),
              height: el.getBoundingClientRect().height,
            })),
        );
        expect(small).toEqual([]);
      }
      if (
        (info.project.name === 'desktop' && theme === 'light') ||
        (info.project.name === 'webkit-iphone' && theme === 'dark')
      ) {
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: `docs/evidence/ux-v1-vermoegen/${name}-${info.project.name}-${theme}.jpg`,
          fullPage: true,
          type: 'jpeg',
          quality: 75,
        });
      }
    }
  }
});
