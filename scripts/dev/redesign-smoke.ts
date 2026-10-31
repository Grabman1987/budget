/** Local/CI smoke only: real builds, disposable ledger, no hosted environment or integrations. */
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { chromium, expect, request, webkit, type Page } from '@playwright/test';
import { bootstrapPasskey } from '../../e2e/bootstrap';
import { E2E_SETUP_TOKEN } from '../../e2e/setup-token';
import { verifyRedesignGallery, verifyRedesignGalleryPhone } from './redesign-s2-proof';

const root = resolve(import.meta.dirname, '../..');
const directory = mkdtempSync(join(tmpdir(), 'budget-redesign-smoke-'));
if (!resolve(directory).startsWith(resolve(tmpdir()) + sep))
  throw new Error('Unsafe smoke directory');
const active = join(directory, 'web');
const builds = { off: join(directory, 'off'), on: join(directory, 'on') };
const galleryBuilds = { off: join(directory, 'gallery-off'), on: join(directory, 'gallery-on') };
const galleryOutput = join(root, 'test-results/redesign-s2');
const bookmark = '/konten/pruefen?von=%2Fkonten';

function build(
  mode: 'off' | 'on',
  output = builds[mode],
  buildMode: 'production' | 'e2e' = 'production',
) {
  console.log(`Building redesign ${mode.toUpperCase()} (${buildMode} frontend)`);
  execFileSync(
    process.execPath,
    [
      resolve(root, 'node_modules/vite/bin/vite.js'),
      'build',
      '--mode',
      buildMode,
      '--outDir',
      output,
      '--logLevel',
      'warn',
    ],
    {
      cwd: join(root, 'apps/web'),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        VITE_BUDGET_REDESIGN: mode === 'on' ? '1' : '0',
        VITE_BUDGET_PREVIEW: mode === 'on' ? '1' : '0',
      },
      stdio: 'inherit',
    },
  );
}

async function freePort() {
  const reservation = createServer();
  await new Promise<void>((done, fail) => {
    reservation.once('error', fail);
    reservation.listen(0, 'localhost', done);
  });
  const address = reservation.address();
  if (!address || typeof address === 'string') throw new Error('Missing smoke port');
  await new Promise<void>((done, fail) =>
    reservation.close((error) => (error ? fail(error) : done())),
  );
  return address.port;
}

async function expectBody(page: Page, origin: string, enabled: boolean) {
  await expect(page).toHaveURL(
    (url) =>
      url.origin === origin &&
      url.pathname === '/konten/pruefen' &&
      url.searchParams.get('von') === '/konten',
  );
  await expect(page.locator('.app')).toBeVisible();
  if (enabled) await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
  else await expect(page.locator('.app')).not.toHaveAttribute('data-budget-redesign');
  await expect(
    page.getByRole('heading', { name: 'Offene Entscheidungen', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Zeitraum der Aufgaben' })).toHaveValue('all');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page).toHaveTitle(/ · Budget$/);
  const preview = page.getByRole('complementary', { name: 'Vorschauumgebung' });
  if (enabled) await expect(preview).toContainText('Synthetische Beispieldaten');
  else await expect(preview).toHaveCount(0);
  const auth = await page.request.get(`${origin}/api/auth/status`);
  expect(auth.ok()).toBe(true);
  expect(await auth.json()).toMatchObject({ authenticated: true });
}

async function upgrade(page: Page, origin: string, enabled: boolean) {
  const oldAsset = await page.locator('script[type="module"]').getAttribute('src');
  expect(oldAsset).toMatch(/^\/assets\/.*\.js$/);
  // Merge, do not replace: already-open tabs still need their old content-addressed chunks.
  cpSync(builds[enabled ? 'on' : 'off'], active, { recursive: true });
  const oldResponse = await page.request.get(`${origin}${oldAsset}`);
  expect(oldResponse.ok()).toBe(true);
  expect(oldResponse.headers()['content-type']).toMatch(/javascript/);
  const update = page.getByRole('button', { name: 'Jetzt neu laden' });
  await expect(async () => {
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
    await expect(update).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 45_000 });
  // A waiting worker must leave the current shell/session/bookmark intact until explicit consent.
  await expectBody(page, origin, !enabled);
  const reloaded = page.waitForEvent('domcontentloaded');
  await update.click();
  await reloaded;
  await expectBody(page, origin, enabled);
  await expect(update).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
}

async function expectAppHosts(page: Page, origin: string, enabled: boolean) {
  const previousTheme = await page.locator('html').getAttribute('data-theme');
  try {
    for (const theme of ['light', 'dark'] as const) {
      await page.goto(`${origin}${bookmark}&panel=anlageklasse`);
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      const expected = {
        rule: enabled
          ? theme === 'light'
            ? '#d3deec'
            : '#1f4d7c'
          : theme === 'light'
            ? '#d6dfed'
            : '#25557a',
        warning: enabled ? (theme === 'light' ? '#8a5300' : '#ffd37a') : '',
      };
      for (const target of [page.locator('body'), page.locator('.app'), dialog]) {
        const roles = await target.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            rule: style.getPropertyValue('--rule').trim(),
            warning: style.getPropertyValue('--warning').trim(),
          };
        });
        expect(roles).toEqual(expected);
      }
      if (page.viewportSize()!.width === 390) {
        const tabbar = page.locator('.tabbar');
        await expect(tabbar).toBeVisible();
        expect(
          await tabbar.evaluate((element) =>
            getComputedStyle(element).getPropertyValue('--rule').trim(),
          ),
        ).toBe(expected.rule);
      }
      await page.evaluate(async () => document.fonts.ready);
      await page.screenshot({
        path: join(
          galleryOutput,
          `app-panel-${enabled ? 'on' : 'off'}-${theme}-${page.viewportSize()!.width}.png`,
        ),
        animations: 'disabled',
      });
      if (enabled) {
        await page.emulateMedia({ media: 'print', colorScheme: theme });
        expect(
          await page.locator('body').evaluate((element) => {
            const style = getComputedStyle(element);
            return ['rule', 'rule-strong', 'warning', 'warning-soft'].map((role) =>
              style.getPropertyValue(`--${role}`).trim(),
            );
          }),
        ).toEqual(['#d3deec', '#6786ac', '#8a5300', '#fff3d6']);
        await page.emulateMedia({ media: 'screen', colorScheme: theme });
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
  } finally {
    await page.emulateMedia({ media: 'screen', colorScheme: 'light' });
    await page.goto(`${origin}${bookmark}`);
    await page.evaluate((value) => {
      if (value === null) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.dataset['theme'] = value;
    }, previousTheme);
  }
  await expectBody(page, origin, enabled);
}

async function smoke() {
  build('off');
  build('on');
  // CI builds this OFF artifact immediately before Visual/smoke. Local callers must do likewise.
  const currentE2E = join(root, 'apps/web/dist');
  if (!existsSync(join(currentE2E, 'index.html')))
    throw new Error('Build the current OFF e2e artifact before running the redesign smoke.');
  cpSync(currentE2E, galleryBuilds.off, { recursive: true });
  build('on', galleryBuilds.on, 'e2e');
  mkdirSync(galleryOutput, { recursive: true });
  cpSync(builds.off, active, { recursive: true });
  const origin = `http://localhost:${await freePort()}`;
  const revision = randomBytes(20).toString('hex');
  const storage = join(directory, 'session.json');
  const server = spawn(process.execPath, [join(root, 'apps/server/dist/index.js')], {
    cwd: root,
    stdio: 'ignore',
    env: {
      PATH: process.env['PATH'],
      NODE_ENV: 'test',
      PORT: new URL(origin).port,
      DATA_DIR: directory,
      WEB_DIR: active,
      DATABASE_PATH: join(directory, 'synthetic.sqlite'),
      BUDGET_ORIGIN: origin,
      BUDGET_BUILD_REVISION: revision,
      BUDGET_SETUP_TOKEN: E2E_SETUP_TOKEN,
      BUDGET_TODAY: '2026-09-17',
      BUDGET_REPLICATE: '0',
      BUDGET_MARKET_SOURCES: 'fixture',
      BUDGET_MARKET_DAILY: '0',
      BUDGET_BANK_SYNC_DAILY: '0',
      ENABLE_BANKING_APP_ID: '',
      DROPBOX_PAYSLIP_ROOT: '',
      PAYSLIP_PDF_PASSWORD: 'synthetic-smoke-password',
    },
  });
  let spawnError: Error | undefined;
  server.once('error', (error) => (spawnError = error));
  try {
    await expect
      .poll(
        async () => {
          if (spawnError) throw spawnError;
          if (server.exitCode !== null) throw new Error(`Smoke server exited (${server.exitCode})`);
          return fetch(`${origin}/health`)
            .then((response) => response.json())
            .catch(() => null);
        },
        { timeout: 30_000 },
      )
      .toEqual({ status: 'ok', revision });
    const api = await request.newContext({ baseURL: origin });
    try {
      await bootstrapPasskey(api, origin, storage);
    } finally {
      await api.dispose();
    }
    const browser = await chromium.launch();
    try {
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
      ]) {
        cpSync(builds.off, active, { recursive: true });
        const context = await browser.newContext({
          storageState: storage,
          viewport,
          isMobile: viewport.width === 390,
          hasTouch: viewport.width === 390,
          colorScheme: 'light',
          reducedMotion: 'reduce',
          serviceWorkers: 'allow',
        });
        try {
          await context.addInitScript(() => {
            localStorage.setItem('budget-redesign', '1');
            localStorage.setItem('VITE_BUDGET_REDESIGN', '1');
          });
          const page = await context.newPage();
          await page.goto(`${origin}${bookmark}&redesign=1&VITE_BUDGET_REDESIGN=1`);
          await expectBody(page, origin, false);
          await page.goto(`${origin}${bookmark}`);
          await expectBody(page, origin, false);
          await page.evaluate(async () => navigator.serviceWorker.ready);
          await expect
            .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
            .toBe(true);
          await upgrade(page, origin, true);
          await expectAppHosts(page, origin, true);
          await upgrade(page, origin, false);
          // The clean bookmark remains usable after a complete OFF → ON → OFF installed-PWA cycle.
          await page.goto(`${origin}${bookmark}`);
          await expectBody(page, origin, false);
          await expectAppHosts(page, origin, false);
          console.log(
            `PASS ${viewport.width}px: OFF overrides denied, real ON/OFF upgrade, session and bookmark retained`,
          );
        } finally {
          await context.close();
        }
      }
      for (const mode of ['off', 'on'] as const) {
        cpSync(galleryBuilds[mode], active, { recursive: true });
        await verifyRedesignGallery(browser, {
          origin,
          storageState: storage,
          mode,
          outputDir: galleryOutput,
        });
      }
    } finally {
      await browser.close();
    }
    console.log('Starting WebKit gallery after Chromium cleanup');
    const phoneBrowser = await webkit.launch();
    try {
      for (const mode of ['off', 'on'] as const) {
        cpSync(galleryBuilds[mode], active, { recursive: true });
        await verifyRedesignGalleryPhone(phoneBrowser, {
          origin,
          storageState: storage,
          mode,
          outputDir: galleryOutput,
        });
      }
    } finally {
      await phoneBrowser.close();
    }
  } finally {
    if (server.exitCode === null && server.signalCode === null && !spawnError) {
      await new Promise<void>((done) => {
        server.once('exit', () => done());
        server.kill('SIGTERM');
      });
    }
  }
}

try {
  await smoke();
} finally {
  rmSync(directory, { recursive: true, force: true });
}
