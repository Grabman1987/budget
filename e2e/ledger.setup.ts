import { test as setup } from '@playwright/test';
import { categories, categoryGroup, createEntity, openDatabase } from '@budget/db';
import { DB_MAIN } from '../playwright.config';

/**
 * The ledger tests need a few categories, and the app has no category editor before P2c: they are
 * written straight into the throwaway database of the main test server (synthetic names).
 */
setup('seed categories for the ledger tests', () => {
  const { db, close } = openDatabase(DB_MAIN);
  try {
    const ctx = { actor: 'e2e' };
    createEntity(db, categoryGroup, { id: 'e2e-g', name: 'Fixkosten' }, ctx);
    categories.create(db, { id: 'e2e-essen', name: 'Essen', groupId: 'e2e-g', class: 'need' }, ctx);
    categories.create(db, { id: 'e2e-reise', name: 'Reise', groupId: 'e2e-g', class: 'want' }, ctx);
    categories.create(db, { id: 'e2e-miete', name: 'Miete', groupId: 'e2e-g', class: 'need' }, ctx);
  } finally {
    close();
  }
});
