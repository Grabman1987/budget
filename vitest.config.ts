import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages}/*/src/**/*.test.{ts,tsx}', 'scripts/claude-hooks.test.mjs'],
    setupFiles: ['./vitest.setup.ts'],
    passWithNoTests: true,
    // SQLite-backed tests open, migrate and close real files; the Windows CI runner is several
    // times slower at that than Linux and kept hitting the 5 s default.
    testTimeout: process.platform === 'win32' ? 30_000 : 5_000,
  },
});
