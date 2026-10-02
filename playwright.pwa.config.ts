import { defineConfig, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const port = Number(process.env['E2E_PORT'] ?? 4450);
const baseURL = `http://localhost:${port}`;
mkdirSync('test-results', { recursive: true });

/** Shell/privacy tests need no synthetic ledger, login bootstrap or other servers. */
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'pwa.spec.ts',
  workers: 1,
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'node apps/server/dist/index.js',
    url: `${baseURL}/health`,
    env: {
      PORT: String(port),
      WEB_DIR: 'apps/web/dist',
      DATABASE_PATH: 'test-results/pwa.sqlite',
      BUDGET_ORIGIN: baseURL,
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
