import {
  ensureDefaultRules,
  matchOccurrences,
  openDatabase,
  refreshOccurrences,
  rule,
} from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { test as base } from './isolated-ledger';

/** Real HTTP reads on a private synthetic seed, independent of other specs' refresh actions. */
export const test = base.extend<{ seededHeute: void; materializedSample: boolean }>({
  ledgerToday: '2026-09-17',
  colorScheme: 'light',
  reducedMotion: 'reduce',
  materializedSample: [false, { option: true }],
  seededHeute: [
    async ({ isolatedLedger, ledgerToday, materializedSample }, use) => {
      const { db, close } = openDatabase(isolatedLedger.databasePath);
      try {
        // Server startup installs default rule codes; replace those with the seed's own ids.
        db.delete(rule).run();
        seedDatabase(db);
        ensureDefaultRules(db);
        if (materializedSample) {
          refreshOccurrences(db, ledgerToday);
          matchOccurrences(db, ledgerToday);
        }
      } finally {
        close();
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
