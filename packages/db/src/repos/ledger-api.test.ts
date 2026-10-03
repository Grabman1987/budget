import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { booking, payee } from '../schema';
import { undo } from './audit';
import {
  createBooking,
  createTransfer,
  deleteBooking,
  getBooking,
  updateBooking,
} from './bookings';
import { ConflictError, ReconciledLockedError } from './errors';
import { createEntity } from './entities';
import { accountSummaries, balanceSeries, queryBookings } from './ledger-queries';
import { createPayee, listPayees, mergePayees, renamePayee } from './payees';
import { previewReconciliation, reconcileAccount } from './reconciliation';
import { seedBasics, testCtx as ctx } from './test-helpers';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
});
afterEach(() => opened.close());

const book = (
  over: Partial<Parameters<typeof createBooking>[1]> & { cents?: number } = {},
): string => {
  const { cents = -1000, ...rest } = over;
  return createBooking(
    db,
    {
      accountId: 'giro',
      date: '2026-03-10',
      amountCents: cents,
      splits: [{ categoryId: cents < 0 ? 'essen' : null, amountCents: cents }],
      ...rest,
    },
    ctx,
  );
};
const status = (id: string) => getBooking(db, id)!.status;

describe('reconciled bookings are locked', () => {
  it('refuses amount, date, splits, payee, status and delete; flag and memo stay free', () => {
    const id = book({ status: 'reconciled' });
    for (const patch of [
      { amountCents: -2000 },
      { date: '2026-03-11' },
      { payeeId: 'p1' },
      { status: 'confirmed' as const },
      { splits: [{ categoryId: 'miete', amountCents: -1000 }] },
    ]) {
      expect(() => updateBooking(db, id, patch, ctx), JSON.stringify(patch)).toThrow(
        ReconciledLockedError,
      );
    }
    expect(() => deleteBooking(db, id, ctx)).toThrow(ReconciledLockedError);
    updateBooking(db, id, { flag: 'red', memo: 'Notiz' }, ctx);
    expect(getBooking(db, id)).toMatchObject({ flag: 'red', memo: 'Notiz', amountCents: -1000 });
  });

  it('unlocks explicitly, keeps the status and stays undoable', () => {
    const id = book({ status: 'reconciled' });
    updateBooking(
      db,
      id,
      { amountCents: -1500 },
      { ...ctx, groupId: 'g1' },
      { unlockReconciled: true },
    );
    expect(getBooking(db, id)).toMatchObject({ amountCents: -1500, status: 'reconciled' });
    undo(db, { groupId: 'g1' }, ctx);
    expect(getBooking(db, id)?.amountCents).toBe(-1000);
    deleteBooking(db, id, ctx, { unlockReconciled: true });
    expect(getBooking(db, id)).toBeUndefined();
  });

  it('locks a transfer through its reconciled leg', () => {
    const t = createTransfer(
      db,
      { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-03-10', amountCents: 5000 },
      ctx,
    );
    updateBooking(db, t.toBookingId, { status: 'reconciled' }, ctx, { unlockReconciled: true });
    expect(() => updateBooking(db, t.fromBookingId, { amountCents: -6000 }, ctx)).toThrow(
      ReconciledLockedError,
    );
    expect(() => deleteBooking(db, t.fromBookingId, ctx)).toThrow(ReconciledLockedError);
    expect(getBooking(db, t.fromBookingId)?.amountCents).toBe(-5000);
  });
});

describe('accountSummaries', () => {
  it('splits the balance into cleared, uncleared and scheduled, by the opening-date rule', () => {
    book({ cents: -1000, date: '2023-09-30' }); // before the opening date: part of the opening balance
    book({ cents: 50_000, date: '2026-03-01' });
    book({ cents: -2000, date: '2026-03-05', status: 'pending' });
    book({ cents: -300, date: '2026-03-20' }); // after "today": scheduled
    const giro = accountSummaries(db, '2026-03-10').find((a) => a.id === 'giro')!;
    expect(giro).toMatchObject({
      balanceCents: 100_000 + 50_000 - 2000,
      clearedCents: 150_000,
      unclearedCents: -2000,
      scheduledCents: -300,
      bookingCount: 4, // the one before the opening date counts as a booking, not as balance
      pendingCount: 1,
      lastReconciledOn: null,
    });
    expect(giro.balanceCents).toBe(giro.clearedCents + giro.unclearedCents);
    expect(accountSummaries(db, '2023-09-01').find((a) => a.id === 'giro')?.balanceCents).toBe(0);
  });

  it('leaves out deleted bookings and reports the last check', () => {
    const id = book({ cents: -500 });
    deleteBooking(db, id, ctx);
    book({ cents: 7000 });
    reconcileAccount(
      db,
      { accountId: 'giro', date: '2026-03-10', statementBalanceCents: 107_000 },
      ctx,
    );
    expect(accountSummaries(db, '2026-03-10').find((a) => a.id === 'giro')).toMatchObject({
      balanceCents: 107_000,
      bookingCount: 1,
      lastReconciledOn: '2026-03-10',
    });
  });
});

describe('balanceSeries', () => {
  it('gives the end-of-day balance for every day', () => {
    book({ cents: -1000, date: '2026-03-02' });
    book({ cents: -500, date: '2026-03-02' });
    book({ cents: 2000, date: '2026-03-04' });
    const series = balanceSeries(db, 'giro', { from: '2026-03-01', to: '2026-03-05' });
    expect(series.map((p) => p.balanceCents)).toEqual([100_000, 98_500, 98_500, 100_500, 100_500]);
    expect(() => balanceSeries(db, 'giro', { from: '2026-03-05', to: '2026-03-01' })).toThrow(
      RangeError,
    );
  });

  it('is 0 before the account exists', () => {
    const [first] = balanceSeries(db, 'giro', { from: '2023-09-30', to: '2023-10-01' });
    expect(first?.balanceCents).toBe(0);
  });
});

describe('queryBookings', () => {
  beforeEach(() => {
    createEntity(db, payee, { id: 'p2', name: 'Über-Markt' }, ctx);
    book({ cents: -1200, date: '2026-03-01', payeeId: 'p1', memo: 'Miete März' });
    book({ cents: -800, date: '2026-03-02', payeeId: 'p2', memo: 'Einkauf', flag: 'red' });
    book({ cents: 250_000, date: '2026-03-03', status: 'pending' });
    book({ cents: -450, date: '2026-03-04', accountId: 'spar' });
    book({ cents: -900, date: '2026-03-05', payeeId: 'p2', splits: [{ amountCents: -900 }] });
  });

  it('filters by account, dates, category, payee, status and flag', () => {
    const ids = (q: Parameters<typeof queryBookings>[1]) =>
      queryBookings(db, q).items.map((i) => i.date);
    expect(ids({ accountId: 'spar' })).toEqual(['2026-03-04']);
    expect(ids({ from: '2026-03-02', to: '2026-03-03' })).toEqual(['2026-03-03', '2026-03-02']);
    expect(ids({ categoryId: 'essen' })).toEqual(['2026-03-04', '2026-03-02', '2026-03-01']);
    expect(ids({ categoryId: 'none' })).toEqual(['2026-03-05', '2026-03-03']);
    expect(ids({ payeeId: 'p2' })).toEqual(['2026-03-05', '2026-03-02']);
    expect(ids({ status: 'pending' })).toEqual(['2026-03-03']);
    expect(ids({ flag: 'red' })).toEqual(['2026-03-02']);
    expect(ids({ flag: 'none' })).toHaveLength(4);
  });

  it('searches memo, payee, category and account, case-insensitive also for umlauts', () => {
    const dates = (text: string) => queryBookings(db, { text }).items.map((i) => i.date);
    expect(dates('miete')).toEqual(['2026-03-01']); // memo (and the payee is not "Miete")
    expect(dates('vermieter')).toEqual(['2026-03-01']); // payee
    expect(dates('über')).toEqual(['2026-03-05', '2026-03-02']);
    expect(dates('ÜBER')).toEqual(['2026-03-05', '2026-03-02']);
    expect(dates('sparen')).toEqual(['2026-03-04']); // account name
    expect(dates('essen')).toContain('2026-03-01'); // category name
    expect(dates('100%')).toEqual([]); // wildcards are literal
  });

  it('reports the total and sum of the filter, not of the page', () => {
    const page = queryBookings(db, { accountId: 'giro', limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(4);
    expect(page.sumCents).toBe(-1200 - 800 + 250_000 - 900);
  });

  it('pages through every booking exactly once, whatever the sort', () => {
    for (const sort of ['date', 'amount', 'payee', 'account'] as const) {
      for (const direction of ['asc', 'desc'] as const) {
        const seen: string[] = [];
        let cursor: string | undefined;
        do {
          const page = queryBookings(db, {
            sort,
            direction,
            limit: 2,
            ...(cursor ? { cursor } : {}),
          });
          seen.push(...page.items.map((i) => i.id));
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        expect(new Set(seen).size, `${sort} ${direction}`).toBe(5);
        expect(seen).toHaveLength(5);
      }
    }
    const byAmount = queryBookings(db, { sort: 'amount', direction: 'asc' }).items.map(
      (i) => i.amountCents,
    );
    expect(byAmount).toEqual([...byAmount].sort((a, b) => a - b));
  });

  it('rejects a broken cursor', () => {
    expect(() => queryBookings(db, { cursor: 'nonsense' })).toThrow(RangeError);
  });

  it('gives the running balance for one account and the other account of a transfer', () => {
    const t = createTransfer(
      db,
      { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-03-06', amountCents: 5000 },
      ctx,
    );
    const { items } = queryBookings(db, { accountId: 'giro', sort: 'date', direction: 'desc' });
    expect(items.map((i) => i.balanceAfterCents)).toEqual([
      100_000 - 1200 - 800 + 250_000 - 900 - 5000,
      100_000 - 1200 - 800 + 250_000 - 900,
      100_000 - 1200 - 800 + 250_000,
      100_000 - 1200 - 800,
      100_000 - 1200,
    ]);
    const leg = items.find((i) => i.id === t.fromBookingId)!;
    expect(leg).toMatchObject({ transferAccountId: 'spar', transferAccountName: 'Sparen' });
    expect(queryBookings(db, {}).items[0]?.balanceAfterCents).toBeNull();
  });
});

describe('payees', () => {
  it('creates, refuses duplicates and renames', () => {
    const created = createPayee(db, { name: '  Bäcker   Müller ' }, ctx);
    expect(created.name).toBe('Bäcker Müller');
    expect(() => createPayee(db, { name: 'bäcker müller' }, ctx)).toThrow(ConflictError);
    expect(() => createPayee(db, { name: '   ' }, ctx)).toThrow(ConflictError);
    expect(renamePayee(db, created.id, 'Bäckerei', ctx).name).toBe('Bäckerei');
    expect(() => renamePayee(db, created.id, 'Vermieter', ctx)).toThrow(ConflictError);
  });

  it('keeps system payees fixed', () => {
    expect(() => renamePayee(db, 'payee-reconciliation', 'X', ctx)).toThrow(ConflictError);
    expect(() => mergePayees(db, ['p1'], 'payee-opening-balance', ctx)).toThrow(ConflictError);
  });

  it('merges into the target in one undoable group', () => {
    createEntity(db, payee, { id: 'p2', name: 'Vermieter GmbH' }, ctx);
    const a = book({ payeeId: 'p1' });
    const b = book({ payeeId: 'p2' });
    const result = mergePayees(db, ['p2'], 'p1', { ...ctx, groupId: 'merge' });
    expect(result.moved).toBe(1);
    expect(getBooking(db, b)?.payeeId).toBe('p1');
    expect(getBooking(db, a)?.payeeId).toBe('p1');
    expect(listPayees(db).map((p) => p.id)).not.toContain('p2');
    expect(listPayees(db).find((p) => p.id === 'p1')?.bookingCount).toBe(2);
    undo(db, { groupId: 'merge' }, ctx);
    expect(getBooking(db, b)?.payeeId).toBe('p2');
    expect(listPayees(db).map((p) => p.id)).toContain('p2');
    expect(() => mergePayees(db, [], 'p1', ctx)).toThrow(ConflictError);
  });

  it('leaves reconciled bookings with their payee unless unlocked, and keeps that source', () => {
    createEntity(db, payee, { id: 'p2', name: 'Vermieter GmbH' }, ctx);
    createEntity(db, payee, { id: 'p3', name: 'Vermieter AG' }, ctx);
    const open = book({ payeeId: 'p2' });
    const locked = book({ payeeId: 'p2', status: 'reconciled' });
    const other = book({ payeeId: 'p3' });
    const result = mergePayees(db, ['p2', 'p3'], 'p1', { ...ctx, groupId: 'merge' });
    expect(result).toMatchObject({ moved: 2, skipped: 1, keptSourceIds: ['p2'] });
    expect([open, locked, other].map((id) => getBooking(db, id)?.payeeId)).toEqual([
      'p1',
      'p2',
      'p1',
    ]);
    expect(listPayees(db).map((p) => p.id)).toContain('p2');
    expect(listPayees(db).map((p) => p.id)).not.toContain('p3');

    const unlocked = mergePayees(db, ['p2'], 'p1', ctx, { unlockReconciled: true });
    expect(unlocked).toMatchObject({ moved: 1, skipped: 0, keptSourceIds: [] });
    expect(getBooking(db, locked)).toMatchObject({ payeeId: 'p1', status: 'reconciled' });
    expect(listPayees(db).map((p) => p.id)).not.toContain('p2');
  });
});

describe('Kontostand prüfen', () => {
  const day = '2026-03-31';
  const setup = () => {
    const a = book({ cents: 20_000, date: '2026-03-01', status: 'confirmed' });
    const b = book({ cents: -3000, date: '2026-03-15', status: 'confirmed', payeeId: 'p1' });
    return { a, b };
  };

  it('agrees: the bank balance equals the booked balance', () => {
    setup();
    const preview = previewReconciliation(db, {
      accountId: 'giro',
      date: day,
      statementBalanceCents: 117_000,
    });
    expect(preview).toMatchObject({
      bookedBalanceCents: 117_000,
      differenceCents: 0,
      toReconcileCount: 2,
      duplicates: [],
      pendingMatches: [],
      missing: null,
    });
  });

  it('leaves pending bookings out of the check', () => {
    setup();
    book({ cents: -500, date: '2026-03-20', status: 'pending' });
    const preview = previewReconciliation(db, {
      accountId: 'giro',
      date: day,
      statementBalanceCents: 117_000,
    });
    expect(preview).toMatchObject({
      bookedBalanceCents: 117_000,
      pendingCents: -500,
      differenceCents: 0,
    });
  });

  it('finds "doppelt": the same booking twice explains the difference', () => {
    const { b } = setup();
    const twin = book({ cents: -3000, date: '2026-03-15', status: 'confirmed', payeeId: 'p1' });
    // Distinct synthetic capture times: equal millisecond defaults otherwise sort by random UUID.
    db.update(booking)
      .set({ createdAt: '2026-03-15T08:00:00.000Z' })
      .where(eq(booking.id, b))
      .run();
    db.update(booking)
      .set({ createdAt: '2026-03-15T09:00:00.000Z' })
      .where(eq(booking.id, twin))
      .run();
    const preview = previewReconciliation(db, {
      accountId: 'giro',
      date: day,
      statementBalanceCents: 117_000,
    });
    expect(preview.differenceCents).toBe(3000);
    expect(preview.duplicates).toEqual([
      expect.objectContaining({
        removeId: twin,
        keepId: b,
        amountCents: -3000,
        explainsDifference: true,
      }),
    ]);
    expect(preview.missing).toBeNull();
  });

  it('finds "fehlt": a pending booking the bank has booked, or a missing booking', () => {
    setup();
    const pending = book({ cents: -700, date: '2026-03-20', status: 'pending' });
    const explained = previewReconciliation(db, {
      accountId: 'giro',
      date: day,
      statementBalanceCents: 116_300,
    });
    expect(explained.pendingMatches).toEqual([{ bookingIds: [pending], sumCents: -700 }]);
    expect(explained.missing).toBeNull();
    const missing = previewReconciliation(db, {
      accountId: 'giro',
      date: day,
      statementBalanceCents: 116_900,
    });
    expect(missing.missing).toEqual({ kind: 'expense', amountCents: 100 });
    expect(
      previewReconciliation(db, { accountId: 'giro', date: day, statementBalanceCents: 117_400 })
        .missing,
    ).toEqual({ kind: 'income', amountCents: 400 });
  });

  it('confirms: stamps every confirmed booking up to the day, keeps later and pending ones', () => {
    const { a, b } = setup();
    const later = book({ cents: -100, date: '2026-04-02', status: 'confirmed' });
    const pending = book({ cents: -100, date: '2026-03-30', status: 'pending' });
    const result = reconcileAccount(
      db,
      { accountId: 'giro', date: day, statementBalanceCents: 117_000, note: 'März' },
      ctx,
    );
    expect(result).toMatchObject({
      differenceCents: 0,
      adjustmentBookingId: null,
      reconciledCount: 2,
    });
    expect([status(a), status(b), status(later), status(pending)]).toEqual([
      'reconciled',
      'reconciled',
      'confirmed',
      'pending',
    ]);
    expect(accountSummaries(db, day).find((x) => x.id === 'giro')?.lastReconciledOn).toBe(day);
  });

  it('removes a duplicate and confirms a pending booking, then stamps', () => {
    setup();
    const twin = book({ cents: -3000, date: '2026-03-15', status: 'confirmed', payeeId: 'p1' });
    const pending = book({ cents: -700, date: '2026-03-20', status: 'pending' });
    reconcileAccount(
      db,
      {
        accountId: 'giro',
        date: day,
        statementBalanceCents: 116_300,
        removeBookingIds: [twin],
        confirmBookingIds: [pending],
      },
      ctx,
    );
    expect(getBooking(db, twin)).toBeUndefined();
    expect(status(pending)).toBe('reconciled');
  });

  it('refuses a day after today, so a future booking is never stamped', () => {
    setup();
    const future = book({ cents: -100, date: '2026-04-02', status: 'confirmed' });
    const input = { accountId: 'giro', date: '2026-04-02', statementBalanceCents: 116_900 };
    expect(() => previewReconciliation(db, { ...input, today: day })).toThrow(/future/);
    expect(() => reconcileAccount(db, { ...input, today: day }, ctx)).toThrow(/future/);
    expect(status(future)).toBe('confirmed');
    reconcileAccount(db, { ...input, today: '2026-04-02' }, ctx);
    expect(status(future)).toBe('reconciled');
  });

  it('refuses a remaining difference without the Ausgleich and writes nothing', () => {
    const { a } = setup();
    expect(() =>
      reconcileAccount(db, { accountId: 'giro', date: day, statementBalanceCents: 116_000 }, ctx),
    ).toThrow(ConflictError);
    expect(status(a)).toBe('confirmed');
    expect(
      db
        .select()
        .from(booking)
        .all()
        .filter((x) => x.source === 'system'),
    ).toHaveLength(0);
  });

  it('books the Ausgleich as a reconciled system booking with the reconciliation payee', () => {
    setup();
    const result = reconcileAccount(
      db,
      { accountId: 'giro', date: day, statementBalanceCents: 116_000, adjust: true },
      ctx,
    );
    expect(result.differenceCents).toBe(-1000);
    const adjustment = getBooking(db, result.adjustmentBookingId!)!;
    expect(adjustment).toMatchObject({
      amountCents: -1000,
      status: 'reconciled',
      source: 'system',
      payeeId: 'payee-reconciliation',
      date: day,
    });
    expect(adjustment.splits).toHaveLength(1);
    expect(
      previewReconciliation(db, { accountId: 'giro', date: day, statementBalanceCents: 116_000 })
        .differenceCents,
    ).toBe(0);
  });

  it('undoes the whole check in one step', () => {
    const { a } = setup();
    const twin = book({ cents: -3000, date: '2026-03-15', status: 'confirmed', payeeId: 'p1' });
    const result = reconcileAccount(
      db,
      {
        accountId: 'giro',
        date: day,
        statementBalanceCents: 116_000,
        removeBookingIds: [twin],
        adjust: true,
        note: 'x',
      },
      { ...ctx, groupId: 'check' },
    );
    expect(result.adjustmentBookingId).not.toBeNull();
    undo(db, { groupId: 'check' }, ctx);
    expect(status(a)).toBe('confirmed');
    expect(getBooking(db, twin)?.status).toBe('confirmed');
    expect(getBooking(db, result.adjustmentBookingId!)).toBeUndefined();
    expect(accountSummaries(db, day).find((x) => x.id === 'giro')?.lastReconciledOn).toBeNull();
    expect(db.select().from(booking).where(eq(booking.status, 'reconciled')).all()).toHaveLength(0);
  });

  it('refuses foreign bookings and transfer legs as duplicates', () => {
    const other = book({ accountId: 'spar', cents: -100, date: '2026-03-05' });
    const t = createTransfer(
      db,
      { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-03-06', amountCents: 100 },
      ctx,
    );
    const attempt = (id: string) =>
      reconcileAccount(
        db,
        { accountId: 'giro', date: day, statementBalanceCents: 100_000, removeBookingIds: [id] },
        ctx,
      );
    expect(() => attempt(other)).toThrow('not on this account');
    expect(() => attempt(t.fromBookingId)).toThrow('plain bookings');
  });
});
