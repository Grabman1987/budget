import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('553 answer template preserves literal cents, metric direction, missing prior and privacy', async ({
  page,
}, info) => {
  await page.goto('/dev/report-answer');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    await page.getByRole('button', { name: 'Ausgaben', exact: true }).click();
    const answer = page.getByTestId('report-answer');
    const lead = page.getByTestId('report-answer-lead');
    const chip = page.locator('.report-answer-chip');
    await expect(lead).toHaveText('2.130,00 €');
    await expect(answer).toHaveText(
      'Du hast 2.130,00 € netto ausgegeben, 300,00 € mehr als im gleich langen Vorzeitraum. Den größten Anstieg gab es bei Lebensmittel: +120,00 €.',
    );
    await expect(chip).toHaveClass(/is-unfavourable/);
    expect(await chip.evaluate((node) => getComputedStyle(node).color)).toBe(
      await chip.evaluate((node) => {
        const marker = document.createElement('span');
        marker.style.color = 'var(--minus-ink)';
        node.append(marker);
        const color = getComputedStyle(marker).color;
        marker.remove();
        return color;
      }),
    );
    const chart = page.getByTestId('answer-example-chart');
    await expect(chart).toHaveAttribute('aria-label', 'Ausgaben: 2.130,00 €');
    await page.locator('.chart-data-table > summary').click();
    await expect(page.locator('.chart-data-value')).toHaveText([
      '1.220,00 €',
      '710,00 €',
      '200,00 €',
    ]);
    // Independent fixture arithmetic: 122000 + 71000 + 20000 = 213000 cents.
    expect(122000 + 71000 + 20000).toBe(213000);
    await page.getByRole('button', { name: 'Einnahmen', exact: true }).click();
    await expect(answer).toContainText('2.130,00 € eingenommen, 300,00 € mehr');
    await expect(chip).toHaveClass(/is-favourable/);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Beträge verbergen', exact: true }).click();
    await expect(lead).toHaveText('••• €');
    await expect(answer).not.toContainText('2.130');
    await expect(answer).not.toContainText('300,00');
    await expect(answer).not.toContainText('120,00');
    await expect(chip).toHaveText('Vorzeitraum ••• € · ••• €');
    await expect(chart).toHaveAttribute('aria-label', 'Einnahmen: ••• €');
    await expect(page.locator('.chart-data-value')).toHaveText(['•••', '•••', '•••']);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Beträge zeigen', exact: true }).click();
    await expect(lead).toHaveText('2.130,00 €');
    await page.getByRole('button', { name: 'Vorzeitraum ausblenden', exact: true }).click();
    await expect(answer).toHaveCount(0);
    await expect(chip).toHaveCount(0);
    await expect(lead).toHaveText('2.130,00 €');
    await expect(chart).toBeVisible();
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (info.project.name !== 'desktop') {
      for (const control of await page.locator('main button, main summary').all()) {
        const box = (await control.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.screenshot({ path: info.outputPath(`report-answer-${theme}.png`), fullPage: false });
    await page.getByRole('button', { name: 'Vorzeitraum zeigen', exact: true }).click();
    await page.locator('.chart-data-table > summary').click();
  }
});
