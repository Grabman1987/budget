import { createBooking, createEntity, createTestDatabase, schema } from '@budget/db';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { seedBasics, testCtx } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

let opened: ReturnType<typeof createTestDatabase>;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});

type State = { schemaVersion: number; revision: string; views: Array<{ id: string; name: string; search: Record<string, string> }>; unavailable: boolean; groupId: string; changed: boolean };
const read = async () => {
  const response = await api().request('/bookings/saved-views');
  expect(response.status).toBe(200);
  return await response.json() as State;
};
const post = (body: unknown) => api().request('/bookings/saved-views', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const save = async (name: string, search: Record<string, string>, id?: string) => {
  const response = await post({ kind: 'save', revision: (await read()).revision, view: { name, search }, ...(id ? { id } : {}) });
  expect(response.status).toBe(200);
  return await response.json() as State;
};
const undo = async (groupId: string) => {
  const response = await api().request('/undo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ groupId }) });
  expect(response.status).toBe(200);
  return await response.json() as { groupId: string };
};

it('keeps stable identity, no-op, explicit replace/rename, delete and grouped Undo/redo with stale revision protection', async () => {
  createBooking(opened.db, { accountId: 'giro', date: '2026-10-02', amountCents: -1234, splits: [{ categoryId: 'essen', amountCents: -1234 }] }, testCtx);
  const before = financialRows();
  const first = await save('Muster', { konto: 'removed-account', q: 'first', von: '2026-10-01' });
  const id = first.views[0]!.id;
  const duplicate = await post({ kind: 'save', revision: first.revision, view: { name: 'MUSTER', search: {} } });
  expect(duplicate.status).toBe(409);
  const unchanged = await save('Muster', first.views[0]!.search, id);
  expect(unchanged.changed).toBe(false);
  expect(unchanged.revision).toBe(first.revision);
  const changed = await save('Renamed', { status: 'pending', markierung: 'none', sortierung: 'payee' }, id);
  expect(changed.views).toEqual([{ id, name: 'Renamed', search: { status: 'pending', markierung: 'none', sortierung: 'payee' } }]);
  expect((await post({ kind: 'delete', id, revision: first.revision })).status).toBe(409);
  const undone = await undo(changed.groupId);
  expect((await read()).views).toEqual(first.views);
  expect((await post({ kind: 'delete', id, revision: first.revision })).status).toBe(409);
  await undo(undone.groupId);
  const response = await post({ kind: 'delete', id, revision: (await read()).revision });
  expect(response.status).toBe(200);
  const deleted = await response.json() as State;
  expect(deleted.views).toEqual([]);
  await undo(deleted.groupId);
  expect((await read()).views).toEqual(changed.views);
  expect(financialRows()).toEqual(before);
});

it('rejects initial-token replay after creation Undo and rolls the whole preference write back on audit failure', async () => {
  const created = await save('Created', { q: 'Muster' });
  await undo(created.groupId);
  const current = await read();
  expect(current.views).toEqual([]);
  expect(current.revision).not.toBe('none');
  expect((await post({ kind: 'save', revision: 'none', view: { name: 'Stale', search: {} } })).status).toBe(409);
  const before = financialRows();
  const auditBefore = opened.sqlite.prepare('SELECT * FROM audit_log ORDER BY rowid').all();
  opened.sqlite.exec("CREATE TEMP TRIGGER reject_preference_audit BEFORE INSERT ON audit_log WHEN NEW.entity_id = 'ledger.bookings.views' BEGIN SELECT RAISE(ABORT, 'synthetic rollback'); END");
  const failed = await post({ kind: 'save', revision: current.revision, view: { name: 'Rollback', search: { q: 'Muster' } } });
  expect(failed.status).toBe(422);
  expect(await failed.json()).toMatchObject({ error: 'constraint' });
  expect(await read()).toEqual(current);
  expect(opened.sqlite.prepare('SELECT * FROM audit_log ORDER BY rowid').all()).toEqual(auditBefore);
  expect(financialRows()).toEqual(before);
});

it('strictly rejects bad persisted input and enforces twenty views without partial writes', async () => {
  for (const search of [{ panel: 'buchung' }, { cursor: 'x' }, { ruecksprung: '/reports' }, { q: 12 }, { konto: 'x'.repeat(65) }, { von: '2026-02-30' }, { status: 'all' }, { markierung: 'black' }, { sumCents: 1234 }])
    expect((await post({ kind: 'save', revision: 'none', view: { name: 'Invalid', search } })).status).toBe(400);
  for (const name of ['', ' ', 'x'.repeat(41)]) expect((await post({ kind: 'save', revision: 'none', view: { name, search: {} } })).status).toBe(400);
  expect((await api().request('/bookings/saved-views?cursor=ignored')).status).toBe(400);
  expect((await post({ kind: 'save', revision: 'none', view: { name: 'Invalid', search: {} }, unknown: true })).status).toBe(400);
  expect((await read()).revision).toBe('none');
  for (let i = 0; i < 20; i++) await save(`View ${i}`, { q: `${i}` });
  const before = await read();
  expect((await post({ kind: 'save', revision: before.revision, view: { name: 'Overflow', search: {} } })).status).toBe(409);
  expect(await read()).toEqual(before);
});

it.each(['not-json', JSON.stringify({ schemaVersion: 2, views: [] }), JSON.stringify({ schemaVersion: 1, views: [{ id: 'bad', name: 'Muster', search: {} }] })])('preserves unavailable stored state without overwriting it: %s', async (value) => {
  createEntity(opened.db, schema.appSetting, { id: 'ledger.bookings.views', value }, testCtx);
  const before = opened.sqlite.prepare('SELECT * FROM app_setting ORDER BY id').all();
  const state = await read();
  expect(state.unavailable).toBe(true);
  expect(state.views).toEqual([]);
  expect((await post({ kind: 'save', revision: state.revision, view: { name: 'New', search: {} } })).status).toBe(409);
  expect(opened.sqlite.prepare('SELECT * FROM app_setting ORDER BY id').all()).toEqual(before);
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
