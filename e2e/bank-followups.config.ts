import { defineConfig, devices } from '@playwright/test';

/** Bank specs bootstrap their own fixed-clock server through isolated-ledger.ts. */
export default defineConfig({
  testDir: '.',
  testMatch: /bank-(followups|sync)\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  workers: 2,
  retries: process.env['CI'] ? 1 : 0,
  use: { trace: 'retain-on-failure', serviceWorkers: 'block' },
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
});
