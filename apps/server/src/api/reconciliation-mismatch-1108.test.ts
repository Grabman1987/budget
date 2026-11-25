import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  createBooking,
  createTestDatabase,
  reconcileAccount,
  schema,
  undo,
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

it('protects a booking explicitly accepted in Prüfen and allows one audited correction', async () => {
  const pending = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-03',
      amountCents: -1001,
      status: 'pending',
      splits: [{ categoryId: 'essen', amountCents: -1001 }],
    },
    testCtx,
  );
  const path = `/bookings/${pending}`;
  const accepted = await request<{ groupId: string }>(path, 'PATCH', {
    status: 'confirmed',
    acceptInReview: true,
  });
  expect(await request(`${path}/edit-protection`)).toMatchObject({
    reconciled: false,
    reviewedOn: ['2026-09-17'],
  });
  // A queued confirmation arriving after the row was settled elsewhere gets a stable code.
  expect(
    await request(path, 'PATCH', { status: 'confirmed', acceptInReview: true }, 409),
  ).toMatchObject({ error: 'booking_not_pending' });
  const before = snapshot();
  expect(await request(path, 'PATCH', { amountCents: -1201 }, 409)).toMatchObject({
    error: 'reconciled_locked',
  });
  expect(await request(path, 'DELETE', undefined, 409)).toMatchObject({
    error: 'reconciled_locked',
  });
  expect(snapshot()).toBe(before);
  const changed = await request<{ groupId: string }>(path, 'PATCH', {
    amountCents: -1201,
    unlockReconciled: true,
  });
  expect(await request(path)).toMatchObject({
    booking: { amountCents: -1201, status: 'confirmed' },
  });
  const audit = opened.sqlite
    .prepare(
      `SELECT id, after_json FROM audit_log WHERE group_id = ? AND entity_type = 'app_setting'`,
    )
    .get(changed.groupId) as { id: string; after_json: string };
  expect(JSON.parse(JSON.parse(audit.after_json).value)).toMatchObject({
    bookingIds: [pending],
    reason: 'In Prüfen bestätigt, Änderung bestätigt',
  });
  expect(() => undo(opened.db, { auditId: audit.id }, testCtx, { force: true })).toThrow(
    /gesamte Aktion/,
  );
  await request('/undo', 'POST', { groupId: changed.groupId });
  expect(await request(path)).toMatchObject({
    booking: { amountCents: -1001, status: 'confirmed' },
  });
  expect(await findings()).toEqual([]);
  const revertedToPending = await request<{ groupId: string }>(path, 'PATCH', {
    status: 'pending',
    unlockReconciled: true,
  });
  const acceptedAgain = await request<{ groupId: string }>(path, 'PATCH', {
    status: 'confirmed',
    acceptInReview: true,
  });
  await request('/undo', 'POST', { groupId: acceptedAgain.groupId });
  await request('/undo', 'POST', { groupId: revertedToPending.groupId });
  await request('/undo', 'POST', { groupId: accepted.groupId });
  expect(await request(`${path}/edit-protection`)).toMatchObject({ reviewedOn: [] });
  expect(await request(path)).toMatchObject({ booking: { amountCents: -1001, status: 'pending' } });
});

it('rejects an implicit edit, derives an exact mismatch after override, and removes it on one Undo', async () => {
  const initial = await queue();
  expect(await findings()).toEqual([]);
  const before = snapshot();
  expect(await request(`/bookings/${id}/edit-protection`)).toMatchObject({
    reconciled: true,
    reconciliationDates: ['2026-09-02'],
    settlementDates: [],
  });
  expect(await request(`/bookings/${id}`, 'PATCH', { amountCents: -1101 }, 409)).toMatchObject({
    error: 'reconciled_locked',
  });
  expect(snapshot()).toBe(before);
  const changed = await request<{ groupId: string }>(`/bookings/${id}`, 'PATCH', {
    amountCents: -1101,
    unlockReconciled: true,
  });
  const override = opened.sqlite
    .prepare(
      `SELECT actor, ts, after_json FROM audit_log
      WHERE group_id = ? AND entity_type = 'app_setting'`,
    )
    .get(changed.groupId) as { actor: string; ts: string; after_json: string };
  expect(override).toMatchObject({ actor: 'owner', ts: expect.any(String) });
  expect(JSON.parse(JSON.parse(override.after_json).value)).toMatchObject({
    bookingIds: [id],
    operation: 'update',
    reason: 'Kontostand abgeglichen, Änderung bestätigt',
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

it.each([{ splits: [{ categoryId: null, amountCents: -1000 }] }, { repeat: 'monthly' }])(
  'audits a protected split or repeat even when the booking amount does not change (%j)',
  async (patch) => {
    const path = `/bookings/${id}`;
    await request(path, 'PATCH', patch, 409);
    const changed = await request<{ groupId: string }>(path, 'PATCH', {
      ...patch,
      unlockReconciled: true,
    });
    expect(
      opened.sqlite
        .prepare(
          `SELECT entity_id FROM audit_log WHERE group_id = ? AND entity_type = 'app_setting'`,
        )
        .all(changed.groupId),
    ).toEqual([{ entity_id: `ledger.reconciled-override.${changed.groupId}` }]);
    expect(await request(path)).toMatchObject({ booking: { amountCents: -1000 } });
    expect(await findings()).toEqual([]);
    await request('/undo', 'POST', { groupId: changed.groupId });
  },
);

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

it('accepts in Prüfen together with payee and one category, but nothing else', async () => {
  const pending = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-03',
      amountCents: -1001,
      status: 'pending',
      splits: [{ amountCents: -1001 }],
    },
    testCtx,
  );
  const path = `/bookings/${pending}`;
  await request(path, 'PATCH', { status: 'confirmed', acceptInReview: true, memo: 'Zusatz' }, 409);
  await request(path, 'PATCH', {
    status: 'confirmed',
    acceptInReview: true,
    splits: [{ amountCents: -1001, categoryId: 'essen' }],
  });
  expect(await request(path)).toMatchObject({
    booking: { status: 'confirmed', splits: [{ categoryId: 'essen', amountCents: -1001 }] },
  });
});
