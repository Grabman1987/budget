import { defineConfig, devices } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';

const MAIN_PORT = Number(process.env['E2E_PORT'] ?? 4310);
const AUTH_DESKTOP_PORT = MAIN_PORT + 1;
const AUTH_MOBILE_PORT = MAIN_PORT + 2;
/** Test-only secret for the bootstrap; the servers below are throwaway and local. */
export const E2E_SETUP_TOKEN = 'e2e-setup-token-not-a-secret';
export const MAIN_URL = `http://localhost:${MAIN_PORT}`;
export const STORAGE_STATE = 'test-results/.auth/main.json';

// Every run starts with fresh databases (no passkeys), so the bootstrap is always exercised.
// Workers evaluate this file too; only the main process may delete the files.
const DB_MAIN = 'test-results/e2e-main.sqlite';
const DB_AUTH_DESKTOP = 'test-results/e2e-auth-desktop.sqlite';
const DB_AUTH_MOBILE = 'test-results/e2e-auth-mobile.sqlite';
if (process.env['TEST_WORKER_INDEX'] === undefined) {
  mkdirSync('test-results/.auth', { recursive: true });
  for (const file of [DB_MAIN, DB_AUTH_DESKTOP, DB_AUTH_MOBILE])
    for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });
}

const server = (port: number, database: string) => ({
  command: 'node apps/server/dist/index.js',
  url: `http://localhost:${port}/health`,
  env: {
    PORT: String(port),
    WEB_DIR: 'apps/web/dist',
    DATABASE_PATH: database,
    BUDGET_ORIGIN: `http://localhost:${port}`,
    BUDGET_SETUP_TOKEN: E2E_SETUP_TOKEN,
  },
  reuseExistingServer: false,
  timeout: 30_000,
});

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };
const mobile = {
  ...devices['Desktop Chrome'],
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};

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
  use: { baseURL: MAIN_URL, trace: 'retain-on-failure' },
  projects: [
    // Registers the first passkey on the main server through the API (software authenticator)
    // and stores the session cookie for all other projects.
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { baseURL: MAIN_URL } },
    {
      name: 'desktop',
      dependencies: ['setup'],
      testIgnore: /auth\.(setup|spec)\.ts/,
      use: { ...desktop, storageState: STORAGE_STATE },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      testIgnore: /auth\.(setup|spec)\.ts/,
      use: { ...mobile, storageState: STORAGE_STATE },
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
  // Runs the production build (`npm run build` first): the Hono server serving the web app,
  // so CSP, static hosting and the API are part of what the tests exercise.
  // One server per project that needs its own state: the main one is bootstrapped by the setup
  // project, the two auth servers start empty (each viewport runs the whole bootstrap flow).
  webServer: [
    server(MAIN_PORT, DB_MAIN),
    server(AUTH_DESKTOP_PORT, DB_AUTH_DESKTOP),
    server(AUTH_MOBILE_PORT, DB_AUTH_MOBILE),
  ],
});
