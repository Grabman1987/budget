/** Local/CI smoke only: real builds, disposable ledger, no hosted environment or integrations. */
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { chromium, expect, request, type Page } from '@playwright/test';
import { bootstrapPasskey } from '../../e2e/bootstrap';
import { E2E_SETUP_TOKEN } from '../../e2e/setup-token';
import type { Heute } from '../../apps/web/src/heute/api';

const root = resolve(import.meta.dirname, '../..');
const directory = mkdtempSync(join(tmpdir(), 'budget-redesign-smoke-'));
if (!resolve(directory).startsWith(resolve(tmpdir()) + sep))
  throw new Error('Unsafe smoke directory');
const active = join(directory, 'web');
const builds = { off: join(directory, 'off'), on: join(directory, 'on') };
const bookmark = '/konten/pruefen?von=%2Fkonten';

function build(mode: 'off' | 'on') {
  console.log(`Building redesign ${mode.toUpperCase()} (production frontend)`);
  execFileSync(
    process.execPath,
    [
      resolve(root, 'node_modules/vite/bin/vite.js'),
      'build',
      '--mode',
      'production',
      '--outDir',
      builds[mode],
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

async function savedHeute(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((done, fail) => {
      const open = indexedDB.open('budget-offline-views');
      open.onsuccess = () => done(open.result);
      open.onerror = () => fail(open.error);
    });
    try {
      return await new Promise<
        { key: string; fetchedAt: number; epoch: string; data: Heute } | undefined
      >((done, fail) => {
        const get = db.transaction('views', 'readonly').objectStore('views').get('heute');
        get.onsuccess = () => done(get.result);
        get.onerror = () => fail(get.error);
      });
    } finally {
      db.close();
    }
  });
}

async function forecastScreenshots(page: Page, state: 'online' | 'offline') {
  const output = join(root, 'test-results/redesign-forecast');
  mkdirSync(output, { recursive: true });
  const previousTheme = await page.locator('html').getAttribute('data-theme');
  try {
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate(async (value) => {
        document.documentElement.dataset['theme'] = value;
        await document.fonts.ready;
      }, theme);
      await page.getByRole('region', { name: 'Kontoprognose · 35 Tage', exact: true }).screenshot({
        path: join(output, `forecast-${page.viewportSize()!.width}-${state}-${theme}.png`),
        animations: 'disabled',
      });
    }
  } finally {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate((value) => {
      if (value === null) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.dataset['theme'] = value;
    }, previousTheme);
  }
}

/** Same real response and existing permission epoch, not a second offline forecast. */
async function forecastParity(page: Page, origin: string) {
  const groups: string[] = [];
  const headers = { origin };
  const post = async <T extends { groupId: string }>(path: string, data: unknown): Promise<T> => {
    const response = await page.request.post(`${origin}/api${path}`, { headers, data });
    expect(response.ok()).toBe(true);
    const result = (await response.json()) as T;
    groups.push(result.groupId);
    return result;
  };
  try {
    const { account } = await post<{ groupId: string; account: { id: string } }>('/accounts', {
      name: 'Synthetic T2 budget',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-09-17',
      openingBalanceCents: 100_000,
    });
    for (const [name, kind, date, dueDay, amountCents] of [
      ['Synthetic day10 outflow', 'outflow', '2026-09-27', 27, 12_500],
      ['Synthetic day20 salary', 'inflow', '2026-10-07', 7, 9_000],
    ] as const)
      await post('/expected', {
        name,
        kind,
        accountId: account.id,
        rhythm: 'monthly',
        startDate: date,
        endDate: date,
        validFrom: '2026-09-17',
        dueDay,
        dateShift: 'none',
        amountCents,
        ...(kind === 'inflow' ? { incomeTypeId: 'income-salary' } : {}),
      });
    await post('/liquidity/events', {
      name: 'Synthetic day35 event',
      date: '2026-10-22',
      amountCents: -100_000,
    });
    const response = await page.request.get(`${origin}/api/heute?period=month&month=2026-09`);
    expect(response.ok()).toBe(true);
    const source = (await response.json()) as Heute;
    expect(source.forecast35d).toMatchObject({
      asOf: '2026-09-17',
      horizon: '35d',
      levers: [],
      available: true,
      report: { low: { day: '2026-10-22', index: 35, cents: -3_500 } },
    });
    expect(source.forecast35d).not.toHaveProperty('events');
    expect(source.forecast35d).not.toHaveProperty('incomePauses');
    expect(source.forecast35d).not.toHaveProperty('report.verdict');
    expect(source.forecast35d).not.toHaveProperty('report.movements');
    await page.clock.setFixedTime(new Date('2026-09-17T08:30:00+02:00'));
    await page.goto(`${origin}/?monat=2026-09&period=month`);
    const live = page.getByRole('region', { name: 'Kontoprognose · 35 Tage', exact: true });
    await expect(live.locator('.heute-forecast-low')).toHaveAttribute('data-cents', '-3500');
    await expect(live.locator('.heute-forecast-low')).toHaveAttribute('data-day', '2026-10-22');
    await expect(live.getByTestId('liquidity-lowpoint')).toHaveAttribute('data-cents', '-3500');
    await expect(live).toContainText('17.09.2026');
    // Permission is granted by the unchanged authenticated app, never by the smoke.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('budget-offline-read-epoch')))
      .not.toBeNull();
    await expect
      .poll(async () => (await savedHeute(page))?.data.forecast35d)
      .toEqual(source.forecast35d);
    const saved = (await savedHeute(page))!;
    expect(new URL(saved.key, origin).searchParams.get('month')).toBe('2026-09');
    expect(new URL(saved.key, origin).searchParams.get('period')).toBe('month');
    expect(saved.fetchedAt).toBe(Date.parse('2026-09-17T08:30:00+02:00'));
    expect(saved.epoch).toBeTruthy();
    await forecastScreenshots(page, 'online');
    await page.context().setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Budget ist offline' })).toBeVisible();
    const offline = page.getByRole('region', { name: 'Kontoprognose · 35 Tage', exact: true });
    await expect(offline).toContainText('−35,00');
    await expect(offline).toContainText('22.10.2026');
    await expect(offline).toContainText('17.09.2026');
    await expect(
      offline
        .getByRole('list', { name: 'Gespeicherte 35-Tage-Kontoprognose' })
        .getByRole('listitem'),
    ).toHaveCount(36);
    expect((await savedHeute(page))?.fetchedAt).toBe(saved.fetchedAt);
    await forecastScreenshots(page, 'offline');
    await page.context().setOffline(false);
    await page.reload();
    await expect(live.locator('.heute-forecast-low')).toHaveAttribute('data-cents', '-3500');
    console.log(
      'PASS T2: literal day35 low, response-owned IndexedDB source, offline reload and reconnection',
    );
  } finally {
    await page.context().setOffline(false);
    // Only this smoke's fixture groups; do not sign out the shared bootstrap session.
    for (const groupId of groups.reverse()) {
      const response = await page.request.post(`${origin}/api/undo`, {
        headers,
        data: { groupId },
      });
      expect(response.ok()).toBe(true);
    }
    await page.goto(`${origin}${bookmark}`);
  }
}

async function smoke() {
  build('off');
  build('on');
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
          await forecastParity(page, origin);
          await upgrade(page, origin, false);
          // The clean bookmark remains usable after a complete OFF → ON → OFF installed-PWA cycle.
          await page.goto(`${origin}${bookmark}`);
          await expectBody(page, origin, false);
          console.log(
            `PASS ${viewport.width}px: OFF overrides denied, real ON/OFF upgrade, session and bookmark retained`,
          );
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
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
