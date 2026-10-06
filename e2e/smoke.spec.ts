import { expect, test } from '@playwright/test';
import { HEUTE_HEADING } from './routes';

test('GET /health answers ok and sends security headers', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok' });
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self'");
  expect(res.headers()['strict-transport-security']).toBeTruthy();
});

test('web route renders "Budget" without CSP violations', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(msg.text());
  });
  page.on('pageerror', (err) => problems.push(err.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: HEUTE_HEADING })).toBeVisible();
  await expect(page).toHaveTitle('Heute · Budget');

  await page.goto('/dev/start');
  await expect(page.getByRole('heading', { level: 1, name: 'Budget' })).toBeVisible();
  await expect(page.getByTestId('server-status')).toHaveText('Server: erreichbar');

  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      archivo: document.fonts.check("16px 'Archivo'"),
      barlow: document.fonts.check("500 16px 'Barlow Semi Condensed'"),
    };
  });
  expect(fonts).toEqual({ archivo: true, barlow: true });
  expect(problems).toEqual([]);
});

test('chart spike renders both diagrams and survives a deep-link reload', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(msg.text());
  });

  await page.goto('/dev/diagramme');
  const pace = page.getByTestId('pace-chart');
  const sankey = page.getByTestId('sankey-chart');
  await expect(pace).toBeVisible();
  await expect(sankey).toBeVisible();
  await expect(pace.locator('path.l-actual')).toHaveCount(1);
  await expect(pace.locator('path.l-plan')).toHaveCount(1);
  await expect(pace.locator('path.l-prev')).toHaveCount(1);
  // Phone width renders the flow as a staged list (UX-3c) instead of SVG rects.
  await expect(sankey.locator('rect.sk-node, li[data-chart-point]').first()).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('pace-chart')).toBeVisible();
  expect(problems).toEqual([]);
});
