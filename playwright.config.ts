import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env['E2E_PORT'] ?? 4310);

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
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
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
  // Runs the production build (`npm run build` first): the Hono server serving the web app,
  // so CSP and static hosting are part of what the tests exercise.
  webServer: {
    command: 'node apps/server/dist/index.js',
    url: `http://localhost:${PORT}/health`,
    env: { PORT: String(PORT), WEB_DIR: 'apps/web/dist' },
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
});
