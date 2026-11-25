import { afterEach, beforeEach, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { booking, bookingSplit, expectedOccurrence, INCOME_TYPES } from '../schema';
import { seedBasics, testCtx } from './test-helpers';
import { createBooking, getBooking } from './bookings';
import { createExpectedPayment, upcoming } from './expected';
import { readPaymentDetail } from './expected-detail';
import { matchedCharges } from './contract-history';
import { getContactStatement, waiveContactOutlay } from './contacts';
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
function contribution(
  name: string,
  categoryId: string | null,
  amountCents: number,
  dueDay: number,
) {
  return createExpectedPayment(
    db(),
    {
      name,
      kind: 'inflow',
      accountId: 'giro',
      contactId: 'k1',
      ...(categoryId ? { categoryId } : {}),
      dueDay,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    },
    { validFrom: '2026-09-01', amountCents },
    testCtx,
    today,
  ).payment;
}
/** Open outlay 25,01 € plus contributions 800,00 € and 19,99 € (synthetic). */
function scenario() {
  const o = outlay('essen', 2501, '2026-09-01');
  const rent = contribution('Mietanteil', 'miete', 80000, 3);
  contribution('Abo', 'essen', 1999, 4);
  const open = listContactChecklist(db(), 'k1', date);
  return { o, rent, open };
}
type Open = ReturnType<typeof listContactChecklist>;
const pick = (open: Open) => ({
  outlaySplitIds: open.outlays.map((x) => x.splitId),
  occurrenceIds: open.contributions.slice(0, 1).map((x) => x.occurrenceId),
});
const run = (amountCents: number, open: Open, extra: Record<string, unknown> = {}) =>
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
      contactId: s.contactId,
      amountCents: s.amountCents,
    }));
const liveBookings = () =>
  db().select().from(booking).where(isNull(booking.deletedAt)).all().length;
const occurrences = () => db().select().from(expectedOccurrence).all();

it('lists outlays and contributions; advance targets are left out, targetless ones disabled', () => {
  const { open } = scenario();
  contribution('Weitergabe', 'auslagen', 500, 5);
  contribution('Ohne Ziel', null, 700, 6);
  const again = listContactChecklist(db(), 'k1', date);
  expect(again.outlays.map((o) => o.remainingCents)).toEqual([2501]);
  expect(open.contributions.map((c) => [c.name, c.amountCents, c.selectable])).toEqual([
    ['Mietanteil', 80000, true],
    ['Abo', 1999, true],
  ]);
  expect(again.contributions.map((c) => [c.name, c.selectable])).toEqual([
    ['Mietanteil', true],
    ['Abo', true],
    ['Ohne Ziel', false],
  ]);
  const blocked = again.contributions.find((c) => !c.selectable)!;
  expect(() =>
    run(700, again, { outlaySplitIds: [], occurrenceIds: [blocked.occurrenceId] }),
  ).toThrow(/nicht mehr offen/);
});

it('refuses more than one contribution per receipt and writes nothing', () => {
  const { open } = scenario();
  const before = liveBookings();
  expect(() =>
    run(84500, open, { occurrenceIds: open.contributions.map((c) => c.occurrenceId) }),
  ).toThrow(/nur ein erwarteter Beitrag/);
  expect(liveBookings()).toBe(before);
});

it('paid exactly: one booking, splits sum to 82501, contact settled, occurrence received', () => {
  const { open } = scenario();
  const balanceBefore = bookedBalance(db(), 'giro', today);
  const result = run(82501, open);
  expect(result.restCents).toBe(0);
  expect(getBooking(db(), result.bookingId)!.amountCents).toBe(82501);
  expect(bookedBalance(db(), 'giro', today)).toBe(balanceBefore + 82501);
  const splits = splitsOf(result.bookingId);
  expect(splits.reduce((s, x) => s + x.amountCents, 0)).toBe(82501);
  expect(splits.filter((s) => s.categoryId === 'miete').map((s) => s.amountCents)).toEqual([80000]);
  expect(splits.filter((s) => s.contactId === 'k1').map((s) => s.amountCents)).toEqual([2501]);
  const statement = getContactStatement(db(), 'k1', today);
  expect(statement.balanceCents).toBe(0);
  expect(statement.creditCents).toBe(0);
  const linked = occurrences().filter((o) => o.bookingId === result.bookingId);
  expect(linked).toHaveLength(1);
  expect(linked[0]).toMatchObject({ status: 'received', expectedAmountCents: 80000 });
});

it('underpaid contribution is linked as deviating, never received', () => {
  const { open } = scenario();
  const result = run(70000, open, { outlaySplitIds: [] });
  expect(result.restCents).toBe(-10000);
  const linked = occurrences().find((o) => o.bookingId === result.bookingId)!;
  expect(linked.status).toBe('deviating');
});

it('paid less, rest stays open: exactly 1500 stay open on the contact', () => {
  const { o, open } = scenario();
  const result = run(81001, open);
  expect(result.restCents).toBe(-1500);
  expect(getBooking(db(), result.bookingId)!.amountCents).toBe(81001);
  const statement = getContactStatement(db(), 'k1', today);
  expect(statement.outlays.find((x) => x.splitId === o.id)!.remainingCents).toBe(1500);
  expect(statement.balanceCents).toBe(1500);
});

it('paid less, rest waived: balance back to zero, waiver booked on the payment date', () => {
  const { open } = scenario();
  const result = run(81001, open, { shortfall: 'waive' });
  expect(result.restCents).toBe(-1500);
  expect(getContactStatement(db(), 'k1', today).balanceCents).toBe(0);
  const waivers = db()
    .select()
    .from(booking)
    .where(and(isNull(booking.deletedAt), eq(booking.memo, 'Geschenk an Kontakt')))
    .all();
  expect(waivers.map((w) => w.date)).toEqual([date]);
});

it('waiving a legacy outlay without a category is refused and writes nothing', () => {
  outlay('auslagen', 2501, '2026-09-01');
  contribution('Mietanteil', 'miete', 80000, 3);
  const open = listContactChecklist(db(), 'k1', date);
  expect(open.outlays[0]!.categoryId).toBeNull();
  const before = liveBookings();
  expect(() => run(81001, open, { shortfall: 'waive' })).toThrow(/ohne Kategorie/);
  expect(liveBookings()).toBe(before);
});

it('waiveContactOutlay keeps today by default and never dates before the outlay', () => {
  const o = outlay('essen', 1000, '2026-09-10');
  const dated = (input: { date?: string }) => {
    const r = waiveContactOutlay(
      db(),
      'k1',
      o.id,
      { amountCents: 100, ...input },
      { actor: 'test' },
      today,
    );
    return getBooking(db(), r.bookingId)!.date;
  };
  expect(dated({})).toBe(today);
  expect(dated({ date: '2026-09-05' })).toBe('2026-09-10');
  expect(dated({ date: '2026-09-20' })).toBe('2026-09-20');
});

it('paid more, surplus kept as credit: credit rises by exactly 1500', () => {
  const { open } = scenario();
  const result = run(84001, open);
  expect(result.restCents).toBe(1500);
  const statement = getContactStatement(db(), 'k1', today);
  expect(statement.creditCents).toBe(1500);
  expect(statement.balanceCents).toBe(-1500);
});

it('paid more, surplus as gift: 1500 booked as income type Geschenke, no credit left', () => {
  const { open } = scenario();
  run(84001, open, { surplus: 'gift' });
  expect(getContactStatement(db(), 'k1', today).creditCents).toBe(0);
  const gifts = db()
    .select()
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .where(and(isNull(booking.deletedAt), eq(bookingSplit.incomeTypeId, INCOME_TYPES.gift.id)))
    .all();
  expect(gifts.map((g) => g.booking_split.amountCents)).toEqual([1500]);
});

it('odd cents: 3 rows and 1001 received apply exactly 500 + 333 + 168, 166 stay open', () => {
  const a = outlay('essen', 333, '2026-09-01');
  const b = outlay('essen', 334, '2026-09-02');
  contribution('Beitrag', 'miete', 500, 3);
  const open = listContactChecklist(db(), 'k1', date);
  const result = run(1001, open);
  expect(result.restCents).toBe(-166);
  const splits = splitsOf(result.bookingId);
  expect(splits.reduce((s, x) => s + x.amountCents, 0)).toBe(1001);
  expect(splits.find((s) => s.categoryId === 'miete')!.amountCents).toBe(500);
  const statement = getContactStatement(db(), 'k1', today);
  expect(statement.outlays.find((x) => x.splitId === a.id)!.remainingCents).toBe(0);
  expect(statement.outlays.find((x) => x.splitId === b.id)!.remainingCents).toBe(166);
});

it('mixed receipt: the occurrence shows its own 800,00 €, not the cash total', () => {
  const { rent, open } = scenario();
  const result = run(84001, open);
  expect(getBooking(db(), result.bookingId)!.amountCents).toBe(84001);
  const row = upcoming(db(), '2026-09-01', '2026-09-30').find((r) => r.paymentId === rent.id)!;
  expect(row).toMatchObject({ status: 'received', bookedAmountCents: 80000 });
  const detail = readPaymentDetail(db(), rent.id, today);
  const shown = detail.history.find((r) => r.booking?.id === result.bookingId)!;
  expect(shown.actualComparableCents).toBe(80000);
  expect(shown.deviationCents).toBe(0);
  expect(
    matchedCharges(db(), rent.id, 'EUR').find((c) => c.bookingId === result.bookingId)?.amountCents,
  ).toBe(80000);
});

it('combined: 1 contribution + 2 outlays + surplus is one group and one Undo restores all', () => {
  outlay('essen', 2501, '2026-09-01');
  outlay('reise', 1001, '2026-09-02');
  contribution('Mietanteil', 'miete', 80000, 3);
  const open = listContactChecklist(db(), 'k1', date);
  const before = {
    balance: bookedBalance(db(), 'giro', today),
    bookings: liveBookings(),
    statement: getContactStatement(db(), 'k1', today),
    occurrences: occurrences(),
  };
  const result = run(85002, open, { surplus: 'gift' });
  expect(result.restCents).toBe(1500);
  expect(liveBookings()).toBeGreaterThan(before.bookings);
  undo(db(), { groupId: result.groupId }, { actor: 'test' });
  expect(bookedBalance(db(), 'giro', today)).toBe(before.balance);
  expect(liveBookings()).toBe(before.bookings);
  expect(getContactStatement(db(), 'k1', today)).toEqual(before.statement);
  expect(occurrences()).toEqual(before.occurrences);
});

it('refuses a row that is no longer open and an amount that is not positive whole cents', () => {
  const { open } = scenario();
  run(82501, open);
  const before = liveBookings();
  expect(() => run(82501, open)).toThrow(/nicht mehr offen/);
  expect(() => run(0, open)).toThrow();
  expect(() => run(10.5, open)).toThrow();
  expect(liveBookings()).toBe(before);
});
