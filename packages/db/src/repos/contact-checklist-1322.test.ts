import { afterEach, beforeEach, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  booking,
  bookingSplit,
  expectedOccurrence,
  expectedPayment,
  INCOME_TYPES,
  payee,
} from '../schema';
import { seedBasics, testCtx } from './test-helpers';
import { createBooking, deleteBooking, getBooking } from './bookings';
import {
  createExpectedPayment,
  linkOccurrence,
  monthIncome,
  unlinkOccurrence,
  upcoming,
} from './expected';
import { linkedOccurrenceShares } from './expected-links';
import { loadFacts } from './rule-inputs';
import { readPaymentDetail } from './expected-detail';
import { matchedCharges } from './contract-history';
import {
  chooseContactCredit,
  getContactStatement,
  settleContact,
  waiveContactOutlay,
} from './contacts';
import {
  listContactChecklist,
  resplitContactChecklist,
  settleContactChecklist,
} from './contact-checklist';
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

const both = (open: Open) => open.contributions.map((x) => x.occurrenceId);
const linkedTo = (bookingId: string) => occurrences().filter((o) => o.bookingId === bookingId);

it('two contributions in one receipt, paid exactly: both received, each owns only its split', () => {
  const { rent, open } = scenario();
  const abo = open.contributions.find((c) => c.name === 'Abo')!;
  const result = run(81999, open, { outlaySplitIds: [], occurrenceIds: both(open) });
  expect(result.linkedOccurrenceIds).toHaveLength(2);
  expect(splitsOf(result.bookingId).map((s) => s.amountCents)).toEqual([80000, 1999]);
  const linked = linkedTo(result.bookingId);
  expect(linked.map((o) => o.status)).toEqual(['received', 'received']);
  // No double count: each row shows its own share, the shares add up to the cash received.
  const rows = upcoming(db(), '2026-09-01', '2026-09-30').filter((r) =>
    [rent.id, abo.paymentId].includes(r.paymentId),
  );
  expect(rows.map((r) => r.bookedAmountCents).sort()).toEqual([1999, 80000]);
  expect(monthIncome(db(), '2026-09').byPayment.reduce((s, l) => s + l.receivedCents, 0)).toBe(
    81999,
  );
  const marks = loadFacts(db(), today).planMarks;
  const cents = [...marks.values()].flatMap((m) => (typeof m === 'object' ? [m.cents ?? 0] : []));
  expect(cents.reduce((a, b) => a + b, 0)).toBe(81999);
});

it('two contributions, paid less: the last one is deviating, the first received', () => {
  const { open } = scenario();
  const result = run(80500, open, { outlaySplitIds: [], occurrenceIds: both(open) });
  const byAmount = (n: number) =>
    linkedTo(result.bookingId).find((o) => o.expectedAmountCents === n)!;
  expect(byAmount(80000).status).toBe('received');
  expect(byAmount(1999).status).toBe('deviating');
  expect(result.restCents).toBe(-1499);
  const rows = upcoming(db(), '2026-09-01', '2026-09-30');
  expect(
    rows
      .filter((r) => r.bookingId === result.bookingId)
      .map((r) => r.bookedAmountCents)
      .sort((a, b) => a! - b!),
  ).toEqual([500, 80000]);
});

it('two contributions plus more than expected: surplus stays credit, shares stay exact', () => {
  const { open } = scenario();
  const result = run(83000, open, { outlaySplitIds: [], occurrenceIds: both(open) });
  expect(result.restCents).toBe(1001);
  const linked = linkedTo(result.bookingId);
  expect(linked.map((o) => o.status)).toEqual(['received', 'received']);
  const rows = upcoming(db(), '2026-09-01', '2026-09-30').filter(
    (r) => r.bookingId === result.bookingId,
  );
  expect(rows.map((r) => r.bookedAmountCents).sort((a, b) => a! - b!)).toEqual([1999, 80000]);
  expect(getContactStatement(db(), 'k1', today).creditCents).toBe(1001);
});

it('one Undo reverts both occurrence links; deleting the booking unlinks both', () => {
  const { open } = scenario();
  const before = occurrences();
  const result = run(81999, open, { outlaySplitIds: [], occurrenceIds: both(open) });
  expect(linkedTo(result.bookingId)).toHaveLength(2);
  undo(db(), { groupId: result.groupId }, { actor: 'test' });
  expect(occurrences()).toEqual(before);

  const again = run(81999, listContactChecklist(db(), 'k1', date), {
    outlaySplitIds: [],
    occurrenceIds: both(listContactChecklist(db(), 'k1', date)),
  });
  expect(linkedTo(again.bookingId)).toHaveLength(2);
  deleteBooking(db(), again.bookingId, testCtx);
  expect(occurrences().filter((o) => o.bookingId !== null)).toHaveLength(0);
  expect(occurrences().every((o) => o.status === 'expected')).toBe(true);
});

it('manual linking never attaches a second occurrence to a checklist booking', () => {
  const { open } = scenario();
  contribution('Dritter', 'essen', 300, 7);
  const result = run(81999, open, { outlaySplitIds: [], occurrenceIds: both(open) });
  const third = occurrences().find((o) => o.expectedAmountCents === 300)!;
  expect(() => linkOccurrence(db(), third.id, result.bookingId, testCtx)).toThrow(
    /another occurrence/,
  );
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

/** Outlay 300 plus a plain repayment lot of 100 that no outlay took (synthetic). */
function outlayWithCredit() {
  const o = outlay('essen', 300, '2026-09-01');
  settleContact(
    db(),
    'k1',
    {
      accountId: 'giro',
      date: '2026-09-02',
      amountCents: 100,
      allocations: [],
      retainCredit: true,
    },
    testCtx,
  );
  return o;
}

it('credit offsets the outlay first: receipt of the net 200 settles to balance 0, credit used', () => {
  const o = outlayWithCredit();
  const before = getContactStatement(db(), 'k1', today);
  expect(before.balanceCents).toBe(200);
  expect(before.creditCents).toBe(100);
  const open = listContactChecklist(db(), 'k1', date);
  expect(open.credits.map((c) => [c.remainingCents, c.usable])).toEqual([[100, true]]);
  const result = run(200, open, {
    occurrenceIds: [],
    creditReceiptSplitIds: open.credits.map((c) => c.receiptSplitId),
  });
  expect(result.restCents).toBe(0);
  expect(getBooking(db(), result.bookingId)!.amountCents).toBe(200);
  const after = getContactStatement(db(), 'k1', today);
  expect(after.balanceCents).toBe(0);
  expect(after.creditCents).toBe(0);
  expect(after.outlays.find((x) => x.splitId === o.id)!.remainingCents).toBe(0);
});

it('Undo of the group restores the credit and the open outlay exactly', () => {
  outlayWithCredit();
  const before = getContactStatement(db(), 'k1', today);
  const balance = bookedBalance(db(), 'giro', today);
  const open = listContactChecklist(db(), 'k1', date);
  const result = run(200, open, {
    occurrenceIds: [],
    creditReceiptSplitIds: open.credits.map((c) => c.receiptSplitId),
  });
  undo(db(), { groupId: result.groupId }, { actor: 'test' });
  expect(getContactStatement(db(), 'k1', today)).toEqual(before);
  expect(bookedBalance(db(), 'giro', today)).toBe(balance);
});

it('an earmarked credit lot is not usable for an existing outlay and is refused', () => {
  outlay('essen', 300, '2026-09-01');
  const receipt = settleContact(
    db(),
    'k1',
    {
      accountId: 'giro',
      date: '2026-09-02',
      amountCents: 100,
      allocations: [],
      retainCredit: true,
    },
    testCtx,
  );
  const lot = getBooking(db(), receipt.bookingId)!.splits[0]!.id;
  chooseContactCredit(
    db(),
    'k1',
    {
      receiptSplitId: lot,
      amountCents: 100,
      date: '2026-09-03',
      choice: 'category',
      categoryId: 'reise',
    },
    testCtx,
    today,
  );
  const open = listContactChecklist(db(), 'k1', date);
  expect(open.credits.map((c) => [c.remainingCents, c.categoryId, c.usable])).toEqual([
    [100, 'reise', false],
  ]);
  const before = liveBookings();
  expect(() =>
    run(200, open, { occurrenceIds: [], creditReceiptSplitIds: [open.credits[0]!.receiptSplitId] }),
  ).toThrow(/nicht verrechnet/);
  expect(liveBookings()).toBe(before);
  // Without the credit row the gross 300 is what the receipt settles; the credit stays untouched.
  run(300, open, { occurrenceIds: [] });
  expect(getContactStatement(db(), 'k1', today).creditCents).toBe(100);
});

/** An inflow whose payee stands for contact k1: the only kind of booking a re-split accepts. */
function plainInflow(amountCents: number) {
  db().update(payee).set({ contactId: 'k1' }).where(eq(payee.id, 'p1')).run();
  return createBooking(
    db(),
    {
      accountId: 'giro',
      date,
      amountCents,
      payeeId: 'p1',
      splits: [{ categoryId: 'essen', amountCents }],
    },
    testCtx,
  );
}
const resplit = (bookingId: string, occurrenceIds: string[]) =>
  resplitContactChecklist(db(), bookingId, 'k1', { occurrenceIds }, { actor: 'test' }, today);

it('re-split: a plain inflow gets one split and one link per ticked contribution, one Undo restores', () => {
  const { open } = scenario();
  const id = plainInflow(81999);
  const before = {
    splits: splitsOf(id),
    occurrences: occurrences(),
    balance: bookedBalance(db(), 'giro', today),
  };
  const result = resplit(id, both(open));
  expect(result.linkedOccurrenceIds).toHaveLength(2);
  expect(getBooking(db(), id)!.amountCents).toBe(81999);
  expect(bookedBalance(db(), 'giro', today)).toBe(before.balance);
  expect(splitsOf(id).map((x) => x.amountCents)).toEqual([80000, 1999]);
  expect(linkedTo(id).map((o) => o.status)).toEqual(['received', 'received']);
  undo(db(), { groupId: result.groupId }, { actor: 'test' });
  expect(splitsOf(id)).toEqual(before.splits);
  expect(occurrences()).toEqual(before.occurrences);
});

it('re-split refuses a rest and a selection that does not cover the amount, writes nothing', () => {
  const { open } = scenario();
  const id = plainInflow(83000);
  const before = { splits: splitsOf(id), occurrences: occurrences() };
  expect(() => resplit(id, both(open))).toThrow(/ganzen Betrag/);
  expect(() => resplit(id, [])).toThrow(/ganzen Betrag/);
  expect(splitsOf(id)).toEqual(before.splits);
  expect(occurrences()).toEqual(before.occurrences);
});

it('re-split of a settled booking (outlays repaid) is refused and nothing changes', () => {
  const { open } = scenario();
  const result = run(82501, open);
  const before = { occurrences: occurrences(), splits: splitsOf(result.bookingId) };
  expect(() => resplit(result.bookingId, [])).toThrow(/Rückzahlung von Auslagen/);
  expect(occurrences()).toEqual(before.occurrences);
  expect(splitsOf(result.bookingId)).toEqual(before.splits);
});

it('re-split replaces the links: own contributions are offered again', () => {
  const { open } = scenario();
  const id = plainInflow(80000);
  const rent = open.contributions[0]!.occurrenceId;
  resplit(id, [rent]);
  expect(linkedTo(id)).toHaveLength(1);
  expect(listContactChecklist(db(), 'k1', date, id).contributions).toHaveLength(2);
  expect(listContactChecklist(db(), 'k1', date).contributions).toHaveLength(1);
  const again = resplit(id, [rent]);
  expect(again.restCents).toBe(0);
  expect(linkedTo(id).map((o) => o.status)).toEqual(['received']);
});

it('re-split refuses a booking that is not a payment of this contact and one linked elsewhere', () => {
  const { open } = scenario();
  const foreign = createBooking(
    db(),
    {
      accountId: 'giro',
      date,
      amountCents: 80000,
      splits: [{ categoryId: 'essen', amountCents: 80000 }],
    },
    testCtx,
  );
  expect(() => resplit(foreign, [open.contributions[0]!.occurrenceId])).toThrow(
    /nicht zu diesem Kontakt/,
  );
  const id = plainInflow(500);
  const other = createExpectedPayment(
    db(),
    {
      name: 'Gehalt Muster',
      kind: 'inflow',
      accountId: 'giro',
      incomeTypeId: INCOME_TYPES.salary.id,
      dueDay: 5,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    },
    { validFrom: '2026-09-01', amountCents: 500 },
    testCtx,
    today,
  ).payment;
  const occ = occurrences().find((o) => o.expectedPaymentId === other.id)!;
  linkOccurrence(db(), occ.id, id, testCtx);
  const before = occurrences();
  expect(() => resplit(id, [open.contributions[0]!.occurrenceId])).toThrow(
    /anderen erwarteten Zahlung/,
  );
  expect(occurrences()).toEqual(before);
});

it('re-split of a settled booking leaves the contact statement identical, also after Undo', () => {
  outlay('essen', 2501, '2026-09-01');
  contribution('Mietanteil', 'miete', 80000, 3);
  const open = listContactChecklist(db(), 'k1', date);
  const result = run(82501, open);
  const totals = () => JSON.stringify(getContactStatement(db(), 'k1', today));
  const before = totals();
  expect(() => resplit(result.bookingId, both(open))).toThrow(/Rückzahlung von Auslagen/);
  expect(totals()).toBe(before);
  undo(db(), { groupId: result.groupId }, { actor: 'test' });
  const plain = plainInflow(80000);
  const statement = totals();
  const done = resplit(plain, both(listContactChecklist(db(), 'k1', date)));
  expect(totals()).toBe(statement);
  undo(db(), { groupId: done.groupId }, { actor: 'test' });
  expect(totals()).toBe(statement);
});

it('unlinking one of two contributions keeps the sibling at its own share and status', () => {
  const { rent, open } = scenario();
  const result = run(81999, open, { outlaySplitIds: [], occurrenceIds: both(open) });
  const abo = linkedTo(result.bookingId).find((o) => o.expectedAmountCents === 1999)!;
  unlinkOccurrence(db(), abo.id, testCtx);
  const rest = linkedTo(result.bookingId);
  expect(rest).toHaveLength(1);
  expect(rest[0]).toMatchObject({ expectedAmountCents: 80000, status: 'received' });
  const row = upcoming(db(), '2026-09-01', '2026-09-30').find((r) => r.paymentId === rent.id)!;
  expect(row.bookedAmountCents).toBe(80000);
});

it('status uses the payment tolerance, not exact equality', () => {
  const rent = contribution('Mietanteil', 'miete', 80000, 3);
  db()
    .update(expectedPayment)
    .set({ amountToleranceCents: 100 })
    .where(eq(expectedPayment.id, rent.id))
    .run();
  const open = listContactChecklist(db(), 'k1', date);
  const result = run(79950, open, { outlaySplitIds: [] });
  expect(linkedTo(result.bookingId)[0]!.status).toBe('received');
});

it('same-category contributions keep their own shares, also when the splits are reordered', () => {
  contribution('Eins', 'miete', 300, 3);
  contribution('Zwei', 'miete', 700, 4);
  const open = listContactChecklist(db(), 'k1', date);
  const result = run(1000, open, { outlaySplitIds: [], occurrenceIds: both(open) });
  const byAmount = () => {
    const shares = linkedOccurrenceShares(db(), result.bookingId)!;
    return Object.fromEntries(
      linkedTo(result.bookingId).map((o) => [o.expectedAmountCents, shares.get(o.id)]),
    );
  };
  expect(byAmount()).toEqual({ 300: 300, 700: 700 });
  const rows = db()
    .select()
    .from(bookingSplit)
    .where(eq(bookingSplit.bookingId, result.bookingId))
    .all();
  rows.forEach((r, i) =>
    db()
      .update(bookingSplit)
      .set({ sortOrder: rows.length - i })
      .where(eq(bookingSplit.id, r.id))
      .run(),
  );
  expect(byAmount()).toEqual({ 300: 300, 700: 700 });
});

it('the automatic category return is never taken as a contribution share', () => {
  outlay('miete', 1000, '2026-09-01');
  contribution('Mietanteil', 'miete', 80000, 3);
  const open = listContactChecklist(db(), 'k1', date);
  const result = run(81000, open, { occurrenceIds: open.contributions.map((c) => c.occurrenceId) });
  const returned = db()
    .select()
    .from(bookingSplit)
    .where(eq(bookingSplit.bookingId, result.bookingId))
    .all()
    .filter((s) => s.memo === 'Rückzahlung in die ursprüngliche Kategorie');
  expect(returned.length).toBeGreaterThan(0);
  const occ = linkedTo(result.bookingId)[0]!;
  expect([...linkedOccurrenceShares(db(), result.bookingId)!.values()]).toEqual([80000]);
  expect(occ.status).toBe('received');
});

it('contract history lists one entry per linked occurrence of the same payment', () => {
  const rent = contribution('Mietanteil', 'miete', 800, 3);
  const id = createBooking(
    db(),
    {
      accountId: 'giro',
      date,
      amountCents: 1600,
      splits: [
        { categoryId: 'miete', memo: 'Mietanteil', amountCents: 800 },
        { categoryId: 'miete', memo: 'Mietanteil', amountCents: 800 },
      ],
    },
    testCtx,
  );
  const first = occurrences().find((o) => o.expectedPaymentId === rent.id)!;
  db()
    .update(expectedOccurrence)
    .set({ status: 'received', bookingId: id })
    .where(eq(expectedOccurrence.id, first.id))
    .run();
  db()
    .insert(expectedOccurrence)
    .values({
      id: 'occ-second',
      expectedPaymentId: rent.id,
      dueDate: '2026-10-03',
      expectedAmountCents: 800,
      status: 'received',
      bookingId: id,
    })
    .run();
  const charges = matchedCharges(db(), rent.id, 'EUR').filter((c) => c.bookingId === id);
  expect(charges.map((c) => c.amountCents)).toEqual([800, 800]);
});
