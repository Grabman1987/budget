import { defineConfig, devices } from '@playwright/test';

/** This scenario bootstraps its own synthetic server via isolated-ledger.ts. */
export default defineConfig({
  testDir: '.',
  testMatch: /planning-accuracy\.spec\.ts/,
  forbidOnly: Boolean(process.env['CI']),
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
