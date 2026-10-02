import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { auditLog } from '../schema';
import { undo } from './audit';
import { createBooking, listBookings } from './bookings';
import {
  applyBookEntries,
  parseBookFile,
  type BookDone,
  type BookEntry,
  type BookSkipped,
} from './operator-book';
import { OperatorInputError } from './operator-ops';
import { listPayees } from './payees';
import { seedBasics } from './test-helpers';

const operator = { actor: 'operator' };
const owner = { actor: 'owner' };

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
});
afterEach(() => opened.close());

const book = (
  accountId: string,
  date: string,
  amountCents: number,
  extra: { payeeId?: string; memo?: string; status?: 'pending' | 'confirmed' | 'reconciled' } = {},
) =>
  createBooking(
    db,
    { accountId, date, amountCents, ...extra, splits: [{ categoryId: 'essen', amountCents }] },
    owner,
  );

const state = (includeDeleted = true) => ({
  bookings: listBookings(db, { includeDeleted }).map((b) => ({
    ...b,
    updatedAt: undefined,
    splits: b.splits.map((s) => ({ ...s, updatedAt: undefined })),
  })),
  payees: listPayees(db).map((p) => p.name),
});
const auditCount = () => db.select().from(auditLog).all().length;
const run = (entries: unknown, dryRun = false) =>
  applyBookEntries(db, parseBookFile(entries), operator, { dryRun });
const only = (entries: unknown, dryRun = false) => run(entries, dryRun)[0]!;
const done = (o: unknown) => {
  expect(o).toMatchObject({ status: 'done' });
  return o as BookDone;
};
const skipped = (o: unknown) => {
  expect(o).toMatchObject({ status: 'skipped' });
  return o as BookSkipped;
};
const live = (accountId: string) => listBookings(db, { accountId });
const match = { account: 'Giro', date: '2026-10-03', amountCents: -1_250 };
const transferOut = (id: string, date: string, amountCents: number) => ({
  id,
  kind: 'add',
  account: 'Giro',
  date,
  amountCents,
  transferAccount: 'Sparen',
});

describe('book: add', () => {
  it('adds a categorised booking, creates the payee and audits one operator group', () => {
    const result = done(
      only([
        {
          id: 'a1',
          kind: 'add',
          account: 'giro',
          date: '2026-10-02',
          amountCents: -1_250,
          payee: 'Bäckerei',
          category: 'Essen',
          memo: 'Brot',
          cleared: 'cleared',
        },
      ]),
    );
    expect(result).toMatchObject({ kind: 'add', id: 'a1', account: 'Giro', cents: -1_250 });
    const [row] = live('giro');
    expect(row).toMatchObject({ amountCents: -1_250, status: 'confirmed', memo: 'Brot' });
    expect(row!.splits).toMatchObject([{ categoryId: 'essen', amountCents: -1_250 }]);
    expect(listPayees(db).map((p) => p.name)).toContain('Bäckerei');
    const entries = db
      .select()
      .from(auditLog)
      .all()
      .filter((e) => e.groupId === result.groupId);
    expect(entries.length).toBeGreaterThanOrEqual(3); // payee, booking, split
    expect(new Set(entries.map((e) => e.actor))).toEqual(new Set(['operator']));
  });

  it('reuses an existing payee by name and defaults to uncleared', () => {
    done(
      only([
        {
          id: 'a2',
          kind: 'add',
          account: 'Giro',
          date: '2026-10-02',
          amountCents: -50_000,
          payee: 'vermieter',
          category: 'Miete',
        },
      ]),
    );
    expect(listPayees(db).filter((p) => p.name.toLowerCase() === 'vermieter')).toHaveLength(1);
    expect(live('giro')[0]).toMatchObject({ status: 'pending', payeeId: 'p1' });
  });

  it('adds a linked transfer in the direction of the sign', () => {
    done(only([transferOut('t1', '2026-10-02', -7_000)]));
    done(only([transferOut('t2', '2026-10-03', 1_000)]));
    const giro = live('giro');
    const spar = live('spar');
    const sorted = (rows: typeof giro) => rows.map((b) => b.amountCents).sort((a, b) => a - b);
    expect(sorted(giro)).toEqual([-7_000, 1_000]);
    expect(sorted(spar)).toEqual([-1_000, 7_000]);
    for (const b of [...giro, ...spar]) expect(b.transferId).not.toBeNull();
    expect(giro.find((b) => b.amountCents === -7_000)!.transferId).toBe(
      spar.find((b) => b.amountCents === 7_000)!.transferId,
    );
  });

  it('reports unknown names, never creates them, and rolls back a payee created for a refused entry', () => {
    const before = state();
    const base = { kind: 'add', date: '2026-10-02', amountCents: -100 };
    const results = run([
      { ...base, id: 'u1', account: 'Nope', category: 'Essen' },
      { ...base, id: 'u2', account: 'Giro', category: 'Nope' },
      { ...base, id: 'u3', account: 'Giro', transferAccount: 'Nope' },
      { ...base, id: 'u4', account: 'Giro', payee: 'Neu', category: 'Nope' },
    ]);
    expect(results.map((r) => skipped(r).reason)).toEqual([
      'unknown_account',
      'unknown_category',
      'unknown_account',
      'unknown_category',
    ]);
    expect(state()).toEqual(before);
  });

  it('skips what the app refuses: a closed account, the same account twice, two currencies', () => {
    db.run(sql`update account set closed_at = '2026-09-01' where id = 'spar'`);
    const results = run([
      { id: 'c1', kind: 'add', account: 'Sparen', date: '2026-10-02', amountCents: 5 },
      { ...transferOut('c2', '2026-10-02', -5), transferAccount: 'Giro' },
      { ...transferOut('c3', '2026-10-02', -5), transferAccount: 'Dollar' },
    ]);
    expect(results.map((r) => skipped(r).reason)).toEqual([
      'account_closed',
      'refused_by_rules',
      'refused_by_rules',
    ]);
  });
});

describe('book: transfer envelope and finer matches', () => {
  it('adds a transfer between a budget and a tracking account with its envelope', () => {
    db.run(sql`update account set on_budget = 0 where id = 'spar'`);
    done(only([{ ...transferOut('e1', '2026-10-03', -4_000), transferCategory: 'Essen' }]));
    const giro = live('giro')[0]!;
    expect(giro.amountCents).toBe(-4_000);
    expect(giro.splits.map((s) => s.categoryId)).toEqual(['essen']);
    expect(live('spar')[0]!.splits.map((s) => s.categoryId)).toEqual([null]);
  });

  it('refuses an envelope on a transfer between two budget accounts, and parses only with a transfer', () => {
    const result = skipped(
      only([{ ...transferOut('e2', '2026-10-03', -4_000), transferCategory: 'Essen' }]),
    );
    expect(result.reason).toBe('refused_by_rules');
    expect(live('giro')).toHaveLength(0);
    expect(() =>
      parseBookFile([
        {
          id: 'x',
          kind: 'add',
          account: 'Giro',
          date: '2026-10-03',
          amountCents: -1,
          transferCategory: 'Essen',
        },
      ]),
    ).toThrow(OperatorInputError);
  });

  it('tells two identical bookings apart by category or by the other account of a transfer', () => {
    const twin = (categoryId: string) =>
      createBooking(
        db,
        {
          accountId: 'giro',
          date: '2026-10-03',
          amountCents: -1_250,
          splits: [{ categoryId, amountCents: -1_250 }],
        },
        owner,
      );
    twin('essen');
    twin('reise');
    expect(skipped(only([{ id: 'a', kind: 'delete', match }])).reason).toBe('ambiguous_match');
    done(only([{ id: 'b', kind: 'delete', match: { ...match, category: 'Reise' } }]));
    expect(live('giro')[0]!.splits[0]!.categoryId).toBe('essen');
    expect(
      skipped(only([{ id: 'c', kind: 'delete', match: { ...match, category: 'Nope' } }])).reason,
    ).toBe('unknown_category');
  });

  it('matches a transfer leg by the account on the other side', () => {
    done(only([transferOut('t1', '2026-10-03', -1_250)]));
    expect(
      skipped(only([{ id: 'm', kind: 'delete', match: { ...match, transferAccount: 'Dollar' } }]))
        .reason,
    ).toBe('no_match');
    done(only([{ id: 'n', kind: 'delete', match: { ...match, transferAccount: 'Sparen' } }]));
    expect(live('giro')).toHaveLength(0);
    expect(live('spar')).toHaveLength(0);
  });
});

describe('book: change and delete', () => {
  it('changes the amount of a categorised booking (its split follows)', () => {
    book('giro', '2026-10-03', -1_250, { memo: 'x' });
    const result = done(only([{ id: 'm1', kind: 'change_amount', match, newAmountCents: -1_500 }]));
    expect(result).toMatchObject({ kind: 'change_amount', cents: -1_500, date: '2026-10-03' });
    const [row] = live('giro');
    expect(row!.amountCents).toBe(-1_500);
    expect(row!.splits[0]!.amountCents).toBe(-1_500);
  });

  it('changes the date and carries a transfer pair along', () => {
    book('giro', '2026-10-03', -1_250);
    done(only([{ id: 'd1', kind: 'change_date', match, newDate: '2026-10-05' }]));
    expect(live('giro')[0]!.date).toBe('2026-10-05');

    done(only([transferOut('t1', '2026-10-06', -2_000)]));
    done(
      only([
        {
          id: 'd2',
          kind: 'change_date',
          match: { account: 'Sparen', date: '2026-10-06', amountCents: 2_000 },
          newDate: '2026-10-09',
        },
      ]),
    );
    expect(live('giro').find((b) => b.amountCents === -2_000)!.date).toBe('2026-10-09');
    expect(live('spar')[0]!.date).toBe('2026-10-09');
  });

  it('mirrors an amount change onto the other transfer leg', () => {
    done(only([transferOut('t1', '2026-10-06', -2_000)]));
    done(
      only([
        {
          id: 'm1',
          kind: 'change_amount',
          match: { account: 'Giro', date: '2026-10-06', amountCents: -2_000 },
          newAmountCents: -2_500,
        },
      ]),
    );
    expect(live('spar')[0]!.amountCents).toBe(2_500);
  });

  it('deletes a booking and both legs of a transfer', () => {
    book('giro', '2026-10-03', -1_250);
    done(only([{ id: 'x1', kind: 'delete', match }]));
    expect(live('giro')).toHaveLength(0);

    done(only([transferOut('t1', '2026-10-06', -2_000)]));
    done(
      only([
        {
          id: 'x2',
          kind: 'delete',
          match: { account: 'Giro', date: '2026-10-06', amountCents: -2_000 },
        },
      ]),
    );
    expect(live('giro')).toHaveLength(0);
    expect(live('spar')).toHaveLength(0);
  });

  it('matches a split parent by its total and narrows by payee and memo', () => {
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-10-03',
        amountCents: -1_250,
        payeeId: 'p1',
        memo: 'eins',
        splits: [
          { categoryId: 'essen', amountCents: -1_000 },
          { categoryId: 'reise', amountCents: -250 },
        ],
      },
      owner,
    );
    book('giro', '2026-10-03', -1_250, { memo: 'zwei' });
    expect(skipped(only([{ id: 'x0', kind: 'delete', match }]))).toMatchObject({
      reason: 'ambiguous_match',
      candidates: 2,
    });
    done(only([{ id: 'x1', kind: 'delete', match: { ...match, payee: 'Vermieter' } }]));
    expect(live('giro').map((b) => b.memo)).toEqual(['zwei']);
    done(only([{ id: 'x2', kind: 'delete', match: { ...match, memo: 'zwei' } }]));
    expect(live('giro')).toHaveLength(0);
  });
});

describe('book: skips', () => {
  it('skips ambiguous and missing matches with the candidate count and writes nothing for them', () => {
    book('giro', '2026-10-03', -1_250);
    book('giro', '2026-10-03', -1_250);
    const before = state();
    const results = run([
      { id: 's1', kind: 'delete', match },
      { id: 's2', kind: 'change_amount', match, newAmountCents: -1 },
      {
        id: 's3',
        kind: 'change_date',
        match: { ...match, amountCents: -9 },
        newDate: '2026-10-09',
      },
      { id: 's4', kind: 'delete', match: { ...match, account: 'Nope' } },
    ]).map(skipped);
    expect(results.map((r) => [r.reason, r.candidates])).toEqual([
      ['ambiguous_match', 2],
      ['ambiguous_match', 2],
      ['no_match', 0],
      ['unknown_account', 0],
    ]);
    expect(state()).toEqual(before);
  });

  it('skips a reconciled booking like the app does, and still applies the others', () => {
    book('giro', '2026-10-03', -1_250, { status: 'reconciled' });
    book('giro', '2026-10-04', -300);
    const [locked, free] = run([
      { id: 'r1', kind: 'delete', match },
      { id: 'r2', kind: 'delete', match: { ...match, date: '2026-10-04', amountCents: -300 } },
    ]);
    expect(skipped(locked).reason).toBe('reconciled_locked');
    done(free);
    expect(live('giro')).toHaveLength(1);
  });

  it('unlock: true changes the date, the amount and deletes a reconciled booking, audited and undoable', () => {
    book('giro', '2026-10-03', -1_250, { status: 'reconciled' });
    book('giro', '2026-10-04', -300, { status: 'reconciled' });
    book('giro', '2026-10-05', -700, { status: 'reconciled' });
    const before = state(false);
    const auditBefore = auditCount();
    const results = run([
      { id: 'u1', kind: 'change_date', match, newDate: '2026-10-09', unlock: true },
      {
        id: 'u2',
        kind: 'change_amount',
        match: { ...match, date: '2026-10-04', amountCents: -300 },
        newAmountCents: -350,
        unlock: true,
      },
      {
        id: 'u3',
        kind: 'delete',
        match: { ...match, date: '2026-10-05', amountCents: -700 },
        unlock: true,
      },
    ]).map(done);
    expect(new Set(results.map((r) => r.groupId)).size).toBe(3);
    expect(auditCount()).toBeGreaterThan(auditBefore);
    expect(
      live('giro')
        .map((b) => [b.date, b.amountCents])
        .sort(),
    ).toEqual([
      ['2026-10-04', -350],
      ['2026-10-09', -1_250],
    ]);
    // the same audit machinery as the app: each entry undoes on its own, newest first
    for (const r of [...results].reverse()) undo(db, { groupId: r.groupId }, operator);
    expect(state(false)).toEqual(before);
  });

  it('unlock applies to its own entry only and a dry run with unlock writes nothing', () => {
    book('giro', '2026-10-03', -1_250, { status: 'reconciled' });
    book('giro', '2026-10-04', -300, { status: 'reconciled' });
    const before = state();
    const dry = run(
      [{ id: 'd1', kind: 'change_date', match, newDate: '2026-10-09', unlock: true }],
      true,
    );
    expect(done(dry[0]).groupId).toBe('');
    expect(state()).toEqual(before);
    const [unlocked, locked] = run([
      { id: 'o1', kind: 'change_date', match, newDate: '2026-10-09', unlock: true },
      {
        id: 'o2',
        kind: 'change_date',
        match: { ...match, date: '2026-10-04', amountCents: -300 },
        newDate: '2026-10-10',
      },
    ]);
    done(unlocked);
    expect(skipped(locked).reason).toBe('reconciled_locked');
  });

  it('unlock: false is the same as no unlock, and a bad or misplaced unlock is rejected', () => {
    book('giro', '2026-10-03', -1_250, { status: 'reconciled' });
    expect(skipped(only([{ id: 'f1', kind: 'delete', match, unlock: false }])).reason).toBe(
      'reconciled_locked',
    );
    expect(() => parseBookFile([{ id: 'x', kind: 'delete', match, unlock: 'yes' }])).toThrow(
      OperatorInputError,
    );
    expect(() =>
      parseBookFile([
        {
          id: 'x',
          kind: 'add',
          account: 'Giro',
          date: '2026-10-03',
          amountCents: -1,
          unlock: true,
        },
      ]),
    ).toThrow(OperatorInputError);
  });

  it('unlock leaves the other rules in force (split amount change is still refused)', () => {
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-10-03',
        amountCents: -1_250,
        status: 'reconciled',
        splits: [
          { categoryId: 'essen', amountCents: -1_000 },
          { categoryId: 'reise', amountCents: -250 },
        ],
      },
      owner,
    );
    const result = skipped(
      only([{ id: 's1', kind: 'change_amount', match, newAmountCents: -1_300, unlock: true }]),
    );
    expect(result.reason).not.toBe('reconciled_locked');
    expect(live('giro')[0]!.amountCents).toBe(-1_250);
  });

  it('refuses an amount change of a split booking, like the app', () => {
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-10-03',
        amountCents: -1_250,
        splits: [
          { categoryId: 'essen', amountCents: -1_000 },
          { categoryId: 'reise', amountCents: -250 },
        ],
      },
      owner,
    );
    expect(
      skipped(only([{ id: 'p1', kind: 'change_amount', match, newAmountCents: -1_000 }])).reason,
    ).toBe('refused_by_rules');
  });

  it('rejects a malformed file as a whole', () => {
    const add = { id: 'a', kind: 'add', account: 'Giro', date: '2026-02-10', amountCents: 1 };
    expect(() => parseBookFile({})).toThrow(OperatorInputError);
    expect(() => parseBookFile([{ id: 'a', kind: 'nope' }])).toThrow(OperatorInputError);
    expect(() =>
      parseBookFile([
        { id: 'a', kind: 'delete', match },
        { id: 'a', kind: 'delete', match },
      ]),
    ).toThrow(/used twice/);
    expect(() => parseBookFile([{ ...add, date: '2026-02-30' }])).toThrow(/date/);
    expect(() => parseBookFile([{ ...add, amountCents: 1.5 }])).toThrow(/cents/);
    expect(() => parseBookFile([{ ...add, category: 'Essen', transferAccount: 'Sparen' }])).toThrow(
      /exclude/,
    );
  });
});

describe('book: dry run and undo', () => {
  const entries: BookEntry[] = parseBookFile([
    {
      id: 'e1',
      kind: 'add',
      account: 'Giro',
      date: '2026-10-02',
      amountCents: -1_250,
      payee: 'Neuer Laden',
      category: 'Essen',
    },
    transferOut('e2', '2026-10-02', -900),
    { id: 'e3', kind: 'change_amount', match, newAmountCents: -1_500 },
    {
      id: 'e4',
      kind: 'change_date',
      match: { ...match, amountCents: -300 },
      newDate: '2026-10-08',
    },
    { id: 'e5', kind: 'delete', match: { ...match, amountCents: -700 } },
  ]);
  const seed = () => {
    book('giro', '2026-10-03', -1_250);
    book('giro', '2026-10-03', -300);
    book('giro', '2026-10-03', -700);
  };

  it('writes nothing in a dry run but reports what would happen', () => {
    seed();
    const before = state();
    const auditBefore = auditCount();
    const results = applyBookEntries(db, entries, operator, { dryRun: true });
    expect(results.map((r) => r.status)).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(results.every((r) => r.status === 'done' && r.groupId === '')).toBe(true);
    expect(state()).toEqual(before);
    expect(auditCount()).toBe(auditBefore);
  });

  it('undoing the group of each entry restores the previous state', () => {
    seed();
    // an undone add stays behind as a soft-deleted row: compare what the app shows
    const before = state(false);
    const results = applyBookEntries(db, entries, operator).map(done);
    expect(new Set(results.map((r) => r.groupId)).size).toBe(5);
    expect(state()).not.toEqual(before);
    // newest first, as `undo-group` does
    for (const r of [...results].reverse()) undo(db, { groupId: r.groupId }, operator);
    expect(state(false)).toEqual(before);
  });

  it('undoes a single entry on its own', () => {
    seed();
    const results = applyBookEntries(db, entries, operator).map(done);
    undo(db, { groupId: results[4]!.groupId }, operator); // the delete
    expect(live('giro').filter((b) => b.amountCents === -700)).toHaveLength(1);
    expect(live('giro').find((b) => b.amountCents === -1_500)).toBeDefined();
  });
});
