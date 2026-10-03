import { defineConfig } from '@playwright/test';

// This workflow uses the isolated-ledger fixture (fresh server/passkey per test), so it needs
// neither global seed servers nor global setup. Keeps the PDF/browser check bounded on laptops.
export default defineConfig({
  testDir: '.',
  testMatch: /payslip-intake\.spec\.ts/,
  workers: 1,
  use: { serviceWorkers: 'block', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});
