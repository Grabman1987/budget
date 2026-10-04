import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages}/*/src/**/*.test.{ts,tsx}', 'scripts/claude-hooks.test.mjs'],
    setupFiles: ['./vitest.setup.ts'],
    passWithNoTests: true,
  },
});
