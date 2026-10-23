import {
  accountSummaries,
  createTestDatabase,
  getBooking,
  listExpectedPayments,
  listExpectedVersions,
  schema,
  type OpenedDatabase,
} from '@budget/db';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookingRoutes } from '../../../server/src/api/bookings';
import { errorResponse } from '../../../server/src/api/http';
import { undoRoutes } from '../../../server/src/api/lookups';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { emptyDraft } from '../ledger/booking-model';
import type { BookingCreate } from '../ledger/api';
import { sendQueue, submitCapture } from './queue';
import type { QueuedBooking } from './queue-store';

// Only the device-storage seam is injected: real queue decisions, client HTTP, Hono booking/undo
// routes and SQLite transactions run unchanged. This does not claim native IndexedDB/lock proof.
const device = vi.hoisted(() => ({ rows: [] as QueuedBooking[], failDeletes: 0 }));
vi.mock('./queue-store', () => ({
  listQueue: async () => structuredClone(device.rows),
  putQueued: async (item: QueuedBooking) => {
    device.rows = [...device.rows.filter((row) => row.id !== item.id), structuredClone(item)].sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    );
  },
  deleteQueued: async (id: string) => {
    if (device.failDeletes > 0) {
      device.failDeletes--;
      throw new Error('Synthetischer Fehler beim Entfernen des Geräteeintrags.');
    }
    device.rows = device.rows.filter((row) => row.id !== id);
  },
  withQueueLock: <T>(run: () => Promise<T>) => run(),
}));

const TODAY = '2026-10-19';
const INPUT: BookingCreate = {
  type: 'booking',
  accountId: 'giro',
  date: TODAY,
  amountCents: -1375,
  payeeName: 'Synthetic retry shop',
  memo: 'Synthetic queue proof',
  splits: [
    { categoryId: 'essen', amountCents: -1000 },
    { categoryId: 'miete', amountCents: -375 },
  ],
};
const DRAFT = { ...emptyDraft('giro', TODAY), amount: '13,75', categoryId: 'essen' };
interface Reply {
  id: string;
  groupId: string;
  bookings: {
    id: string;
    amountCents: number;
    splits: { categoryId: string | null; amountCents: number }[];
  }[];
}
let opened: OpenedDatabase;
let app: Hono;
let loseResponses = 0;
let requests: { key: string | null; body: string }[];
let replies: { status: number; data: unknown }[];

beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  device.rows = [];
  device.failDeletes = 0;
  loseResponses = 0;
  requests = [];
  replies = [];
  // Known signed-in fixture boundary, as in existing ledger API tests. Authentication/CSRF and
  // WebAuthn are independently tested; this proof neither replaces nor claims those assurances.
  app = new Hono()
    .use('*', async (_context, next) => next())
    .route(
      '/api/bookings',
      bookingRoutes(opened.db, () => TODAY),
    )
    .route('/api/undo', undoRoutes(opened.db));
  app.onError(errorResponse);
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe('/api/bookings');
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('same-origin');
      const item = device.rows[0];
      // Observe the persisted state at the actual network boundary, before the server can commit.
      expect(item?.uncertain).toBe(true);
      const key = new Headers(init?.headers).get('Idempotency-Key');
      expect(key).toBe(item?.id);
      requests.push({ key, body: String(init?.body) });
      const response = await app.request(String(input), init);
      replies.push({ status: response.status, data: await response.clone().json() });
      if (loseResponses > 0 && response.ok) {
        loseResponses--;
        throw new TypeError('Synthetic committed response lost');
      }
      return response;
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  opened.close();
});

const balance = () =>
  accountSummaries(opened.db, TODAY).find((row) => row.id === 'giro')!.balanceCents;
const deliveryRows = () => opened.db.select().from(schema.bookingDelivery).all();
function state() {
  // Full ordered rows, not only counts: failed late work must preserve every existing fact/audit.
  const tables = [
    'account',
    'booking',
    'booking_split',
    'payee',
    'category',
    'expected_payment',
    'expected_payment_version',
    'booking_delivery',
    'audit_log',
  ];
  return Object.fromEntries(
    tables.map((table) => [
      table,
      opened.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ]),
  );
}
function oneCommittedDelivery(first: Reply) {
  expect(first.bookings).toHaveLength(1);
  expect(first.bookings[0]).toMatchObject({ id: first.id, amountCents: -1375 });
  expect(
    first.bookings[0]!.splits.map(({ categoryId, amountCents }) => ({
      categoryId,
      amountCents,
    })).sort((a, b) => String(a.categoryId).localeCompare(String(b.categoryId))),
  ).toEqual([
    { categoryId: 'essen', amountCents: -1000 },
    { categoryId: 'miete', amountCents: -375 },
  ]);
  expect(balance()).toBe(98625);
  expect(
    opened.sqlite.prepare("SELECT id FROM booking WHERE memo = 'Synthetic queue proof'").all(),
  ).toEqual([{ id: first.id }]);
  expect(
    opened.sqlite.prepare("SELECT name FROM payee WHERE name = 'Synthetic retry shop'").all(),
  ).toEqual([{ name: 'Synthetic retry shop' }]);
  expect(deliveryRows()).toHaveLength(1);
  expect(deliveryRows()[0]!.key).toBe(requests[0]!.key);
  expect(JSON.parse(deliveryRows()[0]!.responseJson)).toEqual(first);
  // A technical booking_delivery receipt is NOT a physical receipt/Beleg. No file is queued here.
  expect(opened.db.select().from(schema.receipt).all()).toEqual([]);
  expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
}
async function reverseAndRedo(first: Reply, recurring = false) {
  const reverse = await app.request('/api/undo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ groupId: first.groupId }),
  });
  expect(reverse.status).toBe(200);
  const reversed = (await reverse.json()) as { groupId: string };
  expect(getBooking(opened.db, first.id)).toBeUndefined();
  expect(balance()).toBe(100000);
  expect(deliveryRows()).toHaveLength(1); // Undo must never release the original delivery identity.
  if (recurring) expect(listExpectedPayments(opened.db, TODAY)).toEqual([]);
  const undone = state();
  const lateReplay = await app.request('/api/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': requests[0]!.key! },
    body: requests[0]!.body,
  });
  expect(lateReplay.status).toBe(201);
  expect(await lateReplay.json()).toEqual(first);
  expect(state()).toEqual(undone); // A duplicate arriving after undo must not revive any row.
  expect(getBooking(opened.db, first.id)).toBeUndefined();
  expect(balance()).toBe(100000);
  const redo = await app.request('/api/undo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ groupId: reversed.groupId }),
  });
  expect(redo.status).toBe(200);
  oneCommittedDelivery(first);
  if (recurring) expect(listExpectedPayments(opened.db, TODAY)).toHaveLength(1);
}

describe('real queued booking delivery assurance (#559, no physical-file queue)', () => {
  it('loses two committed responses, retries identical key/body, and commits exactly once with literal cents and undo', async () => {
    loseResponses = 2;
    expect(await submitCapture(INPUT, DRAFT)).toBeNull();
    const held = structuredClone(device.rows[0]!);
    expect(held).toMatchObject({ input: INPUT, uncertain: true });
    const first = replies[0]!.data as Reply;
    oneCommittedDelivery(first);
    const committed = state();
    const sent = vi.fn();
    await sendQueue(sent); // The replay succeeds on the server; its response is lost again.
    expect(sent).not.toHaveBeenCalled();
    expect(device.rows[0]).toMatchObject({ id: held.id, input: INPUT, uncertain: true });
    expect(state()).toEqual(committed);
    await sendQueue(sent);
    expect(sent).toHaveBeenCalledExactlyOnceWith(first);
    expect(device.rows).toEqual([]);
    expect(requests).toEqual(
      Array.from({ length: 3 }, () => ({ key: held.id, body: JSON.stringify(INPUT) })),
    );
    expect(replies).toEqual(Array.from({ length: 3 }, () => ({ status: 201, data: first })));
    expect(state()).toEqual(committed);
    await reverseAndRedo(first);
  });

  it('retains an uncertain item when local deletion fails after commit, then replays without another server write', async () => {
    device.failDeletes = 1;
    expect(await submitCapture(INPUT, DRAFT)).toBeNull();
    expect(replies[0]!.status).toBe(201);
    const first = replies[0]!.data as Reply;
    oneCommittedDelivery(first);
    const held = structuredClone(device.rows[0]!);
    expect(held).toMatchObject({ input: INPUT, uncertain: true });
    const committed = state();
    const sent = vi.fn();
    await sendQueue(sent);
    expect(sent).toHaveBeenCalledExactlyOnceWith(first);
    expect(device.rows).toEqual([]);
    expect(requests).toEqual(
      Array.from({ length: 2 }, () => ({ key: held.id, body: JSON.stringify(INPUT) })),
    );
    expect(state()).toEqual(committed);
    await reverseAndRedo(first);
  });

  it('rolls back all financial/audit work when the final delivery-row insert fails and reuses the same key after repair', async () => {
    const before = state();
    expect(balance()).toBe(100000);
    opened.sqlite.exec(
      "CREATE TRIGGER reject_delivery BEFORE INSERT ON booking_delivery BEGIN SELECT RAISE(ABORT, 'synthetic late delivery failure'); END",
    );
    const recurring = { ...INPUT, repeat: 'monthly' as const };
    expect(await submitCapture(recurring, DRAFT)).toBeNull();
    expect(replies[0]!.status).toBe(422);
    expect(device.rows[0]).toMatchObject({ input: recurring, uncertain: false });
    const key = device.rows[0]!.id;
    expect(state()).toEqual(before);
    expect(balance()).toBe(100000);
    expect(deliveryRows()).toEqual([]);
    opened.sqlite.exec('DROP TRIGGER reject_delivery');
    const sent = vi.fn();
    await sendQueue(sent);
    expect(device.rows).toEqual([]);
    expect(sent).toHaveBeenCalledTimes(1);
    const first = replies[1]!.data as Reply;
    oneCommittedDelivery(first);
    expect(requests).toEqual(
      Array.from({ length: 2 }, () => ({ key, body: JSON.stringify(recurring) })),
    );
    const expected = listExpectedPayments(opened.db, TODAY);
    expect(expected).toMatchObject([
      { startDate: '2026-11-19', rhythm: 'monthly', accountId: 'giro' },
    ]);
    expect(listExpectedVersions(opened.db, expected[0]!.id)).toMatchObject([
      { validFrom: '2026-11-19', amountCents: 1375, currency: 'EUR' },
    ]);
    await reverseAndRedo(first, true);
  });
});
