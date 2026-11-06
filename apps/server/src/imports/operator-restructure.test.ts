import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  account,
  accounts,
  appSetting,
  assignmentRule,
  auditLog,
  booking,
  bookingSplit,
  category,
  categoryGroup,
  categoryTarget,
  envelopeMonth,
  expectedPayment,
  payee,
  plannedEvent,
  savingsGoal,
  createBooking,
  createCategory,
  createCategoryGroup,
  createEntity,
  createTestDatabase,
  createTransfer,
  getAssigned,
  getBooking,
  getEntity,
  listAuditGroups,
  listEntities,
  setAssigned,
  softDeleteEntity,
  undoAuditGroups,
  updateEntity,
  type OpenedDatabase,
} from '@budget/db';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { applyRestructure, parseRestructureFile } from './operator-restructure';

const ctx = { actor: 'tester' };
const operator = { actor: 'operator' };
let opened: OpenedDatabase;
let db: OpenedDatabase['db'];
beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
});
afterEach(() => opened.close());
const run = (input: unknown, dryRun = false) =>
  applyRestructure(db, parseRestructureFile(input), operator, { dryRun });
const auditCount = () => db.select().from(auditLog).all().length;
const tables = [
  account,
  booking,
  bookingSplit,
  categoryGroup,
  category,
  envelopeMonth,
  payee,
  assignmentRule,
  expectedPayment,
  savingsGoal,
  plannedEvent,
  categoryTarget,
  appSetting,
] as const;
const snapshot = () => tables.map((table) => db.select().from(table).all());
// Undo retains created rows as tombstones and updates metadata; compare all live business values.
const liveSnapshot = () =>
  snapshot().map((rows) =>
    rows
      .filter((r) => !('deletedAt' in r) || !r.deletedAt)
      .map((r) => Object.fromEntries(Object.entries(r).filter(([key]) => key !== 'updatedAt'))),
  );

function references(id: string) {
  updateEntity(db, payee, 'p1', { defaultCategoryId: id }, ctx);
  createEntity(
    db,
    assignmentRule,
    {
      id: 'rule-synthetic',
      name: 'Synthetic rule',
      categoryId: id,
      matchJson: JSON.stringify({
        mode: 'all',
        conditions: [{ type: 'direction', direction: 'outflow' }],
      }),
      actionJson: JSON.stringify({ splits: [{ categoryId: id, shareBp: 10000 }] }),
    },
    ctx,
  );
  createEntity(
    db,
    expectedPayment,
    { id: 'expected-synthetic', name: 'Synthetic payment', categoryId: id },
    ctx,
  );
  createEntity(
    db,
    savingsGoal,
    { id: 'goal-synthetic', name: 'Synthetic goal', categoryId: id, targetCents: 900 },
    ctx,
  );
  createEntity(
    db,
    plannedEvent,
    {
      id: 'event-synthetic',
      name: 'Synthetic event',
      categoryId: id,
      date: '2026-03-01',
      amountCents: -100,
    },
    ctx,
  );
  createEntity(
    db,
    appSetting,
    {
      id: 'inflation.basket',
      value: JSON.stringify({
        [id]: { inclusion: 'always', excludedPayeeIds: [], method: null, coicop: [] },
      }),
    },
    ctx,
  );
}

describe('restructure input', () => {
  it('accepts all sections as optional', () => {
    expect(run({})).toEqual([]);
  });
  it.each([
    { unknown: [] },
    { splits: [{ splitId: 'a', category: 'Essen', amountCents: 1 }] },
    { assigned: { entries: [], expectedDeltaByMonth: { '2026-13': 0 } } },
    { openings: [{ category: 'Essen', availableCents: 1.5 }] },
    { openings: [{ category: 'Essen', availableCents: Number.MAX_SAFE_INTEGER + 1 }] },
    { assigned: { entries: [] } },
    { splits: [{ splitId: 'a', category: 'Essen', unlock: false }] },
  ])('rejects malformed input before writes: %j', (input) => {
    const before = snapshot(),
      count = auditCount();
    expect(() => run(input)).toThrow();
    expect(snapshot()).toEqual(before);
    expect(auditCount()).toBe(count);
  });
});

describe('restructure sections and undo', () => {
  it('repoints retained assignment-rule splits and restores them with undo', () => {
    references('reise');
    softDeleteEntity(db, assignmentRule, 'rule-synthetic', ctx);
    const before = getEntity(db, assignmentRule, 'rule-synthetic', { includeDeleted: true })!;
    const result = run({ merge: [{ from: 'Reise', into: 'Essen' }] });
    expect(result[0]!.status).toBe('deleted');
    const after = getEntity(db, assignmentRule, 'rule-synthetic', { includeDeleted: true })!;
    expect(after.deletedAt).toBe(before.deletedAt);
    expect(after.categoryId).toBe('essen');
    expect(JSON.parse(after.actionJson).splits[0].categoryId).toBe('essen');
    undoAuditGroups(db, [result[0]!.groupId], operator);
    expect(getEntity(db, assignmentRule, 'rule-synthetic', { includeDeleted: true })).toMatchObject(
      { ...before, updatedAt: expect.any(String) },
    );
  });
  it('checks destination collisions after repository name normalization', () => {
    const g = createCategoryGroup(db, 'Synthetic Group', ctx);
    createCategory(db, { name: 'Synthetic Category', groupId: g.id, class: 'need' }, ctx);
    const result = run({
      groups: [
        { action: 'create', name: 'Synthetic  Group' },
        { action: 'rename', group: 'Fixkosten', name: 'Synthetic\tGroup' },
      ],
      categories: [
        { action: 'create', name: 'Synthetic  Category', group: 'Synthetic Group', class: 'need' },
        { category: 'Essen', name: 'Synthetic\tCategory', group: 'Synthetic Group' },
      ],
    });
    expect(result.map((o) => o.status)).toEqual(['unchanged', 'skipped', 'skipped', 'skipped']);
    expect(result.slice(1).map((o) => o.reason)).toEqual([
      'name_taken',
      'name_taken',
      'name_taken',
    ]);
    expect(getEntity(db, category, 'essen')!.name).toBe('Essen');
  });
  it('runs every section in order, preserves ledger, lists one group and restores every reference', () => {
    const old = createCategoryGroup(db, 'Alt', ctx);
    const source = createCategory(db, { name: 'Quelle', groupId: old.id, class: 'need' }, ctx);
    const empty = createCategory(db, { name: 'Leer', groupId: old.id, class: 'want' }, ctx);
    references(source.id);
    setAssigned(db, source.id, '2026-03', 700, ctx);
    const booked = createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-01',
        amountCents: -301,
        splits: [{ categoryId: source.id, amountCents: -301 }],
      },
      ctx,
    );
    const splitId = getBooking(db, booked)!.splits[0]!.id;
    const before = liveSnapshot();
    const result = run({
      groups: [
        { action: 'create', name: 'Neu' },
        { action: 'rename', group: 'Fixkosten', name: 'Alltag' },
      ],
      categories: [
        { action: 'create', name: 'Ziel', group: 'Neu', class: 'need' },
        {
          category: 'Alltag › Essen',
          name: 'Lebensmittel',
          group: 'Neu',
          hidden: true,
          icon: '🥕',
        },
      ],
      order: [
        { group: 'Neu', categories: ['Ziel', 'Lebensmittel'] },
        { group: 'Alltag', categories: ['Reise', 'Miete', 'Auslagen'] },
        { group: 'Alt', categories: ['Quelle', 'Leer'] },
      ],
      splits: [{ splitId, category: 'Neu › Ziel' }],
      openings: [
        { category: 'Ziel', availableCents: 120 },
        { category: 'Miete', availableCents: -120 },
      ],
      assigned: {
        entries: [
          { month: '2026-03', category: 'Quelle', assignedCents: 0 },
          { month: '2026-03', category: 'Ziel', assignedCents: 700 },
        ],
        expectedDeltaByMonth: { '2026-03': 0 },
      },
      merge: [{ from: 'Quelle', into: 'Ziel' }],
      retire: [{ category: 'Leer' }, { group: 'Alt' }],
    });
    expect(result.every((o) => o.status !== 'skipped')).toBe(true);
    expect([...new Set(result.map((o) => o.section))]).toEqual([
      'groups',
      'categories',
      'order',
      'splits',
      'openings',
      'assigned',
      'merge',
      'retire',
    ]);
    const target = listEntities(db, category).find((c) => c.name === 'Ziel')!;
    expect(getBooking(db, booked)!.splits[0]!.categoryId).toBe(target.id);
    expect(getEntity(db, category, 'essen')).toMatchObject({
      name: 'Lebensmittel',
      icon: '🥕',
      sortOrder: 1,
    });
    expect(getEntity(db, category, 'essen')!.hiddenAt).not.toBeNull();
    expect(getEntity(db, category, target.id)!.openingAvailableCents).toBe(120);
    expect(getAssigned(db)).toContainEqual({
      month: '2026-03',
      categoryId: target.id,
      assignedCents: 700,
    });
    expect(getEntity(db, payee, 'p1')!.defaultCategoryId).toBe(target.id);
    expect(getEntity(db, assignmentRule, 'rule-synthetic')).toMatchObject({
      categoryId: target.id,
    });
    expect(
      JSON.parse(getEntity(db, assignmentRule, 'rule-synthetic')!.actionJson).splits[0].categoryId,
    ).toBe(target.id);
    for (const table of [expectedPayment, savingsGoal, plannedEvent])
      expect(listEntities(db, table)[0]!.categoryId).toBe(target.id);
    expect(Object.keys(JSON.parse(getEntity(db, appSetting, 'inflation.basket')!.value))).toEqual([
      target.id,
    ]);
    expect(getEntity(db, category, source.id)).toBeUndefined();
    expect(getEntity(db, category, empty.id)).toBeUndefined();
    expect(getEntity(db, categoryGroup, old.id)).toBeUndefined();
    const groups = listAuditGroups(db, { since: '2000-01-01T00:00:00.000Z' }).filter(
      (g) => g.actor === 'operator',
    );
    expect(groups).toHaveLength(1);
    expect(new Set(result.map((o) => o.groupId))).toEqual(new Set([groups[0]!.groupId]));
    undoAuditGroups(db, [groups[0]!.groupId], operator);
    expect(liveSnapshot()).toEqual(before);
  });

  it('dry run executes dependent entries and leaves every row and audit entry unchanged', () => {
    references('reise');
    const before = snapshot(),
      count = auditCount();
    const result = run(
      {
        groups: [{ action: 'create', name: 'Neu' }],
        categories: [
          { category: 'Reise', group: 'Neu', hidden: true },
          { action: 'create', name: 'Leer', group: 'Neu', class: 'want' },
        ],
        order: [
          { group: 'Neu', categories: ['Reise', 'Leer'] },
          { group: 'Fixkosten', categories: ['Miete', 'Essen', 'Auslagen'] },
        ],
        openings: [{ category: 'Essen', availableCents: 11 }],
        assigned: {
          entries: [{ month: '2026-03', category: 'Essen', assignedCents: 110001 }],
          expectedDeltaByMonth: { '2026-03': 110001 },
        },
        merge: [{ from: 'Reise', into: 'Essen' }],
        retire: [{ category: 'Leer' }, { group: 'Neu' }],
      },
      true,
    );
    expect(result.every((o) => o.status !== 'skipped' && o.groupId === '')).toBe(true);
    expect(snapshot()).toEqual(before);
    expect(auditCount()).toBe(count);
  });

  it('isolates refused entries, deletes only empty groups, and supports unhide and icon removal', () => {
    createCategoryGroup(db, 'Leer', ctx);
    const result = run({
      groups: [
        { action: 'delete', group: 'Fixkosten' },
        { action: 'delete', group: 'Leer' },
      ],
      categories: [
        { category: 'Essen', name: 'Umbenannt', hidden: true, icon: 'invalid' },
        { category: 'Reise', hidden: true, icon: '🧳' },
      ],
      retire: [{ group: 'Fixkosten' }],
    });
    expect(result.map((o) => o.status)).toEqual([
      'skipped',
      'deleted',
      'skipped',
      'updated',
      'skipped',
    ]);
    expect(getEntity(db, category, 'essen')!.name).toBe('Essen');
    run({ categories: [{ category: 'Reise', hidden: false, icon: null }] });
    expect(getEntity(db, category, 'reise')).toMatchObject({ hiddenAt: null, icon: null });
  });

  it('requires exact unambiguous names and a full sort order including hidden categories', () => {
    const g = createCategoryGroup(db, 'Andere', ctx);
    createCategory(db, { name: 'Essen', groupId: g.id, class: 'need' }, ctx);
    const result = run({
      categories: [
        { category: 'essen', hidden: true },
        { category: 'Essen', hidden: true },
        { category: 'Andere › Essen', hidden: true },
      ],
      order: [{ group: 'Andere', categories: ['Andere › Essen'] }],
    });
    expect(result.map((o) => o.reason)).toEqual([
      'unknown_category',
      'ambiguous_category',
      '',
      'incomplete_order',
    ]);
    expect(listEntities(db, categoryGroup).find((r) => r.id === g.id)!.sortOrder).toBe(1);
  });

  it('refuses nonempty merges and referenced retirement, rolling back basket conflicts', () => {
    references('reise');
    updateEntity(
      db,
      appSetting,
      'inflation.basket',
      { value: JSON.stringify({ reise: { inclusion: 'always' }, essen: { inclusion: 'never' } }) },
      ctx,
    );
    setAssigned(db, 'miete', '2026-03', -1, ctx);
    const before = snapshot(),
      count = auditCount();
    expect(
      run({
        merge: [
          { from: 'Miete', into: 'Essen' },
          { from: 'Reise', into: 'Essen' },
        ],
        retire: [{ category: 'Reise' }],
      }).map((o) => o.reason),
    ).toEqual(['category_not_empty', 'basket_conflict', 'category_referenced']);
    expect(snapshot()).toEqual(before);
    expect(auditCount()).toBe(count);
  });
});

describe('assignment section invariants', () => {
  it('sets exact signed cents above available money only with the explicit expected delta', () => {
    const result = run({
      assigned: {
        entries: [
          { month: '2026-03', category: 'Essen', assignedCents: 250001 },
          { month: '2026-03', category: 'Reise', assignedCents: -1 },
        ],
        expectedDeltaByMonth: { '2026-03': 250000 },
      },
    });
    expect(result[0]!.status).toBe('updated');
    expect(getAssigned(db)).toEqual([
      { categoryId: 'essen', month: '2026-03', assignedCents: 250001 },
      { categoryId: 'reise', month: '2026-03', assignedCents: -1 },
    ]);
  });
  it.each([
    {
      entries: [{ month: '2026-03', category: 'Essen', assignedCents: 1 }],
      expectedDeltaByMonth: { '2026-03': 0 },
    },
    {
      entries: [{ month: '2026-03', category: 'Essen', assignedCents: 1 }],
      expectedDeltaByMonth: {},
    },
    {
      entries: [
        { month: '2026-03', category: 'Essen', assignedCents: 1 },
        { month: '2026-04', category: 'Reise', assignedCents: -1 },
      ],
      expectedDeltaByMonth: { '2026-03': 0, '2026-04': 0 },
    },
    {
      entries: [
        { month: '2026-03', category: 'Essen', assignedCents: 1 },
        { month: '2026-03', category: 'Missing', assignedCents: -1 },
      ],
      expectedDeltaByMonth: { '2026-03': 0 },
    },
    {
      entries: [
        { month: '2026-03', category: 'Essen', assignedCents: 1 },
        { month: '2026-03', category: 'Fixkosten › Essen', assignedCents: 1 },
      ],
      expectedDeltaByMonth: { '2026-03': 1 },
    },
  ])('refuses the whole section without cancelling other sections: %j', (assigned) => {
    const result = run({ assigned, openings: [{ category: 'Essen', availableCents: 10 }] });
    expect(result.map((o) => o.status)).toEqual(['updated', 'skipped']);
    expect(getAssigned(db)).toEqual([]);
    expect(
      db.select().from(auditLog).where(eq(auditLog.entityType, 'envelope_month')).all(),
    ).toEqual([]);
    expect(getEntity(db, category, 'essen')!.openingAvailableCents).toBe(10);
  });
});

describe('split recategorisation', () => {
  it.each([true, false])(
    'refuses a card-payment destination (existing category: %s)',
    (categorised) => {
      accounts.create(
        db,
        {
          id: 'synthetic-card',
          name: 'Synthetic card',
          type: 'credit_card',
          role: 'budget',
          onBudget: true,
          openingDate: '2023-10-01',
        },
        ctx,
      );
      createCategory(
        db,
        {
          name: 'Synthetic card payment',
          groupId: 'g',
          kind: 'card_payment',
          cardAccountId: 'synthetic-card',
        },
        ctx,
      );
      const id = createBooking(
        db,
        {
          accountId: 'giro',
          date: '2026-03-01',
          amountCents: -101,
          splits: [{ amountCents: -101, categoryId: categorised ? 'essen' : null }],
        },
        ctx,
      );
      const before = snapshot(),
        count = auditCount();
      const splitId = getBooking(db, id)!.splits[0]!.id;
      expect(run({ splits: [{ splitId, category: 'Synthetic card payment' }] })[0]!.reason).toBe(
        'card_category',
      );
      expect(snapshot()).toEqual(before);
      expect(auditCount()).toBe(count);
    },
  );

  it('refuses to move a contact share out of its advance category', () => {
    const id = createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-01',
        amountCents: -101,
        splits: [{ amountCents: -101, categoryId: 'auslagen', contactId: 'k1' }],
      },
      ctx,
    );
    const before = snapshot(),
      count = auditCount();
    expect(
      run({ splits: [{ splitId: getBooking(db, id)!.splits[0]!.id, category: 'Essen' }] })[0]!
        .reason,
    ).toBe('contact_category');
    expect(snapshot()).toEqual(before);
    expect(auditCount()).toBe(count);
  });
  it.each(['whole', 'split', 'uncategorised'] as const)(
    'moves %s transfer legs, requires unlock and preserves both sides on dry-run and undo',
    (kind) => {
      accounts.create(
        db,
        {
          id: 'tracking',
          name: 'Synthetic tracking',
          type: 'savings',
          role: 'reserve',
          openingDate: '2023-10-01',
          onBudget: false,
          currency: 'EUR',
        },
        ctx,
      );
      const bookingId =
        kind === 'split'
          ? createBooking(
              db,
              {
                accountId: 'giro',
                date: '2026-03-01',
                amountCents: -501,
                status: 'reconciled',
                splits: [
                  { amountCents: -201, categoryId: 'essen' },
                  { amountCents: -300, categoryId: 'reise', transferAccountId: 'tracking' },
                ],
              },
              ctx,
            )
          : createTransfer(
              db,
              {
                fromAccountId: 'giro',
                toAccountId: 'tracking',
                date: '2026-03-01',
                amountCents: 300,
                status: 'reconciled',
                ...(kind === 'whole' && { categoryId: 'reise' }),
              },
              ctx,
            ).fromBookingId;
      const b = getBooking(db, bookingId)!;
      const splitId = b.splits[kind === 'split' ? 1 : 0]!.id;
      const before = snapshot(),
        count = auditCount();
      expect(run({ splits: [{ splitId, category: 'Miete' }] })[0]!.reason).toBe(
        'reconciled_locked',
      );
      const file = { splits: [{ splitId, category: 'Miete', unlock: true }] };
      expect(run(file, true)[0]!.status).toBe('updated');
      expect(snapshot()).toEqual(before);
      expect(auditCount()).toBe(count);
      const result = run(file);
      expect(result[0]!.status).toBe('updated');
      expect(getBooking(db, bookingId)!.splits.find((s) => s.id === splitId)!.categoryId).toBe(
        'miete',
      );
      expect(db.select().from(booking).all()).toEqual(before[1]);
      expect(db.select().from(account).all()).toEqual(before[0]);
      undoAuditGroups(db, [result[0]!.groupId], operator);
      expect(snapshot()).toEqual(before);
    },
  );
});
