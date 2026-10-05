import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { undo } from './audit';
import { assignMany, coverAllOverspending, coverOverspending } from './budget';
import { createBooking } from './bookings';
import { createExpectedPayment, linkOccurrence } from './expected';
import { expectedOccurrence } from '../schema';
import { planMonthViews } from './plan-months';
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
