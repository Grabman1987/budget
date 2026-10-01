/* eslint-disable @typescript-eslint/no-explicit-any -- Validate JSON boundary answers. */
import {
  createBooking,
  createTestDatabase,
  insertTracked,
  schema,
  type OpenedDatabase,
} from '@budget/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';
let opened: OpenedDatabase;
let app: ReturnType<typeof createLedgerApi>;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-09-17',
    stepUp: async (_c, next) => next(),
  });
});
afterEach(() => opened.close());
async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as any };
}
describe('inbox API', () => {
  it('returns literal count, categorizes through booking API and restores work with undo', async () => {
    const bookingId = createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-09-17',
        amountCents: -1250,
        splits: [{ amountCents: -1250 }],
      },
      { actor: 'test' },
    );
    insertTracked(
      opened.db,
      schema.inboxItem,
      { id: 'warning', kind: 'stale_value', title: 'Kurse fehlen', refType: 'fx', refId: 'USD' },
      { actor: 'test' },
    );
    expect((await call('GET', '/inbox/count')).body.count).toBe(2);
    expect((await call('GET', '/inbox')).body.entries.map((e: any) => e.type)).toEqual([
      'booking',
      'stored',
    ]);
    const edited = await call('PATCH', `/bookings/${bookingId}`, {
      splits: [{ amountCents: -1250, categoryId: 'essen' }],
    });
    expect(edited.status).toBe(200);
    expect((await call('GET', '/inbox/count')).body.count).toBe(1);
    expect((await call('POST', '/undo', { groupId: edited.body.groupId })).status).toBe(200);
    expect((await call('GET', '/inbox/count')).body.count).toBe(2);
    const resolved = await call('POST', '/inbox/warning/resolve', {});
    expect(resolved.status).toBe(200);
    expect((await call('GET', '/inbox/count')).body.count).toBe(1);
    expect((await call('POST', '/undo', { groupId: resolved.body.groupId })).status).toBe(200);
    expect((await call('GET', '/inbox/count')).body.count).toBe(2);
  });
  it('rejects unknown and booking IDs, extra mutation fields and already resolved tasks', async () => {
    const bookingId = createBooking(
      opened.db,
      { accountId: 'giro', date: '2026-09-17', amountCents: -100, splits: [{ amountCents: -100 }] },
      { actor: 'test' },
    );
    expect((await call('POST', '/inbox/missing/resolve', {})).status).toBe(404);
    expect((await call('POST', `/inbox/${bookingId}/resolve`, {})).status).toBe(404);
    insertTracked(
      opened.db,
      schema.inboxItem,
      { id: 'warning', kind: 'backup', title: 'Sicherung prüfen' },
      { actor: 'test' },
    );
    expect((await call('POST', '/inbox/warning/resolve', { refId: bookingId })).status).toBe(400);
    expect((await call('POST', '/inbox/warning/resolve', {})).status).toBe(200);
    expect((await call('POST', '/inbox/warning/resolve', {})).status).toBe(409);
    expect((await call('GET', '/inbox/count')).body.count).toBe(1);
  });
});
