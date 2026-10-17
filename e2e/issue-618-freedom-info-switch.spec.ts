import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { join } from 'node:path';
import { sampleTest as test, expect } from './sample';

const evidence = process.env['BUDGET_ISSUE618_EVIDENCE'];

async function open(page: Page) {
  await page.goto('/vermoegen/freiheit');
  await expect(page.getByTestId('freedom-chart')).toBeVisible();
}

test('one title, one back route and the explanations behind ⓘ by keyboard', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  expect(
    await page
      .getByRole('main')
      .getByRole('link', { name: /^Zurück/ })
      .count(),
  ).toBeLessThanOrEqual(1);

  for (const [name, id, text] of [
    ['Erklärung: Freiheitszahl', 'freedom-info-figure', 'Bedarf und Wunsch, ohne Zukunft'],
    ['Erklärung: Annahmen', 'freedom-info-assumptions', 'nicht gespeichert'],
  ] as const) {
    const button = page.getByRole('button', { name, exact: true });
    const box = page.locator(`#${id}`);
    await expect(box).toBeHidden();
    // Reachable by Tab alone.
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    let reached = false;
    for (let i = 0; i < 80 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await button.evaluate((el) => el === document.activeElement);
    }
    expect(reached, `${name} is reachable with Tab`).toBe(true);
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(box).toBeVisible();
    await expect(box).toContainText(text);
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(box).toBeHidden();
  }
});

test('the switch shows the same forecast numbers as chart and as table', async ({ page }) => {
  await open(page);
  const toggle = page.getByRole('switch', { name: 'Prognosewerte als Tabelle' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('freedom-table')).toHaveCount(0);

  // The table first: one row per forecast sample, then the chart's keyboard tooltip must say the same.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('freedom-chart')).toHaveCount(0);
  const cells = page.getByTestId('freedom-table').locator('tbody tr td:nth-child(2)');
  const values = (await cells.allTextContents()).map((v) => v.trim());
  expect(values.length).toBeGreaterThan(1);

  await toggle.click();
  const chart = page.getByTestId('freedom-chart');
  await expect(chart).toBeVisible();
  await expect(page.getByTestId('freedom-table')).toHaveCount(0);
  const tooltip = page.locator('.chart-tooltip[role="status"]');
  await chart.locator('..').focus();
  for (const [i, value] of values.entries()) {
    await expect(tooltip, `sample ${i}`).toContainText(value);
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.press('Escape');
});

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: no Axe violations, no horizontal scroll, 44 px touch targets`, async ({
    page,
    isMobile,
  }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await open(page);
    await page.evaluate(async (value) => {
      document.documentElement.dataset['theme'] = value;
      await document.fonts.ready;
    }, theme);
    await page.getByRole('button', { name: 'Erklärung: Annahmen', exact: true }).click();
    await page.getByRole('switch', { name: 'Prognosewerte als Tabelle' }).click();
    await expect(page.getByTestId('freedom-table')).toBeVisible();

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (isMobile) {
      for (const target of [
        page.getByRole('button', { name: /^Erklärung: / }),
        page.getByRole('switch', { name: 'Prognosewerte als Tabelle' }),
      ]) {
        for (const el of await target.all()) {
          const box = (await el.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    }
    await page.screenshot({
      path: evidence
        ? join(evidence, `freiheit-${theme}-${info.project.name}.png`)
        : info.outputPath(`freiheit-${theme}.png`),
      fullPage: true,
      animations: 'allow',
    });
  });
}
