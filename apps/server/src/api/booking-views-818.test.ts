import { createBooking, createTestDatabase } from '@budget/db';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { seedBasics, testCtx } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

let opened: ReturnType<typeof createTestDatabase>;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const api = () => createLedgerApi({
  db: opened.db, today: () => '2026-10-02', bankSync: null,
  stepUp: async (_c, next) => next(),
});
const financialRows = () => ['account', 'booking', 'booking_split'].map((table) => ({
  table, rows: opened.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
}));

it('exposes and saves a strict named booking-filter tuple through the real API without changing ledger rows', async () => {
  const bookingId = createBooking(opened.db, {
    accountId: 'giro', date: '2026-10-02', amountCents: -1234,
    payeeId: 'p1', status: 'confirmed', flag: 'blue',
    splits: [{ categoryId: 'essen', amountCents: -1234 }],
  }, testCtx);
  const before = financialRows();
  const app = api();
  const response = await app.request('/bookings/saved-views');
  expect(response.status).toBe(200);
  const initial = await response.json();
  expect(initial).toEqual({ schemaVersion: 1, revision: 'none', views: [], unavailable: false });
  const search = {
    basis: 'category-spending', buchung: bookingId, konto: 'giro', kategorie: 'essen',
    kategoriegruppe: 'g', empfaenger: 'p1', status: 'confirmed', markierung: 'blue',
    von: '2026-10-01', bis: '2026-10-02', q: 'Synthetic filter',
    sortierung: 'amount', richtung: 'asc',
  };
  const saved = await app.request('/bookings/saved-views', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'save', revision: 'none', view: { name: 'Synthetic filter', search } }),
  });
  expect(saved.status).toBe(200);
  const state = await saved.json() as {
    revision: string; views: Array<{ id: string; name: string; search: typeof search }>;
    changed: boolean; groupId: string;
  };
  expect(state.changed).toBe(true);
  expect(state.revision).not.toBe('none');
  expect(state.groupId).toMatch(/^[a-f0-9-]{36}$/i);
  expect(state.views).toHaveLength(1);
  expect(state.views[0]).toEqual({ id: expect.stringMatching(/^[a-f0-9-]{36}$/i), name: 'Synthetic filter', search });
  const fresh = await api().request('/bookings/saved-views');
  expect(fresh.status).toBe(200);
  expect(await fresh.json()).toEqual({
    schemaVersion: 1, revision: state.revision, views: state.views, unavailable: false,
  });
  expect(financialRows()).toEqual(before);
  const audit = opened.sqlite.prepare('SELECT entity_type, entity_id FROM audit_log WHERE group_id = ?').all(state.groupId);
  expect(audit).toEqual([{ entity_type: 'app_setting', entity_id: 'ledger.bookings.views' }]);
});
