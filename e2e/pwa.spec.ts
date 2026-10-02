import { expect, test } from '@playwright/test';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

test.use({ serviceWorkers: 'allow' });

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

/** Throwaway static host over a copy of the build, so a "new deploy" cannot disturb other tests. */
async function serveBuildCopy(upstream: string) {
  const dir = mkdtempSync(join(tmpdir(), 'budget-pwa-'));
  cpSync(resolve('apps/web/dist'), dir, { recursive: true });
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json',
  };
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path.startsWith('/api/') || path === '/health') {
      // Reads reach the real test server (a signed-out visitor), so the app boots normally.
      void fetch(new URL(req.url ?? path, upstream)).then(async (answer) => {
        res.writeHead(answer.status, { 'Content-Type': answer.headers.get('content-type') ?? '' });
        res.end(Buffer.from(await answer.arrayBuffer()));
      });
      return;
    }
    const file = join(dir, path === '/' ? 'index.html' : path);
    const target = file.startsWith(dir) && existsSync(file) ? file : join(dir, 'index.html');
    res.setHeader('Content-Type', types[extname(target)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(readFileSync(target));
  });
  await new Promise<void>((done) => server.listen(0, 'localhost', done));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://localhost:${port}`,
    deploy: () => {
      // A real deploy changes the content-derived version, hence the cache name.
      const file = join(dir, 'sw.js');
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace(/(const VERSION = ")[^"]*"/, '$1next-deploy"'),
      );
    },
    close: async () => {
      await new Promise((done) => server.close(done));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('a new deploy shows the update prompt and applies it only on request', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const host = await serveBuildCopy(String(baseURL));
  try {
    await page.goto(host.url);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
        timeout: 20_000,
      })
      .toBe(true);
    await expect(page.getByRole('button', { name: 'Jetzt neu laden' })).toHaveCount(0);
    host.deploy();
    // The shell checks for a newer worker when the window regains focus.
    const update = page.getByRole('button', { name: 'Jetzt neu laden' });
    await expect(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(update).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 45_000 });
    await expect(page.getByRole('region', { name: 'App aktualisieren' })).toBeVisible();
    expect(
      await page.evaluate(
        async () => (await caches.keys()).filter((k) => k.startsWith('budget-shell-')).length,
      ),
    ).toBe(2);
    const reloaded = page.waitForEvent('load');
    await update.click();
    await reloaded;
    await expect(page.getByRole('button', { name: 'Jetzt neu laden' })).toHaveCount(0);
  } finally {
    await host.close();
  }
});
