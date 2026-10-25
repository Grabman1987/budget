import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, createBooking, schema, type OpenedDatabase } from '@budget/db';
import { seedBasics, testCtx } from '../../../../packages/db/src/repos/test-helpers';
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
type Reply = {
  count: number;
  segments: { umsaetze: number; aufgaben: number };
  taskSources: Record<string, number>;
  entries: { id: string }[];
  totalEntries: number;
  next: number | null;
  accountReminders: { accountId: string }[];
};
const get = async (query: string) => {
  const response = await app.request('/inbox' + query);
  expect(response.status).toBe(200);
  return response.json() as Promise<Reply>;
};
const snapshot = () =>
  JSON.stringify([
    opened.sqlite.prepare('SELECT * FROM audit_log ORDER BY rowid').all(),
    opened.sqlite.prepare('SELECT * FROM booking ORDER BY rowid').all(),
    opened.sqlite.prepare('SELECT * FROM inbox_item ORDER BY rowid').all(),
  ]);
it('counts one due account and every retained source item before period, source and page filters without writes', async () => {
  createBooking(
    opened.db,
    { accountId: 'giro', date: '2026-08-01', amountCents: -100, splits: [{ amountCents: -100 }] },
    testCtx,
  );
  for (const [id, refType, kind, createdAt] of [
    ['plan-old', 'savings_plan', 'other', '2026-08-01T12:00:00Z'],
    ['payroll', 'payslip-intake', 'revision', '2026-09-01T12:00:00Z'],
    ['unknown', 'unfamiliar-source', 'stale_value', '2026-09-01T12:00:00Z'],
    ['consent', null, 'consent', '2026-09-01T12:00:00Z'],
  ] as const)
    opened.db.insert(schema.inboxItem).values({ id, refType, kind, title: id, createdAt }).run();
  opened.db
    .insert(schema.receipt)
    .values({
      id: 'receipt',
      sha256: 'a'.repeat(64),
      storageKey: 'synthetic.pdf',
      mime: 'application/pdf',
      sizeBytes: 100,
      originalFilename: 'synthetic.pdf',
    })
    .run();
  const before = snapshot();
  const full = await get('?segment=aufgaben&limit=1');
  expect(full.accountReminders.map((r) => r.accountId)).toEqual(['giro']);
  expect(full.taskSources).toEqual({ accounts: 1, plan: 1, receipts: 1, payslips: 1, other: 2 });
  expect(full.segments).toEqual({ umsaetze: 1, aufgaben: 6 });
  expect(Object.values(full.taskSources).reduce((sum, n) => sum + n, 0)).toBe(6);
  const pill = await get('/count');
  expect(pill.count).toBe(7);
  const current = await get('?segment=aufgaben&taskSource=plan&period=current&limit=1');
  expect(current.taskSources).toEqual(full.taskSources);
  expect(current.entries).toEqual([]);
  expect(current.totalEntries).toBe(0);
  const historical = await get('?segment=aufgaben&taskSource=plan&period=historical&limit=1');
  expect(historical.entries.map((e) => e.id)).toEqual(['plan-old']);
  expect(historical.next).toBeNull();
  const other = await get('?segment=aufgaben&taskSource=other&limit=1&offset=1');
  expect(other.totalEntries).toBe(2);
  expect(other.entries).toHaveLength(1);
  const movements = await get('?segment=umsaetze&limit=1');
  expect(movements.entries).toHaveLength(1);
  expect(movements.segments).toEqual(full.segments);
  expect(snapshot()).toBe(before);
});
