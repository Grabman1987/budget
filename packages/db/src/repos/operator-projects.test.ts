import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as contactInvariants from './contact-invariants';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  account,
  accountReconciliation,
  auditLog,
  booking,
  category,
  categoryGroup,
  project,
} from '../schema';
import { createBooking, createTransfer, getBooking, deleteBooking } from './bookings';
import { accounts, categories, createEntity, softDeleteEntity, updateEntity } from './entities';
import { applyOwnerConfig, parseOwnerConfigFile } from './operator-owner-config';
import { undoAuditGroups } from './operator-ops';
import { readProjects, projectsList } from './payroll-projects';
import { bookedBalance, reconcileAccount } from './reconciliation';
import { seedBasics, testCtx } from './test-helpers';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];
const operator = { actor: 'operator' };
beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
});
afterEach(() => opened.close());
const config = {
  projects: [{ name: 'Synthetic Project', note: 'Synthetic note', attributeCategory: 'Essen' }],
};
const run = (json: unknown = config, dryRun = false) =>
  applyOwnerConfig(db, parseOwnerConfigFile(json), operator, { dryRun });
const expense = (amountCents: number, extra: Partial<Parameters<typeof createBooking>[1]> = {}) =>
  createBooking(
    db,
    {
      accountId: 'giro',
      date: '2026-02-10',
      amountCents,
      splits: [{ categoryId: 'essen', amountCents }],
      ...extra,
    },
    testCtx,
  );

it('creates and attributes through one operator group, dry-runs, reruns and undoes without changing money', () => {
  const a = expense(-1201);
  const b = expense(-799, {
    splits: [
      { categoryId: 'essen', amountCents: -301 },
      { categoryId: 'essen', amountCents: -498 },
    ],
  });
  const deleted = expense(-900);
  deleteBooking(db, deleted, testCtx);
  const before = [getBooking(db, a), getBooking(db, b)];
  const count = db.select().from(auditLog).all().length;
  expect(run(config, true).map((o) => o.status)).toEqual(['created', 'updated', 'updated']);
  expect(projectsList(db)).toEqual([]);
  expect(db.select().from(auditLog).all()).toHaveLength(count);
  const real = run();
  expect(real.map((o) => o.status)).toEqual(['created', 'updated', 'updated']);
  const id = projectsList(db)[0]!.id;
  expect(projectsList(db)[0]).toMatchObject({ name: 'Synthetic Project', note: 'Synthetic note' });
  expect(getBooking(db, deleted, { includeDeleted: true })!.projectId).toBeNull();
  expect(getBooking(db, a)!.projectId).toBe(id);
  expect(getBooking(db, b)!.projectId).toBe(id);
  for (const [index, bookingId] of [a, b].entries()) {
    const after = getBooking(db, bookingId)!;
    expect(after).toMatchObject({
      amountCents: before[index]!.amountCents,
      date: before[index]!.date,
      accountId: before[index]!.accountId,
      status: before[index]!.status,
    });
    expect(after.splits).toEqual(before[index]!.splits);
  }
  // Report 1.9 reads the literal -1201 -301 -498 = -2000 cents.
  expect(readProjects(db, '2026-02..2026-02', '2026-03-20').projects[0]).toMatchObject({
    resultCents: -2000,
    costCents: 2000,
  });
  expect(
    run({ projects: [{ name: 'synthetic project', attributeCategory: 'Essen' }] }).map(
      (o) => o.status,
    ),
  ).toEqual(['unchanged', 'unchanged', 'unchanged']);
  const entries = db.select().from(auditLog).all().slice(count);
  expect(new Set(entries.map((o) => o.groupId))).toEqual(new Set([real[0]!.groupId]));
  expect(entries.every((o) => o.actor === 'operator')).toBe(true);
  undoAuditGroups(db, [real[0]!.groupId], operator);
  expect(projectsList(db)).toEqual([]);
  for (const [index, id] of [a, b].entries()) {
    const restored = getBooking(db, id)!;
    expect(restored).toMatchObject({
      projectId: null,
      amountCents: before[index]!.amountCents,
      date: '2026-02-10',
      accountId: 'giro',
    });
    expect(restored.splits).toEqual(before[index]!.splits);
  }
});

it('counts other projects, mixed category splits, reconciled bookings and whole/split transfers as skips', () => {
  const other = createEntity(db, project, { name: 'Synthetic Other' }, testCtx);
  const a = expense(-101, { projectId: other.id });
  const b = expense(-102, {
    splits: [
      { categoryId: 'essen', amountCents: -51 },
      { categoryId: 'reise', amountCents: -51 },
    ],
  });
  const c = expense(-103, { status: 'reconciled' });
  accounts.create(
    db,
    {
      id: 'tracking',
      name: 'Synthetic Tracking',
      type: 'savings',
      role: 'reserve',
      onBudget: false,
      openingDate: '2026-01-01',
    },
    testCtx,
  );
  const t = createTransfer(
    db,
    {
      fromAccountId: 'giro',
      toAccountId: 'tracking',
      date: '2026-02-11',
      amountCents: 104,
      categoryId: 'essen',
    },
    testCtx,
  );
  const s = expense(-105, {
    splits: [
      { categoryId: 'essen', amountCents: -5 },
      { transferAccountId: 'spar', amountCents: -100 },
    ],
  });
  const out = run();
  expect(
    out
      .filter((o) => o.status === 'skipped')
      .map((o) => o.reason)
      .sort(),
  ).toEqual(['mixed_splits', 'other_project', 'reconciled_locked', 'transfer', 'transfer']);
  expect(getBooking(db, a)!.projectId).toBe(other.id);
  for (const id of [b, c, t.fromBookingId, s]) expect(getBooking(db, id)!.projectId).toBeNull();
  expect(getBooking(db, c)!.status).toBe('reconciled');
  expect(out.find((o) => o.key === c)).toMatchObject({
    bookingDate: '2026-02-10',
    bookingAmountCents: -103,
  });
});

it('resolves exact live categories, narrows by group and ignores soft-deleted duplicate names', () => {
  createEntity(db, categoryGroup, { id: 'g2', name: 'Synthetic Group' }, testCtx);
  categories.create(db, { id: 'duplicate', name: 'Essen', groupId: 'g2', class: 'need' }, testCtx);
  const id = expense(-123);
  expect(run()[0]).toMatchObject({ status: 'skipped', reason: 'ambiguous_category' });
  expect(
    run({ projects: [{ name: 'Synthetic Project', attributeCategory: 'missing' }] })[0]!.reason,
  ).toBe('unknown_category');
  expect(projectsList(db)).toEqual([]);
  expect(
    run({
      projects: [
        {
          name: 'Synthetic Narrow',
          attributeCategory: 'Essen',
          attributeCategoryGroup: 'Fixkosten',
        },
      ],
    }).map((o) => o.status),
  ).toEqual(['created', 'updated']);
  expect(getBooking(db, id)!.projectId).not.toBeNull();
  softDeleteEntity(db, category, 'duplicate', testCtx);
  expect(run()[0]!.status).toBe('created');
  expect(
    run({ projects: [{ name: 'Synthetic Lower', attributeCategory: 'essen' }] })[0]!.reason,
  ).toBe('unknown_category');
});

it.each(['archived', 'deleted'])('never revives a %s project', (state) => {
  const p = createEntity(db, project, { name: 'Synthetic Project' }, testCtx);
  if (state === 'archived') updateEntity(db, project, p.id, { archivedAt: '2026-03-01' }, testCtx);
  else softDeleteEntity(db, project, p.id, testCtx);
  const id = expense(-123);
  expect(run()[0]).toMatchObject({ status: 'skipped', reason: 'inactive_project' });
  expect(getBooking(db, id)!.projectId).toBeNull();
  expect(db.select().from(project).all()).toHaveLength(1);
});

it('validates the complete section before applying and supports projects without attribution', () => {
  for (const projects of [
    [{ name: '' }],
    [{ name: 'A', extra: true }],
    [{ name: 'A', attributeCategoryGroup: 'G' }],
    [{ name: 'A' }, { name: 'a' }],
    [{ name: 'A', note: 1 }],
  ])
    expect(() => run({ projects })).toThrow();
  expect(run({ projects: [{ name: 'Synthetic Empty' }] }).map((o) => o.status)).toEqual([
    'created',
  ]);
  expect(
    db
      .select()
      .from(booking)
      .where(eq(booking.projectId, projectsList(db)[0]!.id))
      .all(),
  ).toEqual([]);
});

it('allows null-category companion splits because attribution covers all category splits of the booking', () => {
  const id = expense(-110, {
    splits: [
      { categoryId: 'essen', amountCents: -100 },
      { categoryId: null, amountCents: -10 },
    ],
  });
  expect(run().map((o) => o.status)).toEqual(['created', 'updated']);
  expect(getBooking(db, id)!.projectId).toBe(projectsList(db)[0]!.id);
  expect(getBooking(db, id)!.splits.map((s) => s.amountCents)).toEqual([-100, -10]);
});

it('explicitly unlocks project attribution while preserving reconciled bank rows and grouped undo', () => {
  const id = expense(-1201, {
    status: 'confirmed',
    source: 'bank',
    memo: 'Synthetic bank memo',
    splits: [
      { categoryId: 'essen', amountCents: -701 },
      { categoryId: 'essen', amountCents: -500 },
    ],
  });
  reconcileAccount(
    db,
    {
      accountId: 'giro',
      date: '2026-02-28',
      statementBalanceCents: 98799,
      today: '2026-03-01',
    },
    testCtx,
  );
  const before = getBooking(db, id)!;
  expect(before).toMatchObject({
    projectId: null,
    status: 'reconciled',
    amountCents: -1201,
    bankRawText: null,
  });
  const checks = db.select().from(accountReconciliation).all();
  expect(checks).toHaveLength(1);
  expect(checks[0]).toMatchObject({ statementBalanceCents: 98799, clearedBalanceCents: 98799 });
  const accountsBefore = db.select().from(account).all();
  const unlocked = {
    projects: [{ name: 'Synthetic Project', attributeCategory: 'Essen', unlock: true }],
  };
  const count = db.select().from(auditLog).all().length;
  expect(run(unlocked, true).map((o) => o.status)).toEqual(['created', 'updated']);
  expect(getBooking(db, id)).toEqual(before);
  expect(db.select().from(auditLog).all()).toHaveLength(count);
  const out = run(unlocked);
  expect(out.map((o) => o.status)).toEqual(['created', 'updated']);
  const projectId = projectsList(db)[0]!.id;
  const after = getBooking(db, id)!;
  expect(after).toEqual({ ...before, projectId, updatedAt: after.updatedAt });
  expect(after.status).toBe('reconciled');
  expect(db.select().from(accountReconciliation).all()).toEqual(checks);
  expect(db.select().from(account).all()).toEqual(accountsBefore);
  expect(bookedBalance(db, 'giro', '2026-02-28')).toBe(98799);
  const entries = db.select().from(auditLog).all().slice(count);
  expect(entries.map((e) => [e.entityType, e.action, e.actor, e.groupId])).toEqual([
    ['project', 'create', 'operator', out[0]!.groupId],
    ['booking', 'update', 'operator', out[0]!.groupId],
  ]);
  const auditBefore = JSON.parse(entries[1]!.beforeJson!);
  expect(JSON.parse(entries[1]!.afterJson!)).toEqual({
    ...auditBefore,
    project_id: projectId,
    updated_at: after.updatedAt,
  });
  expect(run(unlocked).map((o) => o.status)).toEqual(['unchanged', 'unchanged']);
  expect(db.select().from(auditLog).all()).toHaveLength(count + 2);
  undoAuditGroups(db, [out[0]!.groupId], operator);
  const restored = getBooking(db, id)!;
  expect(restored).toEqual({ ...before, updatedAt: restored.updatedAt });
  expect(restored).toMatchObject({ projectId: null, status: 'reconciled', amountCents: -1201 });
  expect(db.select().from(accountReconciliation).all()).toEqual(checks);
  expect(db.select().from(account).all()).toEqual(accountsBefore);
  expect(bookedBalance(db, 'giro', '2026-02-28')).toBe(98799);
});

it('reuses one project across distinct categories, reruns unchanged and undoes the whole group', () => {
  const a = expense(-101);
  const b = expense(-203, { splits: [{ categoryId: 'reise', amountCents: -203 }] });
  const input = {
    projects: [
      { name: 'Synthetic Shared', attributeCategory: 'Essen' },
      { name: 'synthetic shared', attributeCategory: 'Reise' },
    ],
  };
  const out = run(input);
  expect(out.map((o) => o.status)).toEqual(['created', 'updated', 'unchanged', 'updated']);
  expect(projectsList(db)).toHaveLength(1);
  const projectId = projectsList(db)[0]!.id;
  expect([getBooking(db, a)!.projectId, getBooking(db, b)!.projectId]).toEqual([
    projectId,
    projectId,
  ]);
  expect(readProjects(db, '2026-02..2026-02', '2026-03-20').projects[0]!.resultCents).toBe(-304);
  expect(run(input).map((o) => o.status)).toEqual([
    'unchanged',
    'unchanged',
    'unchanged',
    'unchanged',
  ]);
  undoAuditGroups(db, [out[0]!.groupId], operator);
  expect([getBooking(db, a)!.projectId, getBooking(db, b)!.projectId]).toEqual([null, null]);
  expect(projectsList(db)).toEqual([]);
});

it('rejects duplicate project/category selectors and invalid unlock before writing', () => {
  for (const projects of [
    [
      { name: 'A', attributeCategory: 'Essen' },
      { name: 'a', attributeCategory: 'Essen' },
    ],
    [
      { name: 'A', attributeCategory: 'Essen', attributeCategoryGroup: 'Fixkosten' },
      { name: 'a', attributeCategory: 'Essen', attributeCategoryGroup: 'Fixkosten' },
    ],
    [{ name: 'A', unlock: 'true' }],
    [{ name: 'A', unlock: 1 }],
  ])
    expect(() => run({ projects })).toThrow();
  expect(projectsList(db)).toEqual([]);
  expect(parseOwnerConfigFile({ projects: [{ name: 'A', unlock: false }] }).projects).toEqual([
    { name: 'A' },
  ]);
  expect(
    parseOwnerConfigFile({
      projects: [
        { name: 'A', attributeCategory: 'Essen', attributeCategoryGroup: 'Fixkosten' },
        { name: 'A', attributeCategory: 'Essen', attributeCategoryGroup: 'Synthetic Other' },
      ],
    }).projects,
  ).toHaveLength(2);
});

it('attributes 200 bookings without repeating global contact validation', () => {
  for (let i = 0; i < 200; i++) expense(-101, { status: 'reconciled' });
  const check = vi.spyOn(contactInvariants, 'assertContactSettlementInvariants');
  try {
    const out = applyOwnerConfig(
      db,
      parseOwnerConfigFile({
        projects: [{ name: 'Synthetic Project', attributeCategory: 'Essen', unlock: true }],
      }),
      operator,
      { maxBookings: 200 },
    );
    expect(out.filter((o) => o.status === 'updated')).toHaveLength(200);
    expect(check).not.toHaveBeenCalled();
    expect(
      db
        .select()
        .from(booking)
        .all()
        .every((b) => b.status === 'reconciled'),
    ).toBe(true);
  } finally {
    check.mockRestore();
  }
});

it('continues in default batches across selectors and undoes each invocation separately', () => {
  for (let i = 0; i < 28; i++) expense(-101);
  for (let i = 0; i < 3; i++)
    expense(-203, { splits: [{ categoryId: 'reise', amountCents: -203 }] });
  const input = {
    projects: [
      { name: 'Synthetic Shared', attributeCategory: 'Essen' },
      { name: 'synthetic shared', attributeCategory: 'Reise' },
    ],
  };
  const first = run(input);
  expect(first.filter((o) => o.status === 'updated')).toHaveLength(25);
  expect(first.filter((o) => o.status === 'remaining')).toHaveLength(6);
  const second = run(input);
  expect(second.filter((o) => o.status === 'updated')).toHaveLength(6);
  expect(
    second.filter((o) => o.projectAction === 'booking' && o.status === 'unchanged'),
  ).toHaveLength(25);
  expect(second.filter((o) => o.status === 'remaining')).toHaveLength(0);
  const group1 = first.find((o) => o.groupId)!.groupId;
  const group2 = second.find((o) => o.groupId)!.groupId;
  expect(group2).not.toBe(group1);
  undoAuditGroups(db, [group2], operator);
  expect(
    db
      .select()
      .from(booking)
      .all()
      .filter((b) => b.projectId),
  ).toHaveLength(25);
  undoAuditGroups(db, [group1], operator);
  expect(
    db
      .select()
      .from(booking)
      .all()
      .every((b) => b.projectId === null),
  ).toBe(true);
  expect(projectsList(db)).toEqual([]);
});
