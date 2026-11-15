import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  createBooking,
  createTestDatabase,
  reconcileAccount,
  schema,
  type OpenedDatabase,
} from '@budget/db';
import { seedBasics, testCtx } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

let opened: OpenedDatabase;
let app: ReturnType<typeof createLedgerApi>;
let id: string;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  id = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-01',
      amountCents: -1000,
      status: 'confirmed',
      splits: [{ categoryId: 'essen', amountCents: -1000 }],
    },
    testCtx,
  );
  reconcileAccount(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-02',
      statementBalanceCents: 99000,
    },
    { actor: 'owner', groupId: 'synthetic-check' },
  );
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-09-17',
    stepUp: async (_c, next) => next(),
  });
});
afterEach(() => opened.close());

type Queue = {
  count: number;
  entries: { id: string; refType: string; refId: string; detail: string; urgent: boolean }[];
  taskSources: { other: number };
};
async function request<T>(path: string, method = 'GET', body?: unknown, status = 200): Promise<T> {
  const response = await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  expect(response.status, await response.clone().text()).toBe(status);
  return response.json() as Promise<T>;
}
const queue = () => request<Queue>('/inbox?segment=aufgaben&taskSource=other');
const findings = async () =>
  (await queue()).entries.filter((e) => e.refType === 'account-reconciliation');
const snapshot = () =>
  JSON.stringify([
    opened.sqlite.prepare('SELECT * FROM audit_log ORDER BY rowid').all(),
    opened.sqlite.prepare('SELECT * FROM booking ORDER BY rowid').all(),
    opened.sqlite.prepare('SELECT * FROM account_reconciliation ORDER BY rowid').all(),
    opened.sqlite.prepare('SELECT * FROM inbox_item ORDER BY rowid').all(),
  ]);

it('rejects an implicit edit, derives an exact mismatch after override, and removes it on one Undo', async () => {
  const initial = await queue();
  expect(await findings()).toEqual([]);
  const before = snapshot();
  expect(await request(`/bookings/${id}`, 'PATCH', { amountCents: -1101 }, 409)).toMatchObject({
    error: 'reconciled_locked',
  });
  expect(snapshot()).toBe(before);
  const changed = await request<{ groupId: string }>(`/bookings/${id}`, 'PATCH', {
    amountCents: -1101,
    unlockReconciled: true,
  });
  const afterWrite = snapshot();
  const [finding] = await findings();
  expect(finding).toMatchObject({ refId: 'giro', urgent: true });
  expect(finding!.detail).toContain('02.09.2026');
  expect(finding!.detail).toContain('bestätigt 990,00 €');
  expect(finding!.detail).toContain('jetzt gebucht 988,99 €');
  expect(finding!.detail).toContain('1,01 €');
  // The existing account-review reminder becomes due alongside the new mismatch task.
  expect((await queue()).count).toBe(initial.count + 2);
  expect((await queue()).taskSources.other).toBe(initial.taskSources.other + 1);
  const count = await request<{ count: number }>('/inbox/count');
  expect(count.count).toBe((await queue()).count);
  await request(`/inbox/${finding!.id}/resolve`, 'POST', {}, 404);
  expect(snapshot()).toBe(afterWrite); // all reads remain read-only
  await request('/undo', 'POST', { groupId: changed.groupId });
  expect(await findings()).toEqual([]);
  // Existing review chronology still records post-check activity, including its Undo.
  expect((await queue()).count).toBe(initial.count + 1);
});

it('detects deletion and date/status moves out of the checked balance, without rewriting the statement', async () => {
  for (const patch of [{ date: '2026-09-03' }, { status: 'pending' }]) {
    const result = await request<{ groupId: string }>(`/bookings/${id}`, 'PATCH', {
      ...patch,
      unlockReconciled: true,
    });
    expect((await findings())[0]!.detail).toContain('jetzt gebucht 1.000,00 €');
    expect((await findings())[0]!.detail).toContain('−10,00 €');
    await request('/undo', 'POST', { groupId: result.groupId });
    expect(await findings()).toEqual([]);
  }
  const removed = await request<{ groupId: string }>(`/bookings/${id}?unlock=1`, 'DELETE');
  expect((await findings())[0]!.detail).toContain('jetzt gebucht 1.000,00 €');
  await request('/undo', 'POST', { groupId: removed.groupId });
  expect(await findings()).toEqual([]);
});

it('ignores metadata and later bookings, uses only the latest check and restores its finding on Undo', async () => {
  await request(`/bookings/${id}`, 'PATCH', { memo: 'Synthetic note' });
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-10',
      amountCents: -200,
      splits: [{ categoryId: 'essen', amountCents: -200 }],
    },
    testCtx,
  );
  expect(await findings()).toEqual([]);
  await request(`/bookings/${id}`, 'PATCH', { amountCents: -1101, unlockReconciled: true });
  expect(await findings()).toHaveLength(1);
  const checked = await request<{ result: { groupId: string } }>(
    '/accounts/giro/reconciliation',
    'POST',
    { date: '2026-09-17', statementBalanceCents: 98699 },
    201,
  );
  expect(await findings()).toEqual([]);
  await request('/undo', 'POST', { groupId: checked.result.groupId });
  expect(await findings()).toHaveLength(1);
});

it('does not reinterpret unaudited checkpoints or let future/deleted checks hide a current mismatch', async () => {
  await request(`/bookings/${id}`, 'PATCH', { amountCents: -1101, unlockReconciled: true });
  const [original] = await findings();
  const future = reconcileAccount(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-18',
      today: '2026-09-18',
      statementBalanceCents: 98899,
    },
    { actor: 'owner', groupId: 'synthetic-future-check' },
  );
  expect(await findings()).toEqual([original]);
  await request('/undo', 'POST', { groupId: future.groupId });
  expect(await findings()).toEqual([original]);
  opened.db
    .insert(schema.accountReconciliation)
    .values({
      id: 'synthetic-legacy',
      accountId: 'giro',
      date: '2026-09-17',
      statementBalanceCents: 99000,
      clearedBalanceCents: 99000,
    })
    .run();
  // No fabricated acceptance, and the latest legacy checkpoint supersedes the older one.
  expect(await findings()).toEqual([]);
});
