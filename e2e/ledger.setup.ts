import { test as setup } from '@playwright/test';
import {
  categories,
  categoryGroup,
  contact,
  createEntity,
  openDatabase,
  project,
  setCategoryHidden,
} from '@budget/db';
import { DB_MAIN } from '../playwright.config';

/**
 * The ledger tests need a few categories, a contact and a project: they are written straight into
 * the throwaway database of the main test server (synthetic names) to keep the tests short.
 */
setup('seed categories for the ledger tests', () => {
  const { db, close } = openDatabase(DB_MAIN);
  try {
    const ctx = { actor: 'e2e' };
    createEntity(db, categoryGroup, { id: 'e2e-g', name: 'Fixkosten' }, ctx);
    categories.create(db, { id: 'e2e-essen', name: 'Essen', groupId: 'e2e-g', class: 'need' }, ctx);
    categories.create(db, { id: 'e2e-reise', name: 'Reise', groupId: 'e2e-g', class: 'want' }, ctx);
    categories.create(db, { id: 'e2e-miete', name: 'Miete', groupId: 'e2e-g', class: 'need' }, ctx);
    // The capture tests book against categories of their own (one per test and viewport, their
    // Available is asserted) on waterfall stage 2.
    for (const tag of ['desktop', 'mobile']) {
      for (const letter of ['A', 'B', 'C', 'D', 'E']) {
        categories.create(
          db,
          {
            id: `e2e-cap-${letter}-${tag}`,
            name: `Cap ${letter} ${tag}`,
            groupId: 'e2e-g',
            class: 'need',
            stage: 2,
          },
          ctx,
        );
      }
    }
    // An archived category: the category lists must leave it out.
    categories.create(
      db,
      { id: 'e2e-archiv', name: 'Archiv Alt', groupId: 'e2e-g', class: 'want' },
      ctx,
    );
    setCategoryHidden(db, 'e2e-archiv', true, ctx);
    // Contact shares run through the Auslagen envelope (category kind advance).
    categories.create(
      db,
      { id: 'e2e-auslagen', name: 'Auslagen', groupId: 'e2e-g', class: null, kind: 'advance' },
      ctx,
    );
    createEntity(db, contact, { id: 'e2e-anna', name: 'Anna Muster' }, ctx);
    createEntity(db, project, { id: 'e2e-projekt', name: 'Nebenprojekt' }, ctx);
  } finally {
    close();
  }
});
