import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { undo } from './audit';
import { assignMany, coverAllOverspending, coverOverspending } from './budget';
import { createBooking } from './bookings';
import { createExpectedPayment, linkOccurrence } from './expected';
import { expectedOccurrence } from '../schema';
import { planMonthViews } from './plan-months';
import { accounts, categories } from './entities';
import { seedBasics, testCtx as ctx } from './test-helpers';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const today = '2026-10-05';
const month = '2026-10';

it('caps individual and bulk covers at free money, keeps commitments and undoes the capped move', () => {
  const db = opened.db;
  assignMany(db, month, [{ categoryId: 'miete', assignedCents: 10000 }], ctx);
  createBooking(
    db,
    {
      accountId: 'giro',
      date: today,
      amountCents: -8000,
      splits: [{ categoryId: 'essen', amountCents: -8000 }],
    },
    ctx,
  );
  createBooking(
    db,
    {
      accountId: 'giro',
      date: '2026-10-08',
      status: 'pending',
      amountCents: -2000,
      splits: [{ categoryId: 'miete', amountCents: -2000 }],
    },
    ctx,
  );
  createExpectedPayment(
    db,
    {
      name: 'Testzahlung',
      accountId: 'giro',
      categoryId: 'miete',
      startDate: '2026-10-01',
      dueDay: 10,
    },
    { validFrom: '2026-10-01', amountCents: 3500 },
    ctx,
    today,
  );
  const view = () => planMonthViews(db, [month], {}, today)[month]!;
  expect(view().summary.envelopes.find((e) => e.categoryId === 'miete')).toMatchObject({
    availableCents: 8000,
    committedCents: 5500,
    freeCents: 2500,
  });
  const cover = coverOverspending(db, month, 'essen', 'miete', ctx, { today });
  expect(cover.coveredCents).toBe(2500);
  expect(view().summary.envelopes.find((e) => e.categoryId === 'miete')?.freeCents).toBe(0);
  undo(db, { groupId: cover.groupId }, ctx);
  const bulk = coverAllOverspending(db, month, 'miete', ctx, today);
  expect(bulk).toMatchObject({ openCount: 1, missingCents: 5500 });
  expect(() => coverOverspending(db, month, 'essen', 'miete', ctx, { today })).toThrow(/frei/);
});

it('does not reserve an occurrence again after its pending booking was linked', () => {
  const db = opened.db;
  assignMany(db, month, [{ categoryId: 'miete', assignedCents: 10000 }], ctx);
  const { payment } = createExpectedPayment(
    db,
    {
      name: 'Testzahlung',
      accountId: 'giro',
      categoryId: 'miete',
      startDate: '2026-10-01',
      dueDay: 10,
    },
    { validFrom: '2026-10-01', amountCents: 3000 },
    ctx,
    today,
  );
  const book = createBooking(
    db,
    {
      accountId: 'giro',
      date: '2026-10-10',
      status: 'pending',
      amountCents: -3000,
      splits: [{ categoryId: 'miete', amountCents: -3000 }],
    },
    ctx,
  );
  const occurrence = db
    .select()
    .from(expectedOccurrence)
    .all()
    .find((o) => o.expectedPaymentId === payment.id && o.dueDate === '2026-10-10')!;
  linkOccurrence(db, occurrence.id, book, ctx);
  expect(
    planMonthViews(db, [month], {}, today)[month]!.summary.envelopes.find(
      (e) => e.categoryId === 'miete',
    ),
  ).toMatchObject({ availableCents: 7000, committedCents: 3000, freeCents: 4000 });
});

it('protects a due payment on any on-budget account, including a reserve-role account', () => {
  const db = opened.db;
  assignMany(db, month, [{ categoryId: 'miete', assignedCents: 10000 }], ctx);
  createExpectedPayment(
    db,
    {
      name: 'Testreservezahlung',
      accountId: 'spar',
      categoryId: 'miete',
      startDate: '2026-10-01',
      dueDay: 10,
    },
    { validFrom: '2026-10-01', amountCents: 3000 },
    ctx,
    today,
  );
  expect(
    planMonthViews(db, [month], {}, today)[month]!.summary.envelopes.find(
      (e) => e.categoryId === 'miete',
    ),
  ).toMatchObject({ committedCents: 3000, freeCents: 7000 });
});

const envelope = (id: string) =>
  planMonthViews(opened.db, [month], {}, today)[month]!.summary.envelopes.find(
    (e) => e.categoryId === id,
  )!;

it('caps a cover at what the budget accounts hold plus the allowed overdraft', () => {
  const db = opened.db;
  accounts.update(db, 'giro', { overdraftLimitCents: 5000 }, ctx);
  assignMany(db, month, [{ categoryId: 'miete', assignedCents: 4000 }], ctx);
  createBooking(
    db,
    {
      accountId: 'giro',
      date: today,
      amountCents: -103_000,
      splits: [{ categoryId: 'essen', amountCents: -103_000 }],
    },
    ctx,
  );
  const view = planMonthViews(db, [month], {}, today)[month]!;
  expect(view.budgetMoney.coverCapCents).toBe(2000);
  expect(envelope('miete').freeCents).toBe(2000);
  expect(coverOverspending(db, month, 'essen', 'miete', ctx, { today }).coveredCents).toBe(2000);
});

it('refuses card-payment and income sources for a single cover like for bulk cover', () => {
  const db = opened.db;
  accounts.create(
    db,
    {
      id: 'kk',
      name: 'Testkarte',
      type: 'credit_card',
      role: 'budget',
      onBudget: true,
      openingDate: '2023-10-01',
      sortOrder: 4,
    },
    ctx,
  );
  categories.create(
    db,
    {
      id: 'karte',
      name: 'Karte',
      groupId: 'g',
      class: null,
      kind: 'card_payment',
      cardAccountId: 'kk',
    },
    ctx,
  );
  expect(() => coverOverspending(db, month, 'essen', 'karte', ctx, { today })).toThrow(
    'Diese Kategorie ist keine Deckungsquelle.',
  );
  expect(() => coverAllOverspending(db, month, 'karte', ctx, today)).toThrow(
    'Diese Kategorie ist keine Deckungsquelle.',
  );
});

it('does not reserve a due twice when an unlinked pending booking matches it', () => {
  const db = opened.db;
  assignMany(db, month, [{ categoryId: 'miete', assignedCents: 10000 }], ctx);
  createExpectedPayment(
    db,
    {
      name: 'Testzahlung',
      accountId: 'giro',
      categoryId: 'miete',
      startDate: '2026-10-01',
      dueDay: 12,
    },
    { validFrom: '2026-10-01', amountCents: 2000 },
    ctx,
    today,
  );
  createBooking(
    db,
    {
      accountId: 'giro',
      date: '2026-10-12',
      status: 'pending',
      amountCents: -2000,
      splits: [{ categoryId: 'miete', amountCents: -2000 }],
    },
    ctx,
  );
  expect(envelope('miete').committedCents).toBe(2000);
});

it('reports the same free amount in the view and for a single cover, due before month end', () => {
  const db = opened.db;
  assignMany(db, month, [{ categoryId: 'miete', assignedCents: 10000 }], ctx);
  createExpectedPayment(
    db,
    {
      name: 'Testzahlung',
      accountId: 'giro',
      categoryId: 'miete',
      startDate: '2026-10-01',
      dueDay: 25,
    },
    { validFrom: '2026-10-01', amountCents: 3000 },
    ctx,
    today,
  );
  createBooking(
    db,
    {
      accountId: 'giro',
      date: today,
      amountCents: -9000,
      splits: [{ categoryId: 'essen', amountCents: -9000 }],
    },
    ctx,
  );
  const free = envelope('miete').freeCents;
  expect(coverOverspending(db, month, 'essen', 'miete', ctx, { today }).coveredCents).toBe(
    Math.min(9000, free),
  );
});

it('applies commitments and the cap only to the current month', () => {
  const db = opened.db;
  assignMany(db, '2026-11', [{ categoryId: 'miete', assignedCents: 10000 }], ctx);
  const next = planMonthViews(db, ['2026-11'], {}, today)['2026-11']!;
  expect(next.summary.envelopes.find((e) => e.categoryId === 'miete')).toMatchObject({
    committedCents: 0,
  });
});
