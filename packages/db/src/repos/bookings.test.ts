import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { booking, bookingSplit } from '../schema';
import { history, undo } from './audit';
import {
  type BookingInput,
  type ImportBookingInput,
  createBooking,
  createTransfer,
  deleteBooking,
  getBooking,
  importBooking,
  listBookings,
  restoreBooking,
  updateBooking,
} from './bookings';
import { accounts } from './entities';
import { BookingInvariantError, EntityNotFoundError } from './errors';
import { seedBasics, testCtx as ctx } from './test-helpers';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
});
afterEach(() => opened.close());

const basic = (
  over: Partial<Parameters<typeof createBooking>[1]> = {},
): Parameters<typeof createBooking>[1] => ({
  accountId: 'giro',
  date: '2026-01-05',
  amountCents: -1200,
  splits: [{ categoryId: 'essen', amountCents: -1200 }],
  ...over,
});

describe('createBooking', () => {
  it('creates a booking with its splits and returns the id', () => {
    const id = createBooking(
      db,
      basic({
        amountCents: -1000,
        payeeId: 'p1',
        memo: 'Einkauf',
        splits: [
          { categoryId: 'essen', amountCents: -700, memo: 'Obst' },
          { categoryId: 'auslagen', amountCents: -300, contactId: 'k1' },
        ],
      }),
      ctx,
    );
    const b = getBooking(db, id)!;
    expect(b).toMatchObject({
      accountId: 'giro',
      date: '2026-01-05',
      amountCents: -1000,
      payeeId: 'p1',
      memo: 'Einkauf',
      status: 'confirmed',
      source: 'manual',
      currency: 'EUR',
      transferId: null,
    });
    expect(
      b.splits.map((s) => [s.categoryId, s.amountCents, s.memo, s.contactId, s.sortOrder]),
    ).toEqual([
      ['essen', -700, 'Obst', null, 0],
      ['auslagen', -300, null, 'k1', 1],
    ]);
  });

  it('takes the currency from the account unless given, and stores foreign-currency fields', () => {
    const usd = createBooking(db, basic({ accountId: 'usd' }), ctx);
    expect(getBooking(db, usd)?.currency).toBe('USD');
    const fx = createBooking(
      db,
      basic({
        originalAmountCents: -1300,
        originalCurrency: 'USD',
        fxRateMicro: 935_000,
        fxFeeCents: 15,
      }),
      ctx,
    );
    expect(getBooking(db, fx)).toMatchObject({
      originalAmountCents: -1300,
      originalCurrency: 'USD',
      fxRateMicro: 935_000,
      fxFeeCents: 15,
    });
  });

  it('allows an uncategorized inflow (Zu verteilen)', () => {
    const id = createBooking(
      db,
      basic({ amountCents: 250_000, splits: [{ amountCents: 250_000 }] }),
      ctx,
    );
    expect(getBooking(db, id)?.splits[0]?.categoryId).toBeNull();
  });

  it('rejects a split sum that differs from the amount, with a clear message', () => {
    expect(() =>
      createBooking(db, basic({ splits: [{ categoryId: 'essen', amountCents: -1100 }] }), ctx),
    ).toThrow(BookingInvariantError);
    expect(() =>
      createBooking(db, basic({ splits: [{ categoryId: 'essen', amountCents: -1100 }] }), ctx),
    ).toThrow(/sum to -1100.*-1200/);
    expect(db.select().from(booking).all()).toHaveLength(0);
  });

  it('rejects missing splits, non-integer cents and bad dates', () => {
    expect(() => createBooking(db, basic({ splits: [] }), ctx)).toThrow(/at least one split/);
    expect(() =>
      createBooking(db, basic({ amountCents: -12.5, splits: [{ amountCents: -12.5 }] }), ctx),
    ).toThrow(/integer/);
    expect(() => createBooking(db, basic({ date: '05.01.2026' }), ctx)).toThrow(/YYYY-MM-DD/);
  });

  it('rejects unknown or deleted accounts', () => {
    expect(() => createBooking(db, basic({ accountId: 'nope' }), ctx)).toThrow(
      BookingInvariantError,
    );
    accounts.softDelete(db, 'spar', ctx);
    expect(() => createBooking(db, basic({ accountId: 'spar' }), ctx)).toThrow(/Account spar/);
  });

  it('writes booking and splits in one audit group; undo soft-deletes the booking', () => {
    const id = createBooking(
      db,
      basic({
        amountCents: -1000,
        splits: [
          { categoryId: 'essen', amountCents: -600 },
          { categoryId: 'reise', amountCents: -400 },
        ],
      }),
      ctx,
    );
    const [entry] = history(db, 'booking', id);
    const groupEntries = db
      .select()
      .from(bookingSplit)
      .where(eq(bookingSplit.bookingId, id))
      .all()
      .flatMap((s) => history(db, 'booking_split', s.id));
    expect(groupEntries).toHaveLength(2);
    expect(new Set([entry!.groupId, ...groupEntries.map((e) => e.groupId)]).size).toBe(1);
    expect(entry!.groupId).not.toBeNull();
    undo(db, { groupId: entry!.groupId! }, ctx);
    expect(getBooking(db, id)).toBeUndefined();
    expect(getBooking(db, id, { includeDeleted: true })?.deletedAt).not.toBeNull();
    // redo brings back booking and splits
    const [u] = history(db, 'booking', id);
    undo(db, { groupId: u!.groupId! }, ctx);
    expect(getBooking(db, id)?.splits).toHaveLength(2);
  });

  it('is atomic: a failing insert leaves nothing behind', () => {
    expect(() =>
      createBooking(
        db,
        basic({ splits: [{ categoryId: 'essen', amountCents: -1200, incomeTypeId: 'unknown' }] }),
        ctx,
      ),
    ).toThrow(/FOREIGN KEY/);
    expect(db.select().from(booking).all()).toHaveLength(0);
    expect(db.select().from(bookingSplit).all()).toHaveLength(0);
  });
});

describe('createTransfer', () => {
  const t = (over = {}) => ({
    fromAccountId: 'giro',
    toAccountId: 'spar',
    date: '2026-02-01',
    amountCents: 5000,
    ...over,
  });

  it('creates two opposite bookings sharing the transfer id', () => {
    const r = createTransfer(db, t({ memo: 'Sparen' }), ctx);
    const from = getBooking(db, r.fromBookingId)!;
    const to = getBooking(db, r.toBookingId)!;
    expect(from).toMatchObject({
      accountId: 'giro',
      amountCents: -5000,
      transferId: r.transferId,
      memo: 'Sparen',
    });
    expect(to).toMatchObject({ accountId: 'spar', amountCents: 5000, transferId: r.transferId });
    // Between two budget accounts a transfer is neutral: no category on either leg.
    expect(from.splits).toEqual([
      expect.objectContaining({ categoryId: null, amountCents: -5000 }),
    ]);
    expect(() => createTransfer(db, t({ categoryId: 'reise' }), ctx)).toThrow(/neutral/);
    expect(to.splits).toEqual([expect.objectContaining({ categoryId: null, amountCents: 5000 })]);
  });

  it('rejects the same account, non-positive or fractional amounts, and mixed currencies', () => {
    expect(() => createTransfer(db, t({ toAccountId: 'giro' }), ctx)).toThrow(/same account/);
    expect(() => createTransfer(db, t({ amountCents: 0 }), ctx)).toThrow(/positive/);
    expect(() => createTransfer(db, t({ amountCents: -5 }), ctx)).toThrow(/positive/);
    expect(() => createTransfer(db, t({ amountCents: 1.5 }), ctx)).toThrow(/integer/);
    expect(() => createTransfer(db, t({ toAccountId: 'usd' }), ctx)).toThrow(/currenc/);
    expect(db.select().from(booking).all()).toHaveLength(0);
  });

  it('applies import keys to both legs (per account) and undoes as one group', () => {
    const r = createTransfer(db, t({ importKey: 'tr-1', source: 'import' }), ctx);
    expect(getBooking(db, r.fromBookingId)).toMatchObject({ importKey: 'tr-1', source: 'import' });
    expect(getBooking(db, r.toBookingId)?.importKey).toBe('tr-1');
    const gid = history(db, 'booking', r.fromBookingId)[0]!.groupId!;
    expect(history(db, 'booking', r.toBookingId)[0]!.groupId).toBe(gid);
    undo(db, { groupId: gid }, ctx);
    expect(listBookings(db)).toHaveLength(0);
  });
});

describe('updateBooking', () => {
  it('changes fields and replaces splits with re-validation', () => {
    const id = createBooking(db, basic(), ctx);
    updateBooking(db, id, { memo: 'neu', payeeId: 'p1', date: '2026-01-06' }, ctx);
    expect(getBooking(db, id)).toMatchObject({ memo: 'neu', payeeId: 'p1', date: '2026-01-06' });
    expect(() => updateBooking(db, id, { splits: [{ amountCents: -1 }] }, ctx)).toThrow(
      BookingInvariantError,
    );
    updateBooking(
      db,
      id,
      {
        splits: [
          { categoryId: 'essen', amountCents: -1000 },
          { categoryId: 'reise', amountCents: -200 },
        ],
      },
      ctx,
    );
    expect(getBooking(db, id)?.splits.map((s) => s.amountCents)).toEqual([-1000, -200]);
    updateBooking(db, id, { splits: [{ categoryId: 'miete', amountCents: -1200 }] }, ctx);
    const b = getBooking(db, id)!;
    expect(b.splits).toHaveLength(1);
    expect(b.splits[0]?.categoryId).toBe('miete');
    expect(db.select().from(bookingSplit).all()).toHaveLength(1);
  });

  it('follows an amount change with a single split and demands splits otherwise', () => {
    const id = createBooking(db, basic(), ctx);
    updateBooking(db, id, { amountCents: -2000 }, ctx);
    expect(getBooking(db, id)?.splits[0]?.amountCents).toBe(-2000);
    updateBooking(
      db,
      id,
      {
        splits: [
          { categoryId: 'essen', amountCents: -1500 },
          { categoryId: 'reise', amountCents: -500 },
        ],
      },
      ctx,
    );
    expect(() => updateBooking(db, id, { amountCents: -3000 }, ctx)).toThrow(/splits/);
    updateBooking(
      db,
      id,
      { amountCents: -3000, splits: [{ categoryId: 'essen', amountCents: -3000 }] },
      ctx,
    );
    expect(getBooking(db, id)?.amountCents).toBe(-3000);
  });

  it('writes one audit group for all changed rows and undoes it', () => {
    const id = createBooking(db, basic(), ctx);
    updateBooking(db, id, { memo: 'x', amountCents: -1500 }, { actor: 'tester', groupId: 'upd' });
    const g = history(db, 'booking', id)[0]!;
    expect(g.groupId).toBe('upd');
    undo(db, { groupId: 'upd' }, ctx);
    const b = getBooking(db, id)!;
    expect(b.memo).toBeNull();
    expect(b.amountCents).toBe(-1200);
    expect(b.splits[0]?.amountCents).toBe(-1200);
  });

  it('writes nothing for an unchanged patch', () => {
    const id = createBooking(db, basic(), ctx);
    const n = history(db, 'booking', id).length;
    updateBooking(db, id, { memo: null, amountCents: -1200 }, ctx);
    expect(history(db, 'booking', id)).toHaveLength(n);
  });

  it('throws for missing or deleted bookings', () => {
    expect(() => updateBooking(db, 'nope', { memo: 'x' }, ctx)).toThrow(EntityNotFoundError);
    const id = createBooking(db, basic(), ctx);
    deleteBooking(db, id, ctx);
    expect(() => updateBooking(db, id, { memo: 'x' }, ctx)).toThrow(EntityNotFoundError);
  });

  it('moves a booking to another account', () => {
    const id = createBooking(db, basic(), ctx);
    updateBooking(db, id, { accountId: 'spar' }, ctx);
    expect(getBooking(db, id)?.accountId).toBe('spar');
    expect(() => updateBooking(db, id, { accountId: 'nope' }, ctx)).toThrow(BookingInvariantError);
  });

  it('refuses to move a booking to an account in another currency', () => {
    const id = createBooking(db, basic(), ctx);
    expect(() => updateBooking(db, id, { accountId: 'usd' }, ctx)).toThrow(/cannot move.*USD/);
    expect(getBooking(db, id)).toMatchObject({ accountId: 'giro', currency: 'EUR' });
  });

  describe('transfer legs', () => {
    it('keeps both legs consistent on amount and date changes', () => {
      const r = createTransfer(
        db,
        { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-02-01', amountCents: 5000 },
        ctx,
      );
      updateBooking(db, r.toBookingId, { amountCents: 7000, date: '2026-02-02' }, ctx);
      const from = getBooking(db, r.fromBookingId)!;
      const to = getBooking(db, r.toBookingId)!;
      expect([from.amountCents, to.amountCents]).toEqual([-7000, 7000]);
      expect([from.date, to.date]).toEqual(['2026-02-02', '2026-02-02']);
      expect(from.splits[0]?.amountCents).toBe(-7000);
      expect(to.splits[0]?.amountCents).toBe(7000);
      updateBooking(db, r.fromBookingId, { amountCents: -100 }, ctx);
      expect(getBooking(db, r.toBookingId)?.amountCents).toBe(100);
    });

    it('keeps the memo and status per leg', () => {
      const r = createTransfer(
        db,
        { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-02-01', amountCents: 5000 },
        ctx,
      );
      updateBooking(db, r.fromBookingId, { memo: 'nur ab', status: 'reconciled' }, ctx);
      expect(getBooking(db, r.toBookingId)).toMatchObject({ memo: null, status: 'confirmed' });
    });

    it('rejects sign flips, zero, and moving a leg to another account', () => {
      const r = createTransfer(
        db,
        { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-02-01', amountCents: 5000 },
        ctx,
      );
      expect(() => updateBooking(db, r.fromBookingId, { amountCents: 5000 }, ctx)).toThrow(
        BookingInvariantError,
      );
      expect(() => updateBooking(db, r.fromBookingId, { amountCents: 0 }, ctx)).toThrow(
        BookingInvariantError,
      );
      expect(() => updateBooking(db, r.fromBookingId, { accountId: 'usd' }, ctx)).toThrow(
        /transfer/,
      );
      expect(getBooking(db, r.toBookingId)?.amountCents).toBe(5000);
    });

    it('undoes an amount and date edit on both legs, and redoes it', () => {
      const r = createTransfer(
        db,
        { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-02-01', amountCents: 5000 },
        ctx,
      );
      updateBooking(
        db,
        r.fromBookingId,
        { amountCents: -7000, date: '2026-02-03' },
        { ...ctx, groupId: 'edit' },
      );
      const legs = () =>
        [r.fromBookingId, r.toBookingId].map((id) => {
          const b = getBooking(db, id)!;
          return [b.date, b.amountCents, b.splits[0]?.amountCents];
        });
      expect(legs()).toEqual([
        ['2026-02-03', -7000, -7000],
        ['2026-02-03', 7000, 7000],
      ]);
      const undone = undo(db, { groupId: 'edit' }, ctx);
      expect(legs()).toEqual([
        ['2026-02-01', -5000, -5000],
        ['2026-02-01', 5000, 5000],
      ]);
      undo(db, { groupId: undone.groupId }, ctx);
      expect(legs()).toEqual([
        ['2026-02-03', -7000, -7000],
        ['2026-02-03', 7000, 7000],
      ]);
    });

    it('redoes an undone transfer with both legs', () => {
      const r = createTransfer(
        db,
        { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-02-01', amountCents: 5000 },
        { ...ctx, groupId: 'tr' },
      );
      const undone = undo(db, { groupId: 'tr' }, ctx);
      expect(listBookings(db)).toHaveLength(0);
      undo(db, { groupId: undone.groupId }, ctx);
      expect(
        listBookings(db).map((b) => [b.id, b.amountCents, b.transferId, b.splits.length]),
      ).toEqual(
        expect.arrayContaining([
          [r.fromBookingId, -5000, r.transferId, 1],
          [r.toBookingId, 5000, r.transferId, 1],
        ]),
      );
      expect(listBookings(db)).toHaveLength(2);
    });

    it('refuses to undo the edit of a single leg', () => {
      const r = createTransfer(
        db,
        { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-02-01', amountCents: 5000 },
        ctx,
      );
      updateBooking(db, r.toBookingId, { amountCents: 6000 }, ctx);
      const edit = history(db, 'booking', r.toBookingId).find((e) => e.action === 'update')!;
      expect(() => undo(db, { auditId: edit.id }, ctx)).toThrow(/whole action/);
      expect(() => undo(db, { auditId: edit.id }, ctx, { force: true })).toThrow(/whole action/);
      expect(getBooking(db, r.fromBookingId)?.amountCents).toBe(-6000);
      expect(getBooking(db, r.toBookingId)?.amountCents).toBe(6000);
    });

    it('rolls back everything when the partner cannot follow', () => {
      const r = createTransfer(
        db,
        { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-02-01', amountCents: 5000 },
        ctx,
      );
      updateBooking(
        db,
        r.toBookingId,
        { splits: [{ categoryId: 'essen', amountCents: 3000 }, { amountCents: 2000 }] },
        ctx,
      );
      expect(() => updateBooking(db, r.fromBookingId, { amountCents: -6000 }, ctx)).toThrow(
        BookingInvariantError,
      );
      expect(getBooking(db, r.fromBookingId)?.amountCents).toBe(-5000);
    });
  });
});

describe('deleteBooking / restoreBooking', () => {
  it('soft-deletes and restores a plain booking (audited)', () => {
    const id = createBooking(db, basic(), ctx);
    deleteBooking(db, id, ctx);
    expect(getBooking(db, id)).toBeUndefined();
    expect(listBookings(db)).toHaveLength(0);
    expect(listBookings(db, { includeDeleted: true })).toHaveLength(1);
    expect(getBooking(db, id, { includeDeleted: true })?.splits).toHaveLength(1);
    expect(history(db, 'booking', id)[0]?.action).toBe('delete');
    expect(() => deleteBooking(db, id, ctx)).toThrow(EntityNotFoundError);
    restoreBooking(db, id, ctx);
    expect(getBooking(db, id)?.splits).toHaveLength(1);
    expect(history(db, 'booking', id)[0]?.action).toBe('restore');
    expect(() => restoreBooking(db, id, ctx)).toThrow(BookingInvariantError);
    expect(() => restoreBooking(db, 'nope', ctx)).toThrow(EntityNotFoundError);
  });

  it('soft-deletes and restores both transfer legs atomically', () => {
    const r = createTransfer(
      db,
      { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-02-01', amountCents: 5000 },
      ctx,
    );
    deleteBooking(db, r.toBookingId, { actor: 'tester', groupId: 'del' });
    expect(listBookings(db)).toHaveLength(0);
    expect(history(db, 'booking', r.fromBookingId)[0]).toMatchObject({
      action: 'delete',
      groupId: 'del',
    });
    expect(db.select().from(bookingSplit).all()).toHaveLength(2); // splits stay
    restoreBooking(db, r.fromBookingId, ctx);
    expect(
      listBookings(db)
        .map((b) => b.id)
        .sort(),
    ).toEqual([r.fromBookingId, r.toBookingId].sort());
  });

  it('can be undone through the audit log', () => {
    const r = createTransfer(
      db,
      { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-02-01', amountCents: 5000 },
      ctx,
    );
    deleteBooking(db, r.fromBookingId, { actor: 'tester', groupId: 'del' });
    undo(db, { groupId: 'del' }, ctx);
    expect(listBookings(db)).toHaveLength(2);
  });
});

describe('getBooking / listBookings', () => {
  it('filters by account, date range, category and orders by date then id', () => {
    createBooking(db, basic({ date: '2026-01-10' }), ctx);
    createBooking(
      db,
      basic({ date: '2026-01-05', splits: [{ categoryId: 'reise', amountCents: -1200 }] }),
      ctx,
    );
    createBooking(db, basic({ date: '2026-02-01', accountId: 'spar' }), ctx);
    createBooking(
      db,
      basic({
        date: '2026-01-20',
        splits: [
          { categoryId: 'essen', amountCents: -1000 },
          { categoryId: 'reise', amountCents: -200 },
        ],
      }),
      ctx,
    );
    expect(listBookings(db).map((b) => b.date)).toEqual([
      '2026-01-05',
      '2026-01-10',
      '2026-01-20',
      '2026-02-01',
    ]);
    expect(listBookings(db, { accountId: 'spar' })).toHaveLength(1);
    expect(listBookings(db, { from: '2026-01-10', to: '2026-01-31' }).map((b) => b.date)).toEqual([
      '2026-01-10',
      '2026-01-20',
    ]);
    const reise = listBookings(db, { categoryId: 'reise' });
    expect(reise.map((b) => b.date)).toEqual(['2026-01-05', '2026-01-20']);
    // a category filter keeps all splits of the matching bookings
    expect(reise[1]?.splits).toHaveLength(2);
  });

  it('filters uncategorized splits with categoryId null and breaks date ties by id', () => {
    const a = createBooking(db, basic({ amountCents: 100, splits: [{ amountCents: 100 }] }), ctx);
    const b = createBooking(db, basic(), ctx);
    expect(listBookings(db, { categoryId: null }).map((x) => x.id)).toEqual([a]);
    expect(listBookings(db).map((x) => x.id)).toEqual([a, b].sort());
  });

  it('returns undefined for unknown ids', () => {
    expect(getBooking(db, 'nope')).toBeUndefined();
  });
});

describe('importBooking', () => {
  const imp = (key: string, over: Partial<BookingInput> = {}): ImportBookingInput => ({
    ...basic(over),
    importKey: key,
  });

  it('creates once and returns the existing id on re-import', () => {
    const a = importBooking(db, imp('k1'), ctx);
    expect(a.created).toBe(true);
    expect(getBooking(db, a.id)).toMatchObject({ source: 'import', importKey: 'k1' });
    const again = importBooking(db, imp('k1'), ctx);
    expect(again).toEqual({ created: false, id: a.id });
    expect(listBookings(db)).toHaveLength(1);
  });

  it('is idempotent for a whole batch imported twice', () => {
    const batch = ['a', 'b', 'c'].map((k, i) => imp(k, { date: `2026-01-0${i + 1}` }));
    const first = batch.map((x) => importBooking(db, x, ctx));
    const second = batch.map((x) => importBooking(db, x, ctx));
    expect(first.every((r) => r.created)).toBe(true);
    expect(second.every((r) => !r.created)).toBe(true);
    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id));
    expect(listBookings(db, { includeDeleted: true })).toHaveLength(3);
    // only the three creates were audited
    expect(db.select().from(booking).all()).toHaveLength(3);
  });

  it('does not resurrect a soft-deleted imported booking', () => {
    const a = importBooking(db, imp('k1'), ctx);
    deleteBooking(db, a.id, ctx);
    const again = importBooking(db, imp('k1'), ctx);
    expect(again).toEqual({ created: false, id: a.id });
    expect(listBookings(db)).toHaveLength(0);
  });

  it('scopes keys per account', () => {
    const a = importBooking(db, imp('k1'), ctx);
    const b = importBooking(db, imp('k1', { accountId: 'spar' }), ctx);
    expect(b.created).toBe(true);
    expect(b.id).not.toBe(a.id);
  });

  it('rejects an empty import key and validates like createBooking', () => {
    expect(() => importBooking(db, imp(''), ctx)).toThrow(/import key/);
    expect(() => importBooking(db, imp('k9', { splits: [] }), ctx)).toThrow(BookingInvariantError);
  });
});
