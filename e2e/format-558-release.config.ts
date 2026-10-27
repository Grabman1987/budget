import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'format-558-release.spec.ts',
  projects: [{ name: 'formatter' }],
  reporter: 'line',
  workers: 1,
  forbidOnly: true,
  retries: 0,
  updateSnapshots: 'none',
});
