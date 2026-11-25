import { afterEach, beforeEach, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { booking, bookingSplit, expectedOccurrence, INCOME_TYPES } from '../schema';
import { seedBasics, testCtx } from './test-helpers';
import { createBooking, getBooking } from './bookings';
import { createExpectedPayment } from './expected';
import { getContactStatement } from './contacts';
import { listContactChecklist, settleContactChecklist } from './contact-checklist';
import { undo } from './audit';
import { bookedBalance } from './reconciliation';

let opened: OpenedDatabase;
const today = '2026-09-30';
const date = '2026-09-05';
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const db = () => opened.db;

function outlay(categoryId: string, amountCents: number, on: string) {
  const id = createBooking(
    db(),
    {
      accountId: 'giro',
      date: on,
      amountCents: -amountCents,
      splits: [{ categoryId, contactId: 'k1', amountCents: -amountCents }],
    },
    testCtx,
    { contactModel: true },
  );
  return getBooking(db(), id)!.splits[0]!;
}
function contribution(name: string, categoryId: string, amountCents: number, dueDay: number) {
  createExpectedPayment(
    db(),
    {
      name,
      kind: 'inflow',
      accountId: 'giro',
      contactId: 'k1',
      categoryId,
      dueDay,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    },
    { validFrom: '2026-09-01', amountCents },
    testCtx,
    today,
  );
}
/** Open outlay 25,01 € plus contributions 800,00 € and 19,99 € (synthetic). */
function scenario() {
  const o = outlay('essen', 2501, '2026-09-01');
  contribution('Mietanteil', 'miete', 80000, 3);
  contribution('Abo', 'essen', 1999, 4);
  const open = listContactChecklist(db(), 'k1', date);
  return { o, open };
}
const pick = (open: ReturnType<typeof listContactChecklist>) => ({
  outlaySplitIds: open.outlays.map((x) => x.splitId),
  occurrenceIds: open.contributions.map((x) => x.occurrenceId),
});
const run = (
  amountCents: number,
  open: ReturnType<typeof listContactChecklist>,
  extra: Record<string, unknown> = {},
) =>
  settleContactChecklist(
    db(),
    'k1',
    { accountId: 'giro', date, amountCents, ...pick(open), ...extra },
    { actor: 'test' },
    today,
  );
const splitsOf = (bookingId: string) =>
  db()
    .select()
    .from(bookingSplit)
    .where(eq(bookingSplit.bookingId, bookingId))
    .all()
    .map((s) => ({
      categoryId: s.categoryId,
      incomeTypeId: s.incomeTypeId,
      contactId: s.contactId,
      amountCents: s.amountCents,
    }));
const liveBookings = () =>
  db().select().from(booking).where(isNull(booking.deletedAt)).all().length;

it('lists open outlays and due contributions with their targets', () => {
  const { open } = scenario();
  expect(open.outlays.map((o) => o.remainingCents)).toEqual([2501]);
  expect(open.contributions.map((c) => [c.name, c.amountCents, c.categoryName])).toEqual([
    ['Mietanteil', 80000, 'Miete'],
    ['Abo', 1999, 'Essen'],
  ]);
});

it('paid exactly: one booking, splits sum to 84500, contact settled, one occurrence linked', () => {
  const { open } = scenario();
  const balanceBefore = bookedBalance(db(), 'giro', today);
  const result = run(84500, open);
  expect(result.restCents).toBe(0);
  expect(getBooking(db(), result.bookingId)!.amountCents).toBe(84500);
  expect(bookedBalance(db(), 'giro', today)).toBe(balanceBefore + 84500);
  const splits = splitsOf(result.bookingId);
  expect(splits.reduce((s, x) => s + x.amountCents, 0)).toBe(84500);
  expect(splits.filter((s) => s.categoryId === 'miete').map((s) => s.amountCents)).toEqual([80000]);
  expect(splits.filter((s) => s.contactId === 'k1').map((s) => s.amountCents)).toEqual([2501]);
  const statement = getContactStatement(db(), 'k1', today);
  expect(statement.balanceCents).toBe(0);
  expect(statement.creditCents).toBe(0);
  const linked = db()
    .select()
    .from(expectedOccurrence)
    .where(eq(expectedOccurrence.bookingId, result.bookingId))
    .all();
  expect(linked).toHaveLength(1);
  expect(linked[0]).toMatchObject({ status: 'received', expectedAmountCents: 80000 });
});

it('paid less, rest stays open: exactly 1500 stay open on the contact', () => {
  const { o, open } = scenario();
  const result = run(83000, open);
  expect(result.restCents).toBe(-1500);
  expect(getBooking(db(), result.bookingId)!.amountCents).toBe(83000);
  const statement = getContactStatement(db(), 'k1', today);
  expect(statement.outlays.find((x) => x.splitId === o.id)!.remainingCents).toBe(1500);
  expect(statement.balanceCents).toBe(1500);
});

it('paid less, rest waived: contact balance returns to zero through the gift path', () => {
  const { open } = scenario();
  const result = run(83000, open, { shortfall: 'waive' });
  expect(result.restCents).toBe(-1500);
  const statement = getContactStatement(db(), 'k1', today);
  expect(statement.balanceCents).toBe(0);
  expect(statement.outlays.every((x) => x.remainingCents === 0)).toBe(true);
});

it('paid more, surplus kept as credit: credit rises by exactly 1500', () => {
  const { open } = scenario();
  const result = run(86000, open);
  expect(result.restCents).toBe(1500);
  expect(getBooking(db(), result.bookingId)!.amountCents).toBe(86000);
  const statement = getContactStatement(db(), 'k1', today);
  expect(statement.creditCents).toBe(1500);
  expect(statement.balanceCents).toBe(-1500);
});

it('paid more, surplus as gift: 1500 booked as income type Geschenke, no credit left', () => {
  const { open } = scenario();
  const result = run(86000, open, { surplus: 'gift' });
  expect(result.restCents).toBe(1500);
  const statement = getContactStatement(db(), 'k1', today);
  expect(statement.creditCents).toBe(0);
  const gifts = db()
    .select()
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .where(and(isNull(booking.deletedAt), eq(bookingSplit.incomeTypeId, INCOME_TYPES.gift.id)))
    .all();
  expect(gifts.map((g) => g.booking_split.amountCents)).toEqual([1500]);
});

it('unticked outlays stay open while a surplus remains as credit', () => {
  const { o } = scenario();
  const open = listContactChecklist(db(), 'k1', date);
  const result = run(1000, open, { outlaySplitIds: [], occurrenceIds: [] });
  expect(result.restCents).toBe(1000);
  const statement = getContactStatement(db(), 'k1', today);
  expect(statement.outlays.find((x) => x.splitId === o.id)!.remainingCents).toBe(2501);
  expect(statement.creditCents).toBe(1000);
});

it('Undo of the group restores balance, contact statement and occurrences exactly', () => {
  const { open } = scenario();
  const before = {
    balance: bookedBalance(db(), 'giro', today),
    bookings: liveBookings(),
    statement: getContactStatement(db(), 'k1', today),
    occurrences: db().select().from(expectedOccurrence).all(),
  };
  const result = run(86000, open, { surplus: 'gift' });
  expect(liveBookings()).toBeGreaterThan(before.bookings);
  undo(db(), { groupId: result.groupId }, { actor: 'test' });
  expect(bookedBalance(db(), 'giro', today)).toBe(before.balance);
  expect(liveBookings()).toBe(before.bookings);
  expect(getContactStatement(db(), 'k1', today)).toEqual(before.statement);
  expect(db().select().from(expectedOccurrence).all()).toEqual(before.occurrences);
});

it('refuses a row that is no longer open and writes nothing', () => {
  const { open } = scenario();
  run(84500, open);
  const before = liveBookings();
  expect(() => run(84500, open)).toThrow(/nicht mehr offen/);
  expect(liveBookings()).toBe(before);
});

it('refuses an amount that is not whole positive cents', () => {
  const { open } = scenario();
  expect(() => run(0, open)).toThrow();
  expect(() => run(10.5, open)).toThrow();
});
