import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import baseConfig from '../playwright.config';

export default defineConfig({
  ...baseConfig,
  testDir: resolve(process.cwd(), 'e2e'),
  globalSetup: resolve(process.cwd(), 'e2e/format-558-auth.setup.ts'),
  updateSnapshots: 'none',
});
