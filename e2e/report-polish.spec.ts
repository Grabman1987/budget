import { test as isolatedTest } from './isolated-ledger';
import { expect, sampleTest } from './sample';
import { inspectReport } from './spending-helpers';

sampleTest('report heatmap cells keep readable text in both themes', async ({ page }, info) => {
  sampleTest.setTimeout(180_000);
  for (const [path, selector] of [
    ['/reports/jahresansicht', '.hc2.hc-red, .hc2.hc-green'],
    [
      '/reports/ausgaben',
      '[data-testid="template-heatmap"] td[data-heat="bad"], [data-testid="template-heatmap"] td[data-heat="good"]',
    ],
    [
      '/reports/prendite',
      '.performance-heatmap .return-positive, .performance-heatmap .return-negative',
    ],
  ]) {
    await page.goto(path!);
    if (path === '/reports/ausgaben') {
      const toggle = page.locator('section[aria-labelledby="sa-explorer"] .section-toggle');
      if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
      await page.getByRole('link', { name: 'In Auswertung öffnen', exact: true }).click();
      await expect(page.getByTestId('template-heatmap')).toBeVisible();
    }
    await expect(page.locator(selector!).first()).toBeVisible({ timeout: 30_000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => {
        document.documentElement.dataset['theme'] = t;
      }, theme);
      const contrasts = await page.locator(selector!).evaluateAll((cells) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        const luminance = (rgb: Uint8ClampedArray) =>
          [0.2126, 0.7152, 0.0722].reduce((sum, weight, i) => {
            const c = rgb[i]! / 255;
            return sum + weight * (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
          }, 0);
        return cells.map((cell) => {
          const ancestors: Element[] = [];
          for (let el: Element | null = cell; el; el = el.parentElement) ancestors.unshift(el);
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, 1, 1);
          for (const el of ancestors) {
            ctx.fillStyle = getComputedStyle(el).backgroundColor;
            ctx.fillRect(0, 0, 1, 1);
          }
          const bg = luminance(ctx.getImageData(0, 0, 1, 1).data);
          ctx.fillStyle = getComputedStyle(cell.querySelector('a,button') ?? cell).color;
          ctx.fillRect(0, 0, 1, 1);
          const ink = luminance(ctx.getImageData(0, 0, 1, 1).data);
          return (Math.max(bg, ink) + 0.05) / (Math.min(bg, ink) + 0.05);
        });
      });
      expect(Math.min(...contrasts), `${path} ${theme}`).toBeGreaterThanOrEqual(4.5);
    }
    await inspectReport(page, info, `heatmap-${path!.split('/').at(-1)}`);
  }
});

isolatedTest(
  'credit lines, account rates and stored product price history',
  async ({ page, request, baseURL }, info) => {
    isolatedTest.setTimeout(180_000);
    const post = async (path: string, data: unknown) => {
      const response = await request.post(`/api${path}`, { data, headers: { origin: baseURL! } });
      expect(response.ok()).toBe(true);
      return response.json();
    };
    for (const type of ['checking', 'credit_card']) {
      await post('/accounts', {
        name: `Muster ${type}`,
        type,
        onBudget: true,
        openingDate: '2026-01-01',
        openingBalanceCents: -100001,
        overdraftLimitCents: type === 'checking' ? 200000 : null,
        creditLimitCents: type === 'credit_card' ? 200000 : null,
      });
      await page.goto('/einstellungen/konten');
      await page.getByRole('button', { name: `Muster ${type} bearbeiten` }).click();
      const form = page.getByRole('dialog', { name: 'Konto bearbeiten', exact: true });
      await form.getByLabel('Zinssatz in Prozent').fill('12,34');
      await form.getByRole('button', { name: 'Speichern', exact: true }).click();
      await expect(form).not.toBeVisible();
      await page.reload();
      await page.getByRole('button', { name: `Muster ${type} bearbeiten` }).click();
      await expect(form.getByLabel('Zinssatz in Prozent')).toHaveValue('12,34');
      expect(
        await form
          .getByLabel('Zinssatz in Prozent')
          .evaluate((el) => el.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(44);
      await inspectReport(page, info, `rate-${type}`);
      await form.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    }
    await page.goto('/reports/kosten');
    const lines = page.getByTestId('credit-lines');
    for (const type of ['checking', 'credit_card']) {
      const row = lines.getByRole('row', { name: new RegExp(`Muster ${type}`) });
      await expect(row).toContainText('12,34 %');
      await expect(row.getByRole('cell').last()).toHaveText('10,28 €');
    }
    await inspectReport(page, info, 'credit-lines');

    const { security } = await post('/securities', {
      name: 'Muster Kursprodukt',
      kind: 'stock',
      currency: 'USD',
    });
    for (const [date, price] of [
      ['2024-10-02', '0.5'],
      ['2025-10-02', '1'],
      ['2026-04-02', '2'],
      ['2026-09-02', '3'],
      ['2026-10-02', '4.123456'],
    ]) {
      const response = await request.put(`/api/securities/${security.id}/prices/${date}`, {
        data: { price },
        headers: { origin: baseURL! },
      });
      expect(response.ok()).toBe(true);
    }
    await page.goto(`/vermoegen/portfolio/instrument/${security.id}`);
    await page.getByRole('button', { name: 'Kurs', exact: true }).click();
    const chart = page.getByTestId('price-history-chart');
    await expect(chart).toBeVisible();
    for (const [range, count] of [
      ['1M', 2],
      ['6M', 3],
      ['1J', 4],
      ['Max', 5],
    ] as const) {
      const chip = page
        .getByRole('group', { name: 'Zeitraum des Instrumentverlaufs' })
        .getByRole('button', { name: range, exact: true });
      await chip.click();
      await expect(chip).toHaveAttribute('aria-pressed', 'true');
      expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(chart.locator('[data-chart-point]')).toHaveCount(count);
    }
    // The 1.5-unit dot is smaller than a pixel on a phone, so the chart overlay takes the pointer; it selects the nearest point.
    await chart.locator('[data-chart-point]').last().hover({ force: true });
    await expect(page.locator('.chart-tooltip')).toContainText('4,123456 USD');
    await expect(page.locator('.chart-tooltip')).toContainText('02.10.2026');
    await chart.locator('..').focus();
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.chart-tooltip')).toContainText('02.10.2025');
    await inspectReport(page, info, 'price-history');
    await page.getByRole('link', { name: 'Zurück zum Portfolio' }).click();
    await expect(page).toHaveURL(/\/vermoegen\/portfolio\/positionen$/);
  },
);
