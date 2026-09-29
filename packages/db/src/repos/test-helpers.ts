import type { OpenedDatabase } from '../client';
import { accounts, categories, createEntity } from './entities';
import { categoryGroup, contact, payee } from '../schema';

export const testCtx = { actor: 'tester' };

/** Synthetic fixture for repository tests: three accounts, a group, three categories, a payee. */
export function seedBasics(db: OpenedDatabase['db']) {
  const ctx = testCtx;
  accounts.create(
    db,
    {
      id: 'giro',
      name: 'Giro',
      role: 'budget',
      openingDate: '2023-10-01',
      openingBalanceCents: 100_000,
      sortOrder: 1,
    },
    ctx,
  );
  accounts.create(
    db,
    { id: 'spar', name: 'Sparen', role: 'reserve', openingDate: '2023-10-01', sortOrder: 2 },
    ctx,
  );
  accounts.create(
    db,
    {
      id: 'usd',
      name: 'Dollar',
      role: 'budget',
      currency: 'USD',
      openingDate: '2023-10-01',
      sortOrder: 3,
    },
    ctx,
  );
  createEntity(db, categoryGroup, { id: 'g', name: 'Fixkosten' }, ctx);
  categories.create(db, { id: 'miete', name: 'Miete', groupId: 'g', class: 'need' }, ctx);
  categories.create(db, { id: 'essen', name: 'Essen', groupId: 'g', class: 'need' }, ctx);
  categories.create(db, { id: 'reise', name: 'Reise', groupId: 'g', class: 'want' }, ctx);
  createEntity(db, payee, { id: 'p1', name: 'Vermieter' }, ctx);
  createEntity(db, contact, { id: 'k1', name: 'Freund' }, ctx);
  return { ctx };
}
