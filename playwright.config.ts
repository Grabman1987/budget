import { E2E_SETUP_TOKEN } from './e2e/setup-token';
import { defineConfig, devices } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';

const MAIN_PORT = Number(process.env['E2E_PORT'] ?? 4310);
const START_TIMEOUT = Number(process.env['E2E_START_TIMEOUT'] ?? 30_000);
const AUTH_DESKTOP_PORT = MAIN_PORT + 1;
const AUTH_MOBILE_PORT = MAIN_PORT + 2;
const SAMPLE_PORT = Number(process.env['E2E_SAMPLE_PORT'] ?? MAIN_PORT + 3);
/** Test-only secret for the bootstrap; the servers below are throwaway and local. */
export { E2E_SETUP_TOKEN } from './e2e/setup-token';
export const MAIN_URL = `http://localhost:${MAIN_PORT}`;
export const STORAGE_STATE = 'test-results/.auth/main.json';
export const SAMPLE_URL = `http://localhost:${SAMPLE_PORT}`;
export const STORAGE_STATE_SAMPLE = 'test-results/.auth/sample.json';
/** The day the sample server runs on: the prototype's reference day. */
const SAMPLE_TODAY = '2026-09-17';

// Two kinds of test server (convention):
//  - main (MAIN_PORT): starts empty. Specs that need an empty ledger or that write freely use it
//    (`test` from @playwright/test, the desktop/mobile projects' default base URL).
//  - sample (MAIN_PORT + 3): seeded with the synthetic ledger, "today" is 17.09.2026, so pages can
//    be compared with the prototype's figures. Specs use `sampleTest` from e2e/sample.ts. It is
//    READ-MOSTLY and shared by every spec and viewport running in parallel: a test that writes
//    there must undo its write (POST /api/undo with the groupId of the write) or use entities of
//    its own (unique ids), and must never depend on another test's leftovers.
//
// Every run starts with fresh databases (no passkeys), so the bootstrap is always exercised.
// Workers evaluate this file too; only the main process may delete the files.
export const DB_MAIN = 'test-results/e2e-main.sqlite';
const DB_AUTH_DESKTOP = 'test-results/e2e-auth-desktop.sqlite';
const DB_AUTH_MOBILE = 'test-results/e2e-auth-mobile.sqlite';
export const DB_SAMPLE = 'test-results/e2e-sample.sqlite';
if (process.env['TEST_WORKER_INDEX'] === undefined) {
  mkdirSync('test-results/.auth', { recursive: true });
  for (const file of [DB_MAIN, DB_AUTH_DESKTOP, DB_AUTH_MOBILE, DB_SAMPLE])
    for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });
}

const server = (port: number, database: string) => ({
  command: 'node apps/server/dist/index.js',
  url: `http://localhost:${port}/health`,
  env: {
    PORT: String(port),
    ENABLE_BANKING_APP_ID: '',
    DROPBOX_PAYSLIP_ROOT: '',
    PAYSLIP_PDF_PASSWORD: 'synthetic-pdf-password',
    BUDGET_BANK_SYNC_DAILY: '0',
    WEB_DIR: 'apps/web/dist',
    DATABASE_PATH: database,
    BUDGET_ORIGIN: `http://localhost:${port}`,
    BUDGET_SETUP_TOKEN: E2E_SETUP_TOKEN,
  },
  reuseExistingServer: false,
  timeout: START_TIMEOUT,
});

// The sample server: migrated and seeded with the synthetic ledger (scripts/db-seed.ts), then the
// normal server with "today" pinned (BUDGET_TODAY). Seeding runs before the health check answers.
const sampleServer = () => {
  const base = server(SAMPLE_PORT, DB_SAMPLE);
  return {
    ...base,
    command: `npx tsx scripts/db-seed.ts --file ${DB_SAMPLE} --fresh && ${base.command}`,
    env: { ...base.env, BUDGET_TODAY: SAMPLE_TODAY },
    timeout: Math.max(90_000, START_TIMEOUT),
  };
};

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };
const mobile = {
  ...devices['Desktop Chrome'],
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};

// Real WebKit (the engine of every iOS browser), iPhone 13 viewport (390 x 664 visible, 844 tall).
// Only the specs that exercise engine-specific behaviour run here (mobile-panels.spec.ts): a
// Chromium run is no proof for Safari (owner report 04.10.2026, docs/mobile-panels.md).
const iphone = { ...devices['iPhone 13'] };

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: {
    // Visual comparison of /dev/bauteile; fonts are self-hosted so rendering is stable.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  // The PWA service worker would answer navigations itself, which hides them from `page.route`
  // (e.g. the prototype comparison in debts.spec.ts) and caches state across tests. Only
  // e2e/pwa.spec.ts opts in.
  use: { baseURL: MAIN_URL, trace: 'retain-on-failure', serviceWorkers: 'block' },
  projects: [
    // Registers the first passkey on the main server through the API (software authenticator)
    // and stores the session cookie for all other projects.
    { name: 'setup', testMatch: /(auth|ledger)\.setup\.ts/, use: { baseURL: MAIN_URL } },
    // The same bootstrap against the seeded sample server (`sampleTest`, e2e/sample.ts).
    { name: 'setup-sample', testMatch: /sample\.setup\.ts/, use: { baseURL: SAMPLE_URL } },
    {
      name: 'desktop',
      dependencies: ['setup', 'setup-sample'],
      testIgnore: /(auth|ledger|sample)\.setup\.ts|auth\.spec\.ts/,
      use: { ...desktop, storageState: STORAGE_STATE },
    },
    {
      name: 'mobile',
      dependencies: ['setup', 'setup-sample'],
      testIgnore: /(auth|ledger|sample)\.setup\.ts|auth\.spec\.ts/,
      use: { ...mobile, storageState: STORAGE_STATE },
    },
    {
      name: 'webkit-iphone',
      dependencies: ['setup', 'setup-sample'],
      testMatch:
        /(mobile-panels|mobile-shell|tap-targets|loan-sheet|asset-classes-settings|glossary).spec.ts/,
      use: { ...iphone, storageState: STORAGE_STATE },
    },
    // Real passkey ceremonies with the browser's virtual authenticator on a separate, empty server.
    {
      name: 'auth-desktop',
      testMatch: /auth\.spec\.ts/,
      use: { ...desktop, baseURL: `http://localhost:${AUTH_DESKTOP_PORT}` },
    },
    {
      name: 'auth-mobile',
      testMatch: /auth\.spec\.ts/,
      use: { ...mobile, baseURL: `http://localhost:${AUTH_MOBILE_PORT}` },
    },
  ],
  // Runs the e2e build (`npm run build:e2e`: production bundle plus the /dev pages): the Hono server serving the web app,
  // so CSP, static hosting and the API are part of what the tests exercise.
  // One server per project that needs its own state: the main one is bootstrapped by the setup
  // project, the two auth servers start empty (each viewport runs the whole bootstrap flow).
  webServer: [
    server(MAIN_PORT, DB_MAIN),
    server(AUTH_DESKTOP_PORT, DB_AUTH_DESKTOP),
    server(AUTH_MOBILE_PORT, DB_AUTH_MOBILE),
    sampleServer(),
  ],
});
