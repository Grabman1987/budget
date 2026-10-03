import { test as base, type APIRequestContext } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { E2E_SETUP_TOKEN } from '../playwright.config';
import { bootstrapPasskey } from './bootstrap';

/** The day every isolated ledger runs on; the browser clock is pinned to it as well (see `page`). */
const LEDGER_TODAY = '2026-10-02';
const LEDGER_NOW = `${LEDGER_TODAY}T12:00:00+02:00`;

type IsolatedLedger = { origin: string; storageState: string };
const pause = (milliseconds: number) => new Promise((done) => setTimeout(done, milliseconds));

/** A real, empty ledger per attempt: global valuation must not see another test's holdings. */
export const test = base.extend<{ isolatedLedger: IsolatedLedger }>({
  isolatedLedger: async ({ playwright }, use, info) => {
    const port = Number(process.env['E2E_PORT'] ?? 4310) + 20 + info.parallelIndex;
    // Refuse an occupied port before starting or sending bootstrap credentials anywhere.
    await new Promise<void>((done, fail) => {
      const reservation = createServer();
      reservation.once('error', () => fail(new Error('Isolated ledger port is unavailable')));
      reservation.listen(port, '0.0.0.0', () => reservation.close(() => done()));
    });
    const directory = mkdtempSync(join(tmpdir(), 'budget-e2e-ledger-'));
    const origin = `http://localhost:${port}`;
    const storageState = join(directory, 'session.json');
    const server = spawn(process.execPath, ['apps/server/dist/index.js'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      env: {
        PATH: process.env['PATH'],
        NODE_ENV: 'test',
        PORT: String(port),
        WEB_DIR: resolve('apps/web/dist'),
        DATABASE_PATH: join(directory, 'ledger.sqlite'),
        BUDGET_ORIGIN: origin,
        BUDGET_SETUP_TOKEN: E2E_SETUP_TOKEN,
        BUDGET_TODAY: LEDGER_TODAY,
      },
    });
    let stopped = false;
    let spawnFailed = false;
    const exited = new Promise<void>((done) => {
      server.once('exit', () => {
        stopped = true;
        done();
      });
      server.once('error', () => {
        spawnFailed = stopped = true;
        done();
      });
    });
    const cleanup = async () => {
      if (!stopped) {
        server.kill('SIGTERM');
        await Promise.race([exited, pause(3_000)]);
      }
      if (!stopped) {
        server.kill('SIGKILL');
        await Promise.race([exited, pause(3_000)]);
      }
      if (!stopped) throw new Error('Isolated ledger did not stop; its files were retained');
      rmSync(directory, { recursive: true, force: true });
    };
    let bootstrap: APIRequestContext | undefined;
    try {
      bootstrap = await playwright.request.newContext({ baseURL: origin });
      const deadline = Date.now() + 20_000;
      while (true) {
        if (stopped)
          throw new Error(`Isolated ledger ${spawnFailed ? 'could not start' : 'exited'}`);
        try {
          const response = await bootstrap.get('/health', { timeout: 500 });
          if (response.ok()) break;
        } catch {
          // Only this server's bounded startup is retried; scenario assertions are unchanged.
        }
        if (Date.now() >= deadline) throw new Error('Isolated ledger startup timed out');
        await pause(100);
      }
      await bootstrapPasskey(bootstrap, origin, storageState);
      await use({ origin, storageState });
    } finally {
      try {
        await bootstrap?.dispose();
      } finally {
        await cleanup();
      }
    }
  },
  // The server's "today" is pinned (BUDGET_TODAY), so the browser's must be too: forms default
  // their date to the browser's today, and a day after the server's today is a future date to it.
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(new Date(LEDGER_NOW));
    await use(page);
  },
  baseURL: async ({ isolatedLedger }, use) => use(isolatedLedger.origin),
  storageState: async ({ isolatedLedger }, use) => use(isolatedLedger.storageState),
});
