import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { auditLog, booking, category, categoryGroup, project } from '../schema';
import { createBooking, createTransfer, getBooking, deleteBooking } from './bookings';
import { accounts, categories, createEntity, softDeleteEntity, updateEntity } from './entities';
import { applyOwnerConfig, parseOwnerConfigFile } from './operator-owner-config';
import { undoAuditGroups } from './operator-ops';
import { readProjects, projectsList } from './payroll-projects';
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
