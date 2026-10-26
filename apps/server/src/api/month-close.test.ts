/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect API JSON. */
import {
  createBooking,
  createTestDatabase,
  reconcileAccount,
  schema,
  createEntity,
  createExpectedPayment,
  INCOME_TYPES,
  monthOnePager,
  type OpenedDatabase,
} from '@budget/db';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { eq, isNull } from 'drizzle-orm';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

let opened: OpenedDatabase;
let app: ReturnType<typeof createLedgerApi>;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-10-02',
    stepUp: async (_c, next) => next(),
  });
});
afterEach(() => opened.close());
async function call(method: string, path = '/month-close/2026-09', body?: unknown) {
  const res = await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return {
    status: res.status,
    body: res.headers.get('content-type')?.includes('application/json')
      ? ((await res.json()) as any)
      : {},
  };
}

async function confirmQuiet() {
  const view = (await call('GET')).body;
  const preview = view.unchangedConfirmation;
  return call('POST', '/month-close/2026-09/reconcile-unchanged', {
    accountIds: preview.accounts.map((a: any) => a.id),
    asOf: preview.asOf,
    revision: preview.revision,
  });
}

it('confirms one canonical check per quiet account as one exactly undoable group', async () => {
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-10',
      amountCents: -1250,
      splits: [{ amountCents: -1250, categoryId: 'essen' }],
    },
    { actor: 'test' },
  );
  for (const [accountId, balance] of [
    ['giro', 98750],
    ['spar', 0],
    ['usd', 0],
  ] as const)
    reconcileAccount(
      opened.db,
      { accountId, date: '2026-09-15', statementBalanceCents: balance },
      { actor: 'test' },
    );
  const originalAccounts = opened.db.select().from(schema.account).all();
  const originalBookings = opened.db.select().from(schema.booking).all();
  const originalChecks = opened.db.select().from(schema.accountReconciliation).all();
  const result = await confirmQuiet();
  expect(result.status).toBe(201);
  expect(result.body.changedCount).toBe(3);
  const checks = opened.db
    .select()
    .from(schema.accountReconciliation)
    .where(isNull(schema.accountReconciliation.deletedAt))
    .all();
  expect(
    checks
      .filter((r) => r.date === '2026-09-30')
      .map((r) => [r.accountId, r.statementBalanceCents])
      .sort(),
  ).toEqual([
    ['giro', 98750],
    ['spar', 0],
    ['usd', 0],
  ]);
  const events = opened.db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.groupId, result.body.groupId))
    .all();
  expect(events.filter((e) => e.entityType === 'account_reconciliation')).toHaveLength(3);
  expect(
    (
      await call('PATCH', `/bookings/${originalBookings[0]!.id}`, {
        amountCents: -1300,
        splits: [{ amountCents: -1300, categoryId: 'essen' }],
      })
    ).status,
  ).toBe(409);
  expect((await call('POST', '/undo', { groupId: result.body.groupId })).status).toBe(200);
  expect(opened.db.select().from(schema.account).all()).toEqual(originalAccounts);
  expect(opened.db.select().from(schema.booking).all()).toEqual(originalBookings);
  expect(
    opened.db
      .select()
      .from(schema.accountReconciliation)
      .where(isNull(schema.accountReconciliation.deletedAt))
      .all(),
  ).toEqual(originalChecks);
});

it('rejects a stale batch atomically after new movement, even when that movement is undone', async () => {
  for (const [accountId, statementBalanceCents] of [
    ['giro', 100000],
    ['spar', 0],
  ] as const)
    reconcileAccount(
      opened.db,
      { accountId, date: '2026-09-15', statementBalanceCents },
      { actor: 'test' },
    );
  const preview = (await call('GET')).body.unchangedConfirmation;
  const added = await call('POST', '/bookings', {
    type: 'booking',
    accountId: 'giro',
    date: '2026-09-18',
    amountCents: -100,
    splits: [{ amountCents: -100, categoryId: 'essen' }],
  });
  expect(added.status).toBe(201);
  expect((await call('POST', '/undo', { groupId: added.body.groupId })).status).toBe(200);
  const before = opened.db.select().from(schema.auditLog).all().length;
  const result = await call('POST', '/month-close/2026-09/reconcile-unchanged', {
    accountIds: preview.accounts.map((a: any) => a.id),
    asOf: preview.asOf,
    revision: preview.revision,
  });
  expect(result.status).toBe(409);
  expect(opened.db.select().from(schema.auditLog).all()).toHaveLength(before);
  expect(opened.db.select().from(schema.accountReconciliation).all()).toHaveLength(2);
  expect((await call('GET')).body.unchangedConfirmation.excluded).toContainEqual({
    id: 'giro',
    reason: 'changed_since_check',
  });
});

it.each([
  ['2026-09-29', null],
  [null, '2026-09-28T22:30:00.000Z'],
])(
  'excludes a contradictory newer bank balance using observed or Vienna fetch day (%s)',
  async (balanceDate, balanceFetchedAt) => {
    reconcileAccount(
      opened.db,
      { accountId: 'giro', date: '2026-09-15', statementBalanceCents: 100000 },
      { actor: 'test' },
    );
    opened.db
      .insert(schema.bankSyncConsent)
      .values({
        id: 'consent',
        initiator: 'test',
        stateHash: 'synthetic',
        expiresAt: '2026-10-03',
        label: 'Synthetic',
        nextRunAt: '2026-10-03',
      })
      .run();
    opened.db
      .insert(schema.bankSyncAccount)
      .values({
        id: 'bank',
        consentId: 'consent',
        secret: 'synthetic',
        label: 'Synthetic',
        currency: 'EUR',
        accountId: 'giro',
        balanceCents: 90000,
        balanceDate,
        balanceFetchedAt,
      })
      .run();
    const preview = (await call('GET')).body.unchangedConfirmation;
    expect(preview.accounts).toEqual([]);
    expect(preview.excluded).toContainEqual({ id: 'giro', reason: 'bank_difference' });
  },
);

it('keeps pending work, moved bookings and unproven checks outside the quiet cohort', async () => {
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-10',
      amountCents: -100,
      status: 'pending',
      splits: [{ amountCents: -100, categoryId: 'essen' }],
    },
    { actor: 'test' },
  );
  for (const [accountId, statementBalanceCents] of [
    ['giro', 100000],
    ['spar', 0],
    ['usd', 0],
  ] as const)
    reconcileAccount(
      opened.db,
      { accountId, date: '2026-09-15', statementBalanceCents },
      { actor: 'test' },
    );
  const moved = await call('POST', '/bookings', {
    type: 'booking',
    accountId: 'spar',
    date: '2026-09-18',
    amountCents: 100,
    splits: [{ amountCents: 100, incomeTypeId: INCOME_TYPES.salary.id }],
  });
  expect(moved.status).toBe(201);
  expect((await call('PATCH', `/bookings/${moved.body.id}`, { date: '2026-10-01' })).status).toBe(
    200,
  );
  // Synthetic retained legacy check without its ceremony cannot prove a personal statement.
  opened.sqlite
    .prepare(
      'DELETE FROM audit_log WHERE entity_type = ? AND entity_id IN (SELECT id FROM account_reconciliation WHERE account_id = ?)',
    )
    .run('account_reconciliation', 'usd');
  const preview = (await call('GET')).body.unchangedConfirmation;
  expect(preview.accounts).toEqual([]);
  expect(preview.excluded).toEqual(
    expect.arrayContaining([
      { id: 'giro', reason: 'unresolved' },
      { id: 'spar', reason: 'changed_since_check' },
      { id: 'usd', reason: 'incomplete_history' },
    ]),
  );
});

it('requires a reason only for an individual residual adjustment and rolls back a missing reason', async () => {
  const revision = (await call('GET')).body.sourceRevision;
  const body = {
    date: '2026-09-30',
    statementBalanceCents: 99900,
    adjust: true,
    categoryId: 'essen',
    sourceRevision: revision,
  };
  const before = opened.db.select().from(schema.auditLog).all().length;
  expect(
    (await call('POST', '/month-close/2026-09/accounts/giro/reconciliation', body)).status,
  ).toBe(400);
  expect(opened.db.select().from(schema.auditLog).all()).toHaveLength(before);
  expect(opened.db.select().from(schema.booking).all()).toHaveLength(0);
  const saved = await call('POST', '/month-close/2026-09/accounts/giro/reconciliation', {
    ...body,
    note: 'Synthetic residual',
  });
  expect(saved.status).toBe(201);
  expect(saved.body.result.differenceCents).toBe(-100);
  expect((await call('POST', '/undo', { groupId: saved.body.result.groupId })).status).toBe(200);
  expect(
    opened.db.select().from(schema.booking).where(isNull(schema.booking.deletedAt)).all(),
  ).toHaveLength(0);
  const noDifference = await call('POST', '/month-close/2026-09/accounts/giro/reconciliation', {
    date: '2026-09-30',
    statementBalanceCents: 100000,
    sourceRevision: (await call('GET')).body.sourceRevision,
  });
  expect(noDifference.status).toBe(201);
});

it('rolls back the complete quiet group if a later canonical reconciliation fails', async () => {
  for (const [accountId, statementBalanceCents] of [
    ['giro', 100000],
    ['spar', 0],
  ] as const)
    reconcileAccount(
      opened.db,
      { accountId, date: '2026-09-15', statementBalanceCents },
      { actor: 'test' },
    );
  const checks = opened.db.select().from(schema.accountReconciliation).all();
  const accounts = opened.db.select().from(schema.account).all();
  const audits = opened.db.select().from(schema.auditLog).all();
  opened.sqlite.exec(`CREATE TRIGGER synthetic_later_failure BEFORE INSERT ON account_reconciliation
    WHEN NEW.account_id = 'spar' AND NEW.date = '2026-09-30'
    BEGIN SELECT RAISE(ABORT, 'Synthetic canonical reconciliation failure'); END;`);
  expect((await confirmQuiet()).status).toBe(422);
  expect(opened.db.select().from(schema.accountReconciliation).all()).toEqual(checks);
  expect(opened.db.select().from(schema.account).all()).toEqual(accounts);
  expect(opened.db.select().from(schema.auditLog).all()).toEqual(audits);
});

it('retains report figures and close time idempotently and fences a source change followed by Undo', async () => {
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-12',
      amountCents: -400,
      splits: [{ amountCents: -400, categoryId: 'essen' }],
    },
    { actor: 'test' },
  );
  expect(
    (
      await call('PUT', '/budget/2026-09/assigned', {
        items: [{ categoryId: 'miete', assignedCents: 99600 }],
      })
    ).status,
  ).toBe(200);
  const before = (await call('GET')).body;
  expect(
    (
      await call('PATCH', undefined, {
        decisions: before.work.map((w: any) => ({ ...w, reason: 'Synthetic deferred review' })),
      })
    ).status,
  ).toBe(200);
  const ready = (await call('GET')).body;
  const report = monthOnePager(opened.db, '2026-10-02', '2026-09');
  expect(ready.result.report).toEqual(JSON.parse(JSON.stringify(report)));
  expect(ready.result).toMatchObject({
    checkedAccounts: 0,
    totalAccounts: 3,
    deferredAccounts: 3,
    assignedCents: 99600,
    overspentCents: 400,
    overspentCount: 1,
    carryInCents: 400,
  });
  expect(ready.result.report.result).toMatchObject({
    earnedCents: 0,
    consumptionCents: 400,
    savedCents: -400,
    savingsRateBp: null,
  });
  expect(ready.result.report.pace.figures.spentCents).toBe(400);
  expect((await call('PATCH', undefined, { close: true })).status).toBe(400);
  const closed = await call('PATCH', undefined, {
    close: true,
    sourceRevision: ready.sourceRevision,
  });
  expect(closed.status).toBe(200);
  const saved = (await call('GET')).body;
  expect(saved.close.changedSinceClose).toBe(false);
  expect(saved.state.snapshot).toMatchObject({
    version: 1,
    sourceRevision: ready.sourceRevision,
    assignedCents: 99600,
    overspentCents: 400,
    carryInCents: 400,
    spentCents: 400,
    savingsRateBp: null,
  });
  const auditCount = opened.db.select().from(schema.auditLog).all().length;
  const again = await call('PATCH', undefined, {
    close: true,
    sourceRevision: ready.sourceRevision,
  });
  expect(again.status).toBe(200);
  expect(again.body.changedCount).toBe(0);
  expect((await call('GET')).body.state).toEqual(saved.state);
  expect(opened.db.select().from(schema.auditLog).all()).toHaveLength(auditCount);
  // Closing alone did not reconcile or lock the existing booking.
  const bookingId = opened.db.select().from(schema.booking).get()!.id;
  const edit = await call('PATCH', `/bookings/${bookingId}`, {
    amountCents: -500,
    splits: [{ amountCents: -500, categoryId: 'essen' }],
  });
  expect(edit.status).toBe(200);
  expect((await call('POST', '/undo', { groupId: edit.body.groupId })).status).toBe(200);
  const changed = (await call('GET')).body;
  expect(changed.close.changedSinceClose).toBe(true);
  expect(changed.state.snapshot).toEqual(saved.state.snapshot);
  expect(changed.sourceRevision).not.toBe(ready.sourceRevision);
  const afterUndoCount = opened.db.select().from(schema.auditLog).all().length;
  expect(
    (await call('PATCH', undefined, { close: true, sourceRevision: ready.sourceRevision })).status,
  ).toBe(409);
  expect(opened.db.select().from(schema.auditLog).all()).toHaveLength(afterUndoCount);
  expect((await call('POST', '/undo', { groupId: closed.body.groupId })).status).toBe(200);
  expect((await call('GET')).body.state.snapshot).toBeUndefined();
});

it('lists every open booking-based account and manual assets in month close', async () => {
  const types = [
    'checking',
    'cash',
    'savings',
    'credit_card',
    'loan',
    'other_liability',
    'brokerage',
    'crypto',
    'p2p',
    'other_asset',
  ] as const;
  for (const type of types) {
    createEntity(
      opened.db,
      schema.account,
      {
        id: `open-${type}`,
        name: `Muster ${type}`,
        type,
        role: 'investment',
        onBudget: false,
        openingDate: '2026-09-01',
      },
      { actor: 'test' },
    );
  }
  for (const [id, extra] of [
    ['closed', { closedAt: '2026-09-20' }],
    ['future', { openingDate: '2026-10-01' }],
    ['receivable', { type: 'receivable' as const }],
  ] as const) {
    createEntity(
      opened.db,
      schema.account,
      {
        id,
        name: 'Muster ausgeschlossen',
        type: 'checking',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-09-01',
        ...extra,
      },
      { actor: 'test' },
    );
  }
  const result = (await call('GET')).body;
  expect(
    result.accounts
      .filter((a: any) => a.id.startsWith('open-'))
      .map((a: any) => a.id)
      .sort(),
  ).toEqual(types.map((type) => `open-${type}`).sort());
  expect(result.accounts.some((a: any) => ['closed', 'future', 'receivable'].includes(a.id))).toBe(
    false,
  );
  expect(result.accounts.find((a: any) => a.id === 'open-brokerage').manual).toBe(false);
  expect(result.accounts.find((a: any) => a.id === 'open-p2p').manual).toBe(true);
});

it('exposes the latest live manual value and date as of the requested day, including undo', async () => {
  const created = await call('POST', '/accounts', {
    name: 'Musteranlage Datum',
    type: 'other_asset',
    openingDate: '2026-09-01',
    openingBalanceCents: 700,
  });
  const id = created.body.account.id;
  const get = async (day: string) =>
    (await call('GET', `/accounts?asOf=${day}`)).body.accounts.find((a: any) => a.id === id);
  expect(await get('2026-09-30')).toMatchObject({ lastValuedOn: null, manualValueCents: 700 });
  await call('PUT', `/accounts/${id}/valuation`, { date: '2026-09-15', valueCents: 12500 });
  const latest = await call('PUT', `/accounts/${id}/valuation`, {
    date: '2026-09-30',
    valueCents: 15001,
  });
  expect(await get('2026-09-29')).toMatchObject({
    lastValuedOn: '2026-09-15',
    manualValueCents: 12500,
  });
  expect(await get('2026-09-30')).toMatchObject({
    lastValuedOn: '2026-09-30',
    manualValueCents: 15001,
  });
  expect((await call('POST', '/undo', { groupId: latest.body.groupId })).status).toBe(200);
  expect(await get('2026-09-30')).toMatchObject({
    lastValuedOn: '2026-09-15',
    manualValueCents: 12500,
  });
});

it('plans to zero via the existing bulk API and undoes all groups without booking forecast income', async () => {
  createEntity(
    opened.db,
    schema.categoryGroup,
    { id: 'g2', name: 'Musterzukunft' },
    { actor: 'test' },
  );
  createEntity(
    opened.db,
    schema.category,
    { id: 'zukunft', name: 'Musterreserve', groupId: 'g2', class: 'future' },
    { actor: 'test' },
  );
  createExpectedPayment(
    opened.db,
    {
      name: 'Mustereinnahme',
      kind: 'inflow',
      accountId: 'giro',
      incomeTypeId: INCOME_TYPES.salary.id,
      dueDay: 15,
      dateShift: 'before',
      startDate: '2026-10-01',
    },
    { validFrom: '2026-10-01', amountCents: 200000 },
    { actor: 'test' },
    '2026-10-02',
  );
  const before = (await call('GET')).body;
  expect(before.nextPlan.month).toBe('2026-10');
  expect(before.nextPlan.payday).toBe('2026-10-15');
  expect(before.nextPlan.budget.incomeTargets.expectedCents).toBe(200000);
  expect(before.steps[3].status).toBe('open');
  expect(before.nextPlan.budget.summary.toBeAssignedCents).toBe(100000);
  const first = await call('PUT', '/budget/2026-10/assigned', {
    closeMonth: '2026-09',
    items: [{ categoryId: 'miete', assignedCents: 60000 }],
  });
  expect(first.status).toBe(200);
  const saved = await call('PUT', '/budget/2026-10/assigned', {
    closeMonth: '2026-09',
    items: [{ categoryId: 'zukunft', assignedCents: 40000 }],
  });
  expect(saved.status).toBe(200);
  expect(saved.body.groupId).toBe(first.body.groupId);
  const after = (await call('GET')).body;
  expect(after.nextPlan.budget.summary.toBeAssignedCents).toBe(0);
  expect(after.steps[3].status).toBe('done');
  expect(opened.db.select().from(schema.booking).all()).toHaveLength(0);
  expect((await call('POST', '/undo', { groupId: saved.body.groupId })).status).toBe(200);
  expect((await call('GET')).body.nextPlan.budget.summary.toBeAssignedCents).toBe(100000);
  expect((await call('GET', '/budget/2026-10')).body.summary.assignedCents).toBe(0);
  const reapplied = await call('PUT', '/budget/2026-10/assigned', {
    closeMonth: '2026-09',
    items: [{ categoryId: 'miete', assignedCents: 100000 }],
  });
  expect(reapplied.status).toBe(200);
  expect(reapplied.body.groupId).not.toBe(saved.body.groupId);
});

it('stores an undoable close marker only after all work and next-month distribution are complete', async () => {
  expect(
    (
      await call('PATCH', undefined, {
        close: true,
        sourceRevision: (await call('GET')).body.sourceRevision,
      })
    ).status,
  ).toBe(409);
  const before = (await call('GET')).body;
  await call('PATCH', undefined, {
    decisions: before.work.map((w: any) => ({ ...w, reason: 'Musterprüfung folgt' })),
  });
  expect(
    (
      await call('PATCH', undefined, {
        close: true,
        sourceRevision: (await call('GET')).body.sourceRevision,
      })
    ).status,
  ).toBe(409);
  await call('PUT', '/budget/2026-10/assigned', {
    items: [{ categoryId: 'miete', assignedCents: 100000 }],
  });
  const closed = await call('PATCH', undefined, {
    close: true,
    sourceRevision: (await call('GET')).body.sourceRevision,
  });
  expect(closed.status).toBe(200);
  expect((await call('GET')).body.state.closedOn).toBe('2026-10-02');
  expect((await call('GET')).body.steps[4].status).toBe('done');
  expect((await call('PATCH', undefined, { closedOn: '2026-09-30' })).status).toBe(400);
  const edit = await call('POST', '/bookings', {
    type: 'booking',
    accountId: 'giro',
    date: '2026-09-18',
    amountCents: -100,
    splits: [{ amountCents: -100, categoryId: 'essen' }],
  });
  expect(edit.status).toBe(201);
  const reopened = await call('GET');
  expect(reopened.status).toBe(200);
  expect(reopened.body.state.closedOn).toBe('2026-10-02');
  expect(reopened.body.steps[1].status).toBe('open');
  expect(reopened.body.steps[2].status).toBe('open');
  expect(reopened.body.accounts.find((account: any) => account.id === 'giro').balanceCents).toBe(
    99900,
  );
  expect((await call('POST', '/undo', { groupId: edit.body.groupId })).status).toBe(200);
  expect((await call('POST', '/undo', { groupId: closed.body.groupId })).status).toBe(200);
  expect((await call('GET')).body.state.closedOn).toBeUndefined();
  expect(
    (
      await call('PATCH', '/month-close/2026-10', {
        close: true,
        sourceRevision: (await call('GET', '/month-close/2026-10')).body.sourceRevision,
      })
    ).status,
  ).toBe(409);
});

it('renders a review for a newly tracked month with no household income', () => {
  const fresh = createTestDatabase();
  try {
    createEntity(
      fresh.db,
      schema.account,
      {
        id: 'a',
        name: 'Musterkonto',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-09-01',
        openingBalanceCents: 10000,
      },
      { actor: 'test' },
    );
    createEntity(
      fresh.db,
      schema.categoryGroup,
      { id: 'g', name: 'Mustergruppe' },
      { actor: 'test' },
    );
    createEntity(
      fresh.db,
      schema.category,
      { id: 'c', name: 'Musterbedarf', groupId: 'g', class: 'need' },
      { actor: 'test' },
    );
    createBooking(
      fresh.db,
      {
        accountId: 'a',
        date: '2026-09-12',
        amountCents: -400,
        splits: [{ amountCents: -400, categoryId: 'c' }],
      },
      { actor: 'test' },
    );
    createEntity(
      fresh.db,
      schema.account,
      {
        id: 'v',
        name: 'Musteranlage',
        type: 'p2p',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-09-01',
      },
      { actor: 'test' },
    );
    createEntity(
      fresh.db,
      schema.valuation,
      { accountId: 'v', date: '2026-09-30', valueCents: 12500 },
      { actor: 'test' },
    );
    const report = monthOnePager(fresh.db, '2026-10-02', '2026-09');
    expect(report.result).toMatchObject({
      earnedCents: 0,
      consumptionCents: 400,
      savedCents: -400,
    });
    expect(report.netWorth).toMatchObject({ cents: 22100, deltaCents: 22100 });
  } finally {
    fresh.close();
  }
});

it('derives monthly inbox, unreconciled accounts and overspending without booking anything', async () => {
  createBooking(
    opened.db,
    { accountId: 'giro', date: '2026-09-12', amountCents: -1250, splits: [{ amountCents: -1250 }] },
    { actor: 'test' },
  );
  createBooking(
    opened.db,
    { accountId: 'giro', date: '2026-10-01', amountCents: -50, splits: [{ amountCents: -50 }] },
    { actor: 'test' },
  );
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-14',
      amountCents: -400,
      splits: [{ amountCents: -400, categoryId: 'essen' }],
    },
    { actor: 'test' },
  );
  const result = await call('GET');
  expect(result.status).toBe(200);
  expect(result.body.steps.map((s: any) => [s.status, s.openCount])).toEqual([
    ['open', 1],
    ['open', 3],
    ['open', 1],
    ['open', 1],
    ['open', 0],
  ]);
  expect(result.body.inbox.map((e: any) => e.date)).toEqual(['2026-09-12']);
  expect(result.body.overspent[0].overspentCents).toBe(400);
});

it('resumes reasoned exceptions after recreating the API and reopens changed work; undo restores state', async () => {
  const before = (await call('GET')).body;
  const decisions = before.work
    .filter((w: any) => w.step === 2)
    .map((w: any) => ({ ...w, reason: 'Kein Abgleich erforderlich' }));
  const saved = await call('PATCH', undefined, { currentStep: 3, decisions });
  expect(saved.status).toBe(200);
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-10-02',
    stepUp: async (_c, next) => next(),
  });
  const resumed = (await call('GET')).body;
  expect(resumed.state.currentStep).toBe(3);
  expect(resumed.steps[1].status).toBe('skipped');
  expect(resumed.steps[1].reasons).toContain('Kein Abgleich erforderlich');
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-10-03',
      amountCents: -200,
      splits: [{ amountCents: -200, categoryId: 'essen' }],
    },
    { actor: 'test' },
  );
  expect((await call('GET')).body.steps[1].status).toBe('skipped');
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-15',
      amountCents: -100,
      splits: [{ amountCents: -100, categoryId: 'essen' }],
    },
    { actor: 'test' },
  );
  expect((await call('GET')).body.steps[1].openCount).toBe(1);
  expect((await call('POST', '/undo', { groupId: saved.body.groupId })).status).toBe(200);
  expect((await call('GET')).body.state.currentStep).toBe(1);
});

it('uses actual month-end reconciliations and manual valuations for account completion', async () => {
  reconcileAccount(
    opened.db,
    { accountId: 'giro', date: '2026-09-30', statementBalanceCents: 100000 },
    { actor: 'test' },
  );
  reconcileAccount(
    opened.db,
    { accountId: 'spar', date: '2026-09-29', statementBalanceCents: 0 },
    { actor: 'test' },
  );
  createEntity(
    opened.db,
    schema.account,
    {
      id: 'manual',
      name: 'Anlage Muster',
      type: 'p2p',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-09-01',
    },
    { actor: 'test' },
  );
  expect((await call('GET')).body.steps[1].openCount).toBe(3);
  const saved = await call('PUT', '/accounts/manual/valuation', {
    date: '2026-09-30',
    valueCents: 12345,
  });
  expect(saved.status).toBe(200);
  expect((await call('GET')).body.steps[1].openCount).toBe(2);
  expect(
    (await call('GET', '/accounts?asOf=2026-09-30')).body.accounts.find(
      (a: any) => a.id === 'manual',
    ).valueEurCents,
  ).toBe(12345);
  expect((await call('POST', '/undo', { groupId: saved.body.groupId })).status).toBe(200);
  expect((await call('GET')).body.steps[1].openCount).toBe(3);
  expect(
    (await call('GET', '/accounts?asOf=2026-09-30')).body.accounts.find(
      (a: any) => a.id === 'manual',
    ).valueEurCents,
  ).toBe(0);
  expect(
    (await call('PUT', '/accounts/manual/valuation', { date: '2026-09-30', valueCents: 23456 }))
      .status,
  ).toBe(200);
});

it('rejects malformed months, fabricated completion, blank reasons, stale exceptions and future valuations', async () => {
  expect((await call('GET', '/month-close/2026-13')).status).toBe(400);
  expect((await call('PATCH', undefined, { status: 'done' })).status).toBe(400);
  expect(
    (
      await call('PATCH', undefined, {
        decisions: [{ step: 2, id: 'giro', fingerprint: 'stale', reason: ' ' }],
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call('PATCH', undefined, {
        decisions: [{ step: 2, id: 'giro', fingerprint: 'stale', reason: 'Später prüfen' }],
      })
    ).status,
  ).toBe(409);
  expect(
    (await call('PUT', '/accounts/giro/valuation', { date: '2026-10-03', valueCents: 10 })).status,
  ).toBe(422);
});

it('includes late fetched candidates by booking month and all open credit cards', async () => {
  opened.db
    .insert(schema.bankSyncCandidate)
    .values({
      id: 'late-candidate',
      accountId: 'giro',
      dedupeKey: 'synthetic-late',
      date: '2026-09-30',
      amountCents: -50,
      currency: 'EUR',
      memo: 'Synthetic candidate',
    })
    .run();
  createEntity(
    opened.db,
    schema.inboxItem,
    {
      id: 'late-inbox',
      kind: 'revision',
      title: 'Umsatz prüfen',
      refType: 'bank-sync-candidate',
      refId: 'late-candidate',
    },
    { actor: 'test' },
  );
  createEntity(
    opened.db,
    schema.account,
    {
      id: 'card',
      name: 'Musterkarte',
      type: 'credit_card',
      role: 'debt',
      onBudget: false,
      openingDate: '2026-09-01',
    },
    { actor: 'test' },
  );
  const result = (await call('GET')).body;
  expect(result.inbox.map((e: any) => e.id)).toContain('late-inbox');
  expect(result.steps[1].openCount).toBe(4);
});

it('audits native manual values, preserves checked locks and rejects unsafe cent/date input', async () => {
  createEntity(
    opened.db,
    schema.account,
    {
      id: 'manual-usd',
      name: 'Musteranlage USD',
      type: 'p2p',
      role: 'investment',
      onBudget: false,
      currency: 'USD',
      openingDate: '2026-09-01',
    },
    { actor: 'test' },
  );
  opened.db
    .insert(schema.fxRate)
    .values({ date: '2026-09-30', currency: 'USD', rateMicro: 900000, source: 'manual' })
    .run();
  const saved = await call('PUT', '/accounts/manual-usd/valuation', {
    date: '2026-09-30',
    valueCents: 10001,
  });
  expect(saved.status).toBe(200);
  expect(
    (await call('GET', '/accounts?asOf=2026-09-30')).body.accounts.find(
      (a: any) => a.id === 'manual-usd',
    ).valueEurCents,
  ).toBe(9001);
  expect(
    (await call('PUT', '/accounts/manual-usd/valuation', { date: '2026-09-30', valueCents: 1.5 }))
      .status,
  ).toBe(400);
  expect(
    (await call('PUT', '/accounts/manual-usd/valuation', { date: '2026-09-31', valueCents: 100 }))
      .status,
  ).toBe(400);
  reconcileAccount(
    opened.db,
    { accountId: 'manual-usd', date: '2026-09-30', statementBalanceCents: 0 },
    { actor: 'test' },
  );
  expect(
    (await call('PUT', '/accounts/manual-usd/valuation', { date: '2026-09-30', valueCents: 20000 }))
      .status,
  ).toBe(409);
  expect(
    (await call('GET', '/accounts?asOf=2026-09-30')).body.accounts.find(
      (a: any) => a.id === 'manual-usd',
    ).valueEurCents,
  ).toBe(9001);
  expect((await call('POST', '/undo', { groupId: saved.body.groupId })).status).toBe(409);
  expect((await call('POST', '/undo', { groupId: saved.body.groupId, force: true })).status).toBe(
    409,
  );
});

it('keeps the native currency immutable after a valuation, including undo and force undo', async () => {
  createEntity(
    opened.db,
    schema.account,
    {
      id: 'valuation-currency',
      name: 'Musteranlage Währung',
      type: 'p2p',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-09-01',
    },
    { actor: 'test' },
  );
  opened.db
    .insert(schema.fxRate)
    .values({ date: '2026-09-30', currency: 'USD', rateMicro: 900000, source: 'manual' })
    .run();
  const currencyEdit = await call('PATCH', '/accounts/valuation-currency', { currency: 'USD' });
  expect(currencyEdit.status).toBe(200);
  const valued = await call('PUT', '/accounts/valuation-currency/valuation', {
    date: '2026-09-30',
    valueCents: 10001,
  });
  expect(valued.status).toBe(200);
  expect
    .soft((await call('PATCH', '/accounts/valuation-currency', { currency: 'EUR' })).status)
    .toBe(422);
  expect
    .soft((await call('POST', '/undo', { groupId: currencyEdit.body.groupId })).status)
    .toBe(409);
  expect
    .soft((await call('POST', '/undo', { groupId: currencyEdit.body.groupId, force: true })).status)
    .toBe(409);
  const account = (await call('GET', '/accounts?asOf=2026-09-30')).body.accounts.find(
    (a: any) => a.id === 'valuation-currency',
  );
  expect.soft(account.currency).toBe('USD');
  expect.soft(account.valueEurCents).toBe(9001);
  expect((await call('POST', '/undo', { groupId: valued.body.groupId })).status).toBe(200);
  expect((await call('PATCH', '/accounts/valuation-currency', { currency: 'EUR' })).status).toBe(
    422,
  );
});

it('preserves valuation dependencies when undoing an account or replaying a value', async () => {
  const created = await call('POST', '/accounts', {
    name: 'Musteranlage Abhängigkeit',
    type: 'p2p',
    openingDate: '2026-09-01',
  });
  expect(created.body.account).toMatchObject({ type: 'p2p', currency: 'EUR' });
  const id = created.body.account.id;
  const valued = await call('PUT', `/accounts/${id}/valuation`, {
    date: '2026-09-30',
    valueCents: 5000,
  });
  expect(valued.status).toBe(200);
  expect((await call('POST', '/undo', { groupId: created.body.groupId })).status).toBe(409);
  const valueUndo = await call('POST', '/undo', { groupId: valued.body.groupId });
  expect(valueUndo.status).toBe(200);
  const accountUndo = await call('POST', '/undo', { groupId: created.body.groupId });
  expect(accountUndo.status).toBe(200);
  expect((await call('POST', '/undo', { groupId: valueUndo.body.groupId })).status).toBe(409);
  expect(
    (await call('POST', '/undo', { groupId: valueUndo.body.groupId, force: true })).status,
  ).toBe(409);
  expect((await call('POST', '/undo', { groupId: accountUndo.body.groupId })).status).toBe(200);
  expect((await call('POST', '/undo', { groupId: valueUndo.body.groupId })).status).toBe(200);
  expect((await call('GET')).body.accounts.find((a: any) => a.id === id).valueCents).toBe(5000);
});

it('keeps valuations zero before the current tracking start', async () => {
  const created = await call('POST', '/accounts', {
    name: 'Musteranlage Trackingstart',
    type: 'p2p',
    openingDate: '2026-09-01',
  });
  const id = created.body.account.id;
  expect(
    (await call('PUT', `/accounts/${id}/valuation`, { date: '2026-09-30', valueCents: 5000 }))
      .status,
  ).toBe(200);
  expect((await call('PATCH', `/accounts/${id}`, { openingDate: '2026-10-01' })).status).toBe(200);
  expect(
    (await call('GET', '/accounts?asOf=2026-09-30')).body.accounts.find((a: any) => a.id === id)
      .valueEurCents,
  ).toBe(0);
  expect(
    (await call('GET', '/accounts?asOf=2026-10-01')).body.accounts.find((a: any) => a.id === id)
      .valueEurCents,
  ).toBe(5000);
});

it('persists deferral and carry reasons only for matching monthly work', async () => {
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-10',
      amountCents: -200,
      splits: [{ amountCents: -200, categoryId: 'essen' }],
    },
    { actor: 'test' },
  );
  const before = (await call('GET')).body;
  const decisions = before.work
    .filter((w: any) => w.step === 3)
    .map((w: any) => ({ ...w, reason: 'Übertrag ausdrücklich akzeptiert' }));
  expect((await call('PATCH', undefined, { currentStep: 3, decisions })).status).toBe(200);
  expect((await call('GET')).body.steps[2].status).toBe('skipped');
  expect((await call('GET', '/month-close/2026-10')).body.state).toEqual({
    currentStep: 1,
    decisions: [],
  });
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-11',
      amountCents: -100,
      splits: [{ amountCents: -100, categoryId: 'essen' }],
    },
    { actor: 'test' },
  );
  expect((await call('GET')).body.steps[2]).toMatchObject({
    status: 'open',
    openCount: 1,
    reasons: [],
  });
});

it('uses security valuation instead of a stale manual total when the account holds products', async () => {
  createEntity(
    opened.db,
    schema.account,
    {
      id: 'p2p-products',
      name: 'Musteranlage Produkte',
      type: 'p2p',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-09-01',
    },
    { actor: 'test' },
  );
  createEntity(
    opened.db,
    schema.security,
    { id: 'product', name: 'Musterprodukt', kind: 'fund' },
    { actor: 'test' },
  );
  createEntity(
    opened.db,
    schema.holding,
    {
      accountId: 'p2p-products',
      securityId: 'product',
      asOf: '2026-09-01',
      unitsE8: 100000000,
      costBasisCents: 2000,
    },
    { actor: 'test' },
  );
  opened.db
    .insert(schema.price)
    .values({ securityId: 'product', date: '2026-09-30', priceMicro: 20000000, source: 'manual' })
    .run();
  createEntity(
    opened.db,
    schema.valuation,
    { accountId: 'p2p-products', date: '2026-09-01', valueCents: 12345 },
    { actor: 'test' },
  );
  expect(
    (await call('GET', '/accounts?asOf=2026-09-30')).body.accounts.find(
      (a: any) => a.id === 'p2p-products',
    ),
  ).toMatchObject({ valueEurCents: 2000, hasHoldings: true });
  expect((await call('GET')).body.accounts.map((a: any) => a.id)).not.toContain('p2p-products');
  expect(
    (
      await call('PUT', '/accounts/p2p-products/valuation', {
        date: '2026-09-30',
        valueCents: 5000,
      })
    ).status,
  ).toBe(422);
});
