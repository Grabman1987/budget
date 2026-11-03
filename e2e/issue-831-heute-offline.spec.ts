import { sampleTest as test, expect } from './sample';

test('Heute explanation follows existing offline permissions and resumes the same context without writes', async ({
  page,
  context,
}) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname.startsWith('/api/') &&
      !['GET', 'HEAD'].includes(request.method())
    )
      writes.push(request.method() + ' ' + new URL(request.url()).pathname);
  });
  await page.goto('/?monat=2026-08&period=payday');
  await expect(page.getByTestId('heute-wealth-history')).toBeVisible();
  const redesign = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  if (redesign) {
    await expect(page.getByTestId('heute-lead-value')).toBeVisible();
    await page.locator('a.hv-lead-value').click();
    await expect(
      page.getByRole('heading', { name: 'Frei bis Gehalt · Herleitung', exact: true }),
    ).toBeVisible();
  }
  const href = page.url();
  try {
    await context.setOffline(true);
    await expect(
      page.getByRole('heading', { name: 'Budget ist offline', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.pwa-live')).toBeHidden();
    await expect(page.locator('.pwa-live')).toHaveAttribute('inert', '');
    await expect(page.locator('.pwa-offline a[href*="/envelope/"]')).toHaveCount(0);
    expect(page.url()).toBe(href);
    expect(writes).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
  await expect(page.locator('.pwa-live')).toBeVisible();
  expect(page.url()).toBe(href);
  if (redesign)
    await expect(
      page.getByRole('heading', { name: 'Frei bis Gehalt · Herleitung', exact: true }),
    ).toBeVisible();
  expect(writes).toEqual([]);
});
