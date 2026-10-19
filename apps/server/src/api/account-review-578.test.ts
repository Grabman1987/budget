import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import {
  accounts,
  createBooking,
  createTestDatabase,
  ensureDefaultRules,
  schema,
  type OpenedDatabase,
} from '@budget/db';
import { createApp, type AuthGate } from '../app';
import type { AccountView } from './accounts';

const auth: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
type Reminder = {
  accountId: string;
  accountName: string;
  days: number;
  action: 'reconcile' | 'value';
  dueOn: string;
  checkedOn: string | null;
  policy: string;
  supported: boolean;
};
let opened: OpenedDatabase;
let app: ReturnType<typeof createApp>;
let webDir: string;
let today: string;
beforeEach(() => {
  opened = createTestDatabase();
  ensureDefaultRules(opened.db);
  webDir = mkdtempSync(join(tmpdir(), 'synthetic-review-578-'));
  writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Synthetic</title>');
  today = '2026-09-17';
  app = createApp({ webDir, auth, ledger: { db: opened.db, today: () => today } });
});
afterEach(() => {
  opened.close();
  rmSync(webDir, { recursive: true, force: true });
});
async function get<T>(path: string): Promise<T> {
  const res = await app.request('/api' + path);
  expect(res.status).toBe(200);
  return res.json() as Promise<T>;
}
async function write<T = { groupId: string }>(
  path: string,
  data: unknown,
  method = 'POST',
  expectedStatus = 200,
) {
  const res = await app.request('/api' + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  expect(res.status, await res.clone().text()).toBe(expectedStatus);
  return res.json() as Promise<T>;
}
function seed(
  id: string,
  type: typeof schema.account.$inferSelect.type,
  openingDate: string,
  onBudget = type === 'checking',
) {
  accounts.create(
    opened.db,
    {
      id,
      name: `Synthetic ${id}`,
      type,
      role: onBudget ? 'budget' : type === 'loan' ? 'debt' : 'investment',
      onBudget,
      openingDate,
      openingBalanceCents: 10000,
    },
    { actor: 'synthetic-api', groupId: `account-${id}` },
  );
  createBooking(
    opened.db,
    {
      accountId: id,
      date: openingDate,
      amountCents: -100,
      status: 'confirmed',
      splits: [{ categoryId: null, amountCents: -100 }],
    },
    { actor: 'synthetic-api', groupId: `booking-${id}` },
  );
}
async function parity(expectedIds: string[]) {
  const listed = await get<{ accounts: AccountView[] }>('/accounts');
  const reminder = await get<{ reminders: Reminder[] }>('/accounts/reminders');
  const dashboard = await get<{ accountReminders: Reminder[] }>('/heute');
  expect(
    listed.accounts
      .filter((a) => a.reviewStatus.state === 'due')
      .map((a) => a.id)
      .sort(),
  ).toEqual(expectedIds);
  expect(reminder.reminders.map((a) => a.accountId).sort()).toEqual(expectedIds);
  expect(dashboard.accountReminders).toEqual(reminder.reminders);
  return { listed, reminders: reminder.reminders };
}

it('uses the same exact inclusive 14-day and calendar-month states in all three read routes', async () => {
  seed('budget', 'checking', '2026-09-03');
  seed('card', 'credit_card', '2026-09-03', false);
  seed('loan', 'loan', '2026-08-17');
  seed('investment', 'p2p', '2026-08-17');
  seed('tomorrow', 'checking', '2026-09-04');
  const { listed, reminders } = await parity(['budget', 'card', 'investment', 'loan']);
  expect(reminders.find((r) => r.accountId === 'budget')).toEqual({
    accountId: 'budget',
    accountName: 'Synthetic budget',
    days: 14,
    action: 'reconcile',
    dueOn: '2026-09-17',
    checkedOn: null,
    policy: '14-days',
    supported: true,
  });
  expect(reminders.find((r) => r.accountId === 'investment')).toMatchObject({
    dueOn: '2026-09-17',
    days: 31,
    action: 'value',
    policy: 'calendar-month',
  });
  expect(listed.accounts.find((a) => a.id === 'tomorrow')?.reviewStatus.state).toBe('unreviewed');
  expect(listed.accounts.map((a) => a.balanceCents)).toEqual([9900, 9900, 9900, 9900, 9900]);
});

it('completes an existing check, detects real backdated activity and restores badge/count together on undo', async () => {
  seed('budget', 'checking', '2026-08-01');
  const checked = await write<{ result: { groupId: string } }>(
    '/accounts/budget/reconciliation',
    {
      date: '2026-08-20',
      statementBalanceCents: 9900,
    },
    'POST',
    201,
  );
  expect(checked.result.groupId).toEqual(expect.any(String));
  await parity([]);
  const added = await write(
    '/bookings',
    {
      type: 'booking',
      accountId: 'budget',
      date: '2026-08-10',
      amountCents: -50,
      status: 'pending',
    },
    'POST',
    201,
  );
  expect((await parity(['budget'])).reminders[0]).toMatchObject({
    checkedOn: '2026-08-20',
    dueOn: '2026-09-03',
  });
  await write('/undo', { groupId: added.groupId });
  expect((await parity([])).listed.accounts[0]?.balanceCents).toBe(9900);
  await write('/undo', { groupId: checked.result.groupId });
  expect((await parity(['budget'])).reminders[0]?.checkedOn).toBeNull();
});

it('updates an existing manual valuation through the unchanged route and preserves its exact financial value on undo', async () => {
  seed('manual', 'p2p', '2026-01-31');
  today = '2026-02-28';
  expect((await parity(['manual'])).reminders[0]?.dueOn).toBe('2026-02-28');
  const valued = await write(
    '/accounts/manual/valuation',
    { date: '2026-02-28', valueCents: 12501 },
    'PUT',
  );
  const after = (await parity([])).listed.accounts[0]!;
  expect(after).toMatchObject({
    balanceCents: 9900,
    manualValueCents: 12501,
    valueEurCents: 12501,
  });
  today = '2026-09-17';
  await parity([]); // Quiet months do not age a real valuation into a warning.
  await write('/undo', { groupId: valued.groupId });
  const restored = (await parity(['manual'])).listed.accounts[0]!;
  expect(restored).toMatchObject({
    balanceCents: 9900,
    manualValueCents: 9900,
    lastValuedOn: null,
  });
});

it('preserves the legacy setting API/audited undo and leaves all money and audit rows untouched on reads', async () => {
  seed('budget', 'checking', '2026-08-01');
  const saved = await write('/display-settings', { accountReminderDays: 80 }, 'PATCH');
  expect(
    (await get<{ accountReminderDays: number }>('/display-settings')).accountReminderDays,
  ).toBe(80);
  await parity(['budget']);
  const snapshot = () =>
    JSON.stringify({
      accounts: opened.db.select().from(schema.account).all(),
      bookings: opened.db.select().from(schema.booking).all(),
      splits: opened.db.select().from(schema.bookingSplit).all(),
      audits: opened.db.select().from(schema.auditLog).all(),
      checks: opened.db.select().from(schema.accountReconciliation).all(),
      values: opened.db.select().from(schema.valuation).all(),
    });
  const before = snapshot();
  await parity(['budget']);
  await parity(['budget']);
  expect(snapshot()).toBe(before);
  await write('/undo', { groupId: saved.groupId });
  expect(
    (await get<{ accountReminderDays: number }>('/display-settings')).accountReminderDays,
  ).toBe(35);
  await parity(['budget']);
});
