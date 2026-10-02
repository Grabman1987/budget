import { expect, test } from '@playwright/test';

test('installs a static shell, excludes private responses and reloads offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  const manifest = await cdp.send('Page.getAppManifest');
  expect(manifest.errors).toEqual([]);
  expect(JSON.parse(manifest.data ?? '{}')).toMatchObject({
    name: 'Budget',
    display: 'standalone',
    start_url: '/',
  });
  expect((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
  const health = await page.evaluate(async () => (await fetch('/health')).json());
  expect(health).toMatchObject({ status: 'ok' });
  await page.evaluate(async () => {
    await fetch('/api/auth/status');
    await fetch('/api/accounts');
  });
  const keys = await page.evaluate(async () => {
    const all = await Promise.all(
      (await caches.keys()).map(async (name) =>
        (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname),
      ),
    );
    return all.flat();
  });
  expect(keys).toContain('/index.html');
  expect(keys).toContain('/offline.html');
  expect(keys.some((path) => path.startsWith('/api') || path.startsWith('/health'))).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Budget ist offline' })).toBeVisible();
  expect(
    await page.evaluate(async () => {
      try {
        await fetch('/api/auth/status');
        return 'cached';
      } catch {
        return 'network-required';
      }
    }),
  ).toBe('network-required');
  expect(
    await page.evaluate(async () => {
      try {
        await fetch('/health');
        return 'cached';
      } catch {
        return 'network-required';
      }
    }),
  ).toBe('network-required');
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Budget ist offline' })).toHaveCount(0);
});
