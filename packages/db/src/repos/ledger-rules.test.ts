import { accountBalances as pureBalances } from '@budget/domain';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { INCOME_TYPES, account, booking, budgetMonth } from '../schema';
import { history, undo } from './audit';
import {
  createBooking,
  createTransfer,
  deleteBooking,
  getBooking,
  importBooking,
  importTransfer,
  listBookings,
  updateBooking,
} from './bookings';
import { accounts, categories } from './entities';
import { setAssigned } from './envelopes';
import { createCategory } from './categories';
import { allocationMonth } from './allocation';
import { loadFacts, ruleInputs } from './rule-inputs';
import { createExpectedPayment } from './expected';
import { accountBalances, budget, budgetLedger } from './queries';
import { seedBasics, testCtx as ctx } from './test-helpers';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db); // giro (1.000,00) and spar on-budget, usd; categories miete, essen, reise, auslagen
  opened.sqlite.exec(`
    INSERT INTO account (id, name, type, role, on_budget, opening_date, sort_order) VALUES
      ('depot', 'Depot', 'brokerage', 'investment', 0, '2023-10-01', 4),
      ('karte', 'Karte', 'credit_card', 'budget', 1, '2023-10-01', 5);
    INSERT INTO category (id, name, group_id, class, kind, card_account_id) VALUES
      ('kz', 'Kartenzahlung', 'g', NULL, 'card_payment', 'karte'),
      ('invest', 'Investieren', 'g', 'future', 'invest', NULL);`);
});

const transfer = (from: string, to: string, date: string, cents: number, categoryId?: string) =>
  createTransfer(
    db,
    {
      fromAccountId: from,
      toAccountId: to,
      date,
      amountCents: cents,
      ...(categoryId ? { categoryId } : {}),
    },
    ctx,
  );
const imported = (
  accountId: string,
  date: string,
  cents: number,
  key: string,
  categoryId: string | null = null,
) =>
  importBooking(
    db,
    {
      accountId,
      date,
      amountCents: cents,
      importKey: key,
      splits: [{ amountCents: cents, categoryId }],
    },
    ctx,
  );
const spend = (accountId: string, date: string, cents: number, categoryId: string | null) =>
  createBooking(
    db,
    { accountId, date, amountCents: cents, splits: [{ categoryId, amountCents: cents }] },
    ctx,
  );

describe('C5 one opening-date rule in SQL and in the domain', () => {
  it('agrees on an account opened after 01.10.2023 with history before its opening date', () => {
    accounts.create(
      db,
      {
        id: 'tg',
        name: 'Tagesgeld neu',
        type: 'savings',
        role: 'reserve',
        onBudget: true,
        openingDate: '2024-03-15',
        openingBalanceCents: 50_000,
      },
      ctx,
    );
    spend('tg', '2024-03-01', 7_000, null); // before the opening date: part of the opening balance
    spend('tg', '2024-03-15', -1_000, 'essen');
    spend('tg', '2024-04-02', 2_500, null);
    const rows = db.select().from(account).all();
    const bookings = db.select().from(booking).all();
    for (const asOf of [
      '2023-10-31',
      '2024-03-14',
      '2024-03-15',
      '2024-03-31',
      '2024-04-30',
      undefined,
    ]) {
      const sql = accountBalances(db, asOf);
      const pure = pureBalances(rows, bookings, asOf);
      for (const b of sql)
        expect(b.balanceCents, `${b.accountId} ${asOf}`).toBe(pure.get(b.accountId));
    }
    const tg = (asOf: string) =>
      accountBalances(db, asOf).find((b) => b.accountId === 'tg')?.balanceCents;
    expect([tg('2024-03-14'), tg('2024-03-15'), tg('2024-04-30')]).toEqual([0, 49_000, 51_500]);
  });
});

describe('EUR-only budget currency invariant on read models', () => {
  it('rejects legacy non-EUR budget accounts even when allocation envelopes are precomputed', () => {
    db.insert(account)
      .values({
        id: 'legacy-usd-budget',
        name: 'Legacy USD budget',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        currency: 'USD',
        openingDate: '2023-10-01',
        sortOrder: 9,
      })
      .run();

    expect(() => budgetLedger(db)).toThrow(/Euro/i);
    expect(() => allocationMonth(db, '2026-06', {})).toThrow(/Euro/i);
    expect(() => loadFacts(db, '2026-06-30')).toThrow(/Euro/i);

    db.update(account)
      .set({ deletedAt: '2026-06-01T00:00:00.000Z' })
      .where(eq(account.id, 'legacy-usd-budget'))
      .run();
    expect(() => budgetLedger(db)).not.toThrow();
    expect(() => allocationMonth(db, '2026-06', {})).not.toThrow();
    expect(() => loadFacts(db, '2026-06-30')).not.toThrow();
  });
});

describe('C2 "Zu verteilen" from the database', () => {
  it('a YNAB-style month: card spend moves to Kartenzahlung, investing from the budget leg, card overspending is card debt', () => {
    const month = '2026-05';
    for (const [c, v] of [
      ['essen', 40_000],
      ['reise', 10_000],
      ['invest', 50_000],
    ] as const)
      setAssigned(db, c, month, v, ctx);
    spend('giro', '2026-05-01', 300_000, null);
    spend('karte', '2026-05-05', -25_000, 'essen');
    spend('karte', '2026-05-06', -13_000, 'reise'); // 30 € overspent
    transfer('giro', 'depot', '2026-05-10', 50_000, 'invest');
    transfer('giro', 'karte', '2026-05-20', 20_000);
    const [may, june] = budget(db, ['2026-05', '2026-06']);
    expect(may!.envelopes['essen']?.availableCents).toBe(15_000);
    expect(may!.envelopes['reise']?.availableCents).toBe(-3_000);
    expect(may!.envelopes['invest']?.availableCents).toBe(0);
    // YNAB card rule: the 30 € fuel overspent on the card are new card debt, not funded.
    expect(may!.envelopes['kz']?.availableCents).toBe(15_000);
    // Opening 1.000 + salary 3.000 − assigned 1.000.
    expect(may!.toBeAssignedCents).toBe(300_000);
    expect(june!.toBeAssignedCents).toBe(300_000);
    // The concept rule, selectable for the parallel run: full move, the 30 € reduce June.
    const [mayC, juneC] = budget(db, ['2026-05', '2026-06'], { cardRule: 'concept' });
    expect(mayC!.envelopes['kz']?.availableCents).toBe(18_000);
    expect(juneC!.toBeAssignedCents).toBe(297_000);
  });

  it('puts the category on the budget leg, ignores deleted accounts and categories, subtracts held money', () => {
    const r = transfer('depot', 'giro', '2026-05-10', 20_000, 'invest');
    expect(getBooking(db, r.fromBookingId)?.splits[0]?.categoryId).toBeNull();
    expect(getBooking(db, r.toBookingId)?.splits[0]?.categoryId).toBe('invest');
    expect(() => transfer('giro', 'spar', '2026-05-10', 1, 'invest')).toThrow(/neutral/);
    spend('giro', '2026-05-11', -5_000, 'reise');
    categories.softDelete(db, 'reise', ctx); // its activity falls back to "Zu verteilen"
    spend('usd', '2026-05-12', 99_999, null);
    accounts.softDelete(db, 'usd', ctx);
    db.insert(budgetMonth).values({ month: '2026-05', heldCents: 1_000 }).run();
    const [may] = budget(db, ['2026-05']);
    expect(may!.envelopes['invest']?.availableCents).toBe(20_000);
    expect(may!.envelopes['reise']).toBeUndefined();
    expect(may!.toBeAssignedCents).toBe(100_000 + 20_000 - 5_000 - 20_000 - 1_000);
  });
});

describe('A06 categorized income in allocation and rule facts', () => {
  it('counts allowed income categories once, while preserving the other income classifications', () => {
    const incomeCategory = createCategory(
      db,
      { name: 'Lohn', groupId: 'g', kind: 'income', class: null },
      ctx,
    );
    const booking = (
      accountId: string,
      amountCents: number,
      splits: Parameters<typeof createBooking>[1]['splits'],
    ) => createBooking(db, { accountId, date: '2026-06-15', amountCents, splits }, ctx);

    // Same-day categorized and uncategorized salary must both count in allocation, with one R04 day.
    booking('giro', 150_000, [
      { categoryId: incomeCategory.id, amountCents: 100_000, incomeTypeId: INCOME_TYPES.salary.id },
      { categoryId: null, amountCents: 50_000, incomeTypeId: INCOME_TYPES.salary.id },
    ]);
    booking('giro', 40_000, [
      { categoryId: incomeCategory.id, amountCents: 40_000, incomeTypeId: INCOME_TYPES.special.id },
    ]);
    booking('giro', 10_000, [
      { categoryId: null, amountCents: 10_000, incomeTypeId: INCOME_TYPES.refund.id },
    ]);
    booking('giro', 6_000, [
      {
        categoryId: incomeCategory.id,
        amountCents: 6_000,
        incomeTypeId: INCOME_TYPES.contribution.id,
      },
    ]);
    booking('giro', 2_000, [
      { categoryId: 'essen', amountCents: 2_000, incomeTypeId: INCOME_TYPES.refund.id },
    ]);
    booking('giro', 3_000, [{ categoryId: 'auslagen', amountCents: 3_000, contactId: 'k1' }]);
    transfer('giro', 'spar', '2026-06-15', 20_000);
    booking('depot', 25_000, [
      { categoryId: incomeCategory.id, amountCents: 25_000, incomeTypeId: INCOME_TYPES.salary.id },
    ]);
    const deleted = booking('giro', 7_000, [
      { categoryId: incomeCategory.id, amountCents: 7_000, incomeTypeId: INCOME_TYPES.salary.id },
    ]);
    deleteBooking(db, deleted, ctx);
    booking('spar', 4_000, [
      { categoryId: incomeCategory.id, amountCents: 4_000, incomeTypeId: INCOME_TYPES.salary.id },
    ]);
    accounts.update(db, 'spar', { closedAt: '2026-06-16' }, ctx);

    createExpectedPayment(
      db,
      {
        name: 'Sonderzahlung',
        kind: 'inflow',
        accountId: 'giro',
        payeeId: 'p1',
        incomeTypeId: INCOME_TYPES.special.id,
        rhythm: 'yearly',
        dueDay: 15,
        dueMonth: 6,
      },
      { validFrom: '2026-01-01', amountCents: 120_000 },
      ctx,
      '2026-05-01',
    );

    const facts = loadFacts(db, '2026-06-30');
    expect(
      facts.incomeSplits
        .filter((s) => s.incomeTypeId === INCOME_TYPES.salary.id)
        .reduce((sum, split) => sum + split.cents, 0),
    ).toBe(154_000);
    expect(
      facts.incomeSplits
        .filter((s) => s.incomeTypeId === INCOME_TYPES.special.id)
        .reduce((sum, split) => sum + split.cents, 0),
    ).toBe(40_000);
    expect(
      facts.incomeSplits
        .filter((s) => s.incomeTypeId === INCOME_TYPES.refund.id)
        .reduce((sum, split) => sum + split.cents, 0),
    ).toBe(10_000);
    const june = allocationMonth(db, '2026-06', facts.budgetByMonth.get('2026-06')?.envelopes);
    expect([june.incomeCents, june.annualIncomeCents]).toEqual([170_000, 120_000]);
    const inputs = ruleInputs(db, '2026-06-30', facts);
    expect(inputs.allocByMonth?.['2026-06']).toMatchObject({
      incomeCents: 170_000,
      annualIncomeCents: 120_000,
    });
    expect(inputs.payYourself?.salaryDays).toEqual(['2026-06-15']);
    expect(inputs.windfall?.map(({ month, windfallCents }) => [month, windfallCents])).toEqual([
      ['2026-06', 40_000],
    ]);
  });
});

describe('C4 split-level transfers and idempotent transfer import', () => {
  const salary = () =>
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-05-30',
        // The bank shows 2.500 on the current account: 3.000 salary, 500 went to savings directly.
        amountCents: 250_000,
        splits: [
          { amountCents: 300_000, incomeTypeId: 'income-salary' },
          { amountCents: -50_000, transferAccountId: 'spar', memo: 'direkt aufs Sparkonto' },
        ],
      },
      ctx,
    );

  it('one split is a transfer leg: the other leg is a booking with the opposite amount', () => {
    const id = salary();
    const [, leg] = getBooking(db, id)!.splits;
    const other = listBookings(db, { accountId: 'spar' });
    expect(other).toHaveLength(1);
    expect(other[0]).toMatchObject({
      amountCents: 50_000,
      transferId: leg!.transferId,
      date: '2026-05-30',
    });
    // The salary is income; the part moved between two budget accounts is neutral.
    const [may] = budget(db, ['2026-05']);
    expect(may!.incomeCents).toBe(300_000);
    expect(may!.toBeAssignedCents).toBe(100_000 + 300_000);
  });

  it('deleting either side deletes both; changing the amount is refused', () => {
    const id = salary();
    const spar = listBookings(db, { accountId: 'spar' })[0]!;
    expect(() => updateBooking(db, spar.id, { amountCents: 40_000 }, ctx)).toThrow(
      /split-level transfer/,
    );
    expect(() => updateBooking(db, id, { splits: [{ amountCents: 250_000 }] }, ctx)).toThrow(
      /split-level transfer/,
    );
    deleteBooking(db, spar.id, ctx);
    expect(listBookings(db)).toHaveLength(0);
  });

  it('importTransfer: created, then existing; two plain bookings get linked; a one-legged pair is repaired', () => {
    const t = {
      fromAccountId: 'giro',
      toAccountId: 'depot',
      date: '2026-05-10',
      amountCents: 5_000,
      categoryId: 'invest',
    };
    expect(importTransfer(db, { ...t, importKey: 'k1' }, ctx).outcome).toBe('created');
    expect(importTransfer(db, { ...t, importKey: 'k1' }, ctx).outcome).toBe('existing');
    // Two files imported one at a time: both legs exist as plain bookings.
    imported('giro', '2026-05-11', -700, 'k2', 'invest');
    imported('depot', '2026-05-11', 700, 'k2');
    const linked = importTransfer(
      db,
      { ...t, date: '2026-05-11', amountCents: 700, importKey: 'k2' },
      ctx,
    );
    expect(linked.outcome).toBe('linked');
    expect(getBooking(db, linked.toBookingId)?.transferId).toBe(linked.transferId);
    // Only one leg arrived earlier: the partner is created.
    imported('giro', '2026-05-12', -300, 'k3', 'invest');
    const repaired = importTransfer(
      db,
      { ...t, date: '2026-05-12', amountCents: 300, importKey: 'k3' },
      ctx,
    );
    expect(repaired.outcome).toBe('linked');
    expect(getBooking(db, repaired.toBookingId)).toMatchObject({
      accountId: 'depot',
      amountCents: 300,
    });
    expect(
      importTransfer(db, { ...t, date: '2026-05-12', amountCents: 300, importKey: 'k3' }, ctx)
        .outcome,
    ).toBe('existing');
    // A leg the user deleted is not resurrected.
    deleteBooking(db, repaired.fromBookingId, ctx);
    expect(
      importTransfer(db, { ...t, date: '2026-05-12', amountCents: 300, importKey: 'k3' }, ctx)
        .outcome,
    ).toBe('existing');
    expect(listBookings(db).filter((b) => b.importKey === 'k3')).toHaveLength(0);
  });
});

describe('C8 undo keeps the invariants', () => {
  it('a single split or transfer-leg entry cannot be undone; the group can', () => {
    const r = transfer('giro', 'spar', '2026-05-10', 5_000);
    const [entry] = history(db, 'booking', r.toBookingId);
    expect(() => undo(db, { auditId: entry!.id }, ctx)).toThrow(/whole action/);
    const id = spend('giro', '2026-05-11', -1_000, 'essen');
    const split = getBooking(db, id)!.splits[0]!;
    const [splitEntry] = history(db, 'booking_split', split.id);
    expect(() => undo(db, { auditId: splitEntry!.id }, ctx)).toThrow(/whole action/);
    undo(db, { groupId: entry!.groupId! }, ctx);
    expect(listBookings(db, { accountId: 'spar' })).toHaveLength(0);
    expect(listBookings(db, { accountId: 'giro' })).toHaveLength(1);
  });

  it('an undo that would unbalance a booking is refused and rolled back, even with force', () => {
    const id = spend('giro', '2026-05-11', -1_000, 'essen');
    updateBooking(db, id, { amountCents: -1_500 }, ctx); // the single split follows
    const bookingEntry = history(db, 'booking', id).find((e) => e.action === 'update')!;
    expect(() => undo(db, { auditId: bookingEntry.id }, ctx, { force: true })).toThrow(
      /splits sum/,
    );
    expect(getBooking(db, id)).toMatchObject({ amountCents: -1_500 });
    undo(db, { groupId: bookingEntry.groupId! }, ctx);
    expect(getBooking(db, id)?.amountCents).toBe(-1_000);
  });

  it('never leaves a one-legged transfer', () => {
    const r = transfer('giro', 'spar', '2026-05-10', 5_000);
    deleteBooking(db, r.fromBookingId, ctx);
    const deletion = history(db, 'booking', r.fromBookingId).find((e) => e.action === 'delete')!;
    undo(db, { groupId: deletion.groupId! }, ctx);
    expect(
      listBookings(db)
        .map((b) => b.id)
        .sort(),
    ).toEqual([r.fromBookingId, r.toBookingId].sort());
    // Tampering outside the repositories is caught by the next write that touches the pair.
    db.update(booking)
      .set({ deletedAt: '2026-06-01T00:00:00Z' })
      .where(eq(booking.id, r.toBookingId))
      .run();
    expect(() => updateBooking(db, r.fromBookingId, { memo: 'x' }, ctx)).toThrow(/live leg/);
  });
});

describe('C11 opening envelopes', () => {
  it('start the first month separately from its assignment; any later month sees the same carry', () => {
    opened.sqlite.exec(`UPDATE category SET opening_available_cents = 60000 WHERE id = 'essen'`);
    setAssigned(db, 'essen', '2023-10', 10_000, ctx);
    const [oct] = budget(db, ['2023-10']);
    expect(oct!.envelopes['essen']).toMatchObject({ carryCents: 60_000, assignedCents: 10_000 });
    // Giro opened with 1.000 €: 600 € are already in the envelope, 100 € assigned.
    expect(oct!.toBeAssignedCents).toBe(100_000 - 70_000);
    const [jan] = budget(db, ['2024-01']);
    expect(jan!.envelopes['essen']?.carryCents).toBe(70_000);
  });
});
