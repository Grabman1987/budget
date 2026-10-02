import { expect, test } from '@playwright/test';

test('private API responses are not cached and a lost session returns to login', async ({
  page,
}) => {
  await page.goto('/konten');
  for (const path of ['/api/accounts', '/api/bookings']) {
    const response = await page.request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');
  }

  await page.context().clearCookies();
  const denied = await page.request.get('/api/accounts');
  expect(denied.status()).toBe(401);
  expect(denied.headers()['cache-control']).toBe('no-store');
  expect(await denied.json()).toEqual({ error: 'unauthorized' });

  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Anmelden', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mit Passkey anmelden' })).toBeVisible();

  const health = await page.request.get('/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok' });
});
