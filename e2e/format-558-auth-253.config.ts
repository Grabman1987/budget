import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import baseConfig from '../playwright.config';

export default defineConfig({
  ...baseConfig,
  testDir: resolve(process.cwd(), 'e2e'),
  outputDir: resolve(process.cwd(), 'test-results'),
  globalSetup: resolve(process.cwd(), 'e2e/format-558-auth-253.setup.ts'),
  updateSnapshots: 'none',
  webServer: baseConfig.webServer?.map((server) => ({ ...server, cwd: process.cwd() })),
});
