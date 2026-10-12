import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  OperatorInputError,
  bookedBalance,
  createBooking,
  createTestDatabase,
  getBooking,
  listBookings,
  schema,
  undoAuditGroups,
  type OpenedDatabase,
} from '@budget/db';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import {
  applyBankInboxEntries,
  listBankInbox,
  parseBankInboxFile,
  type BankInboxDone,
  type BankInboxSkipped,
} from './operator-bank-inbox';

/** Synthetic ledger: names and amounts are made up. */
const { auditLog, bankSyncCandidate, inboxItem } = schema;
const owner = { actor: 'owner' };
const operator = { actor: 'operator' };
const DAY = '2026-09-30';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];
beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
});
afterEach(() => opened.close());

function candidate(amountCents = -1201, accountId = 'giro', memo = 'Banktext Shop A') {
  const id = randomUUID();
  db.insert(bankSyncCandidate)
    .values({ id, accountId, dedupeKey: id, date: DAY, amountCents, currency: 'EUR', memo })
    .run();
  db.insert(inboxItem)
    .values({
      id,
      kind: 'import',
      title: 'Bankumsatz prüfen',
      refType: 'bank-sync-candidate',
      refId: id,
    })
    .run();
  return id;
}
const manual = (amountCents = -1201, accountId = 'giro') =>
  createBooking(
    db,
    {
      accountId,
      date: DAY,
      amountCents,
      memo: 'Handnotiz',
      status: 'pending',
      splits: [{ amountCents, categoryId: 'essen' }],
    },
    owner,
  );
/** An unchecked bank booking as decision 41 posts it. */
function posted(amountCents = -1201) {
  const id = candidate(amountCents);
  const key = db.select().from(bankSyncCandidate).where(eq(bankSyncCandidate.id, id)).get()!
    .dedupeKey;
  db.update(inboxItem)
    .set({ resolvedAt: DAY, resolution: 'Angelegt' })
    .where(eq(inboxItem.id, id))
    .run();
  return createBooking(
    db,
    {
      accountId: 'giro',
      date: DAY,
      amountCents,
      memo: 'Banktext Shop A',
      source: 'bank',
      importKey: 'bank-sync:' + key,
      status: 'pending',
      splits: [{ amountCents }],
    },
    owner,
  );
}
function infoItem(refType: string, title = 'Hinweis') {
  const id = randomUUID();
  db.insert(inboxItem).values({ id, kind: 'other', title, refType, refId: 'x' }).run();
  return id;
}

const run = (entries: unknown, dryRun = false) =>
  applyBankInboxEntries(db, parseBankInboxFile(entries), operator, { dryRun });
const only = (entries: unknown, dryRun = false) => run(entries, dryRun)[0]!;
const done = (o: unknown) => {
  expect(o).toMatchObject({ status: 'done' });
  return o as BankInboxDone;
};
const skipped = (o: unknown) => {
  expect(o).toMatchObject({ status: 'skipped' });
  return o as BankInboxSkipped;
};
const item = (id: string) => db.select().from(inboxItem).where(eq(inboxItem.id, id)).get()!;
const live = (accountId: string) => listBookings(db, { accountId });
const undoGroup = (groupId: string) => undoAuditGroups(db, [groupId], operator);
const auditCount = () => db.select().from(auditLog).all().length;

describe('bank-inbox merge', () => {
  it('merges a candidate into the manual booking and undo restores both', () => {
    const own = manual();
    const id = candidate();
    const out = done(only([{ id: 'e1', candidate: id, action: 'merge', bookingId: own }]));
    expect(out).toMatchObject({ bookingId: own, target: id });
    expect(getBooking(db, own)).toMatchObject({ source: 'bank', status: 'confirmed' });
    expect(item(id).resolvedAt).not.toBeNull();
    expect(live('giro')).toHaveLength(1);
    expect(
      db.select().from(auditLog).where(eq(auditLog.groupId, out.groupId)).all()[0],
    ).toMatchObject({ actor: 'operator' });
    undoGroup(out.groupId);
    expect(getBooking(db, own)).toMatchObject({ source: 'manual', status: 'pending' });
    expect(item(id).resolvedAt).toBeNull();
  });

  it('merges an unchecked bank booking into the manual one and undo restores', () => {
    const own = manual();
    const bank = posted();
    const out = done(only([{ id: 'e1', bankBooking: bank, action: 'merge', bookingId: own }]));
    expect(getBooking(db, bank)).toBeUndefined();
    expect(getBooking(db, own)).toMatchObject({ source: 'bank' });
    expect(live('giro')).toHaveLength(1);
    undoGroup(out.groupId);
    expect(getBooking(db, bank)).toMatchObject({ source: 'bank', status: 'pending' });
    expect(getBooking(db, own)).toMatchObject({ source: 'manual' });
  });

  it('skips with the app reason when the booking does not fit and writes nothing', () => {
    const wrong = manual(-5000);
    const id = candidate();
    const before = auditCount();
    const out = skipped(only([{ id: 'e1', candidate: id, action: 'merge', bookingId: wrong }]));
    expect(out.reason).toBe('conflict');
    expect(auditCount()).toBe(before);
    expect(item(id).resolvedAt).toBeNull();
  });
});

describe('bank-inbox transfer', () => {
  it('links the candidate to an existing counterpart booking and undo restores', () => {
    const counter = createBooking(
      db,
      { accountId: 'spar', date: DAY, amountCents: 1201, splits: [{ amountCents: 1201 }] },
      owner,
    );
    const id = candidate(-1201);
    const out = done(only([{ id: 'e1', candidate: id, action: 'transfer', bookingId: counter }]));
    expect(live('giro')).toHaveLength(1);
    expect(live('spar')).toHaveLength(1);
    const own = getBooking(db, out.bookingId!)!;
    expect(own.transferId).not.toBeNull();
    expect(own.transferId).toBe(getBooking(db, counter)!.transferId);
    undoGroup(out.groupId);
    expect(live('giro')).toHaveLength(0);
    expect(getBooking(db, counter)!.transferId).toBeNull();
    expect(item(id).resolvedAt).toBeNull();
  });

  it('creates the counter leg for a counterAccount: one booking per account, balances move', () => {
    const giro = bookedBalance(db, 'giro', '2026-12-31');
    const spar = bookedBalance(db, 'spar', '2026-12-31');
    const id = candidate(-5000);
    const out = done(
      only([{ id: 'e1', candidate: id, action: 'transfer', counterAccount: 'Sparen' }]),
    );
    expect(live('giro')).toHaveLength(1);
    expect(live('spar')).toHaveLength(1);
    expect(out.counterpartId).toBe(live('spar')[0]!.id);
    expect(bookedBalance(db, 'giro', '2026-12-31')).toBe(giro - 5000);
    expect(bookedBalance(db, 'spar', '2026-12-31')).toBe(spar + 5000);
    expect(getBooking(db, out.bookingId!)!.transferId).toBe(
      getBooking(db, out.counterpartId!)!.transferId,
    );
    expect(item(id).resolvedAt).not.toBeNull();
    undoGroup(out.groupId);
    expect(live('giro')).toHaveLength(0);
    expect(live('spar')).toHaveLength(0);
    expect(bookedBalance(db, 'giro', '2026-12-31')).toBe(giro);
    expect(bookedBalance(db, 'spar', '2026-12-31')).toBe(spar);
    expect(item(id).resolvedAt).toBeNull();
  });

  it('takes over the staged counter candidate instead of booking it twice', () => {
    const out1 = candidate(-5000, 'giro', 'Ueberweisung');
    const other = candidate(5000, 'spar', 'Eingang');
    done(only([{ id: 'e1', candidate: out1, action: 'transfer', counterAccount: 'Sparen' }]));
    expect(live('spar')).toHaveLength(1);
    expect(item(other).resolvedAt).not.toBeNull();
  });

  it('skips an unknown counter account', () => {
    const id = candidate(-5000);
    const out = skipped(
      only([{ id: 'e1', candidate: id, action: 'transfer', counterAccount: 'Nirgendwo' }]),
    );
    expect(out.reason).toBe('unknown_account');
    expect(live('giro')).toHaveLength(0);
  });
});

describe('bank-inbox confirm', () => {
  it('books the candidate with payee, category and memo, creates the payee and undo restores', () => {
    const id = candidate();
    const out = done(
      only([
        {
          id: 'e1',
          candidate: id,
          action: 'confirm',
          payee: 'Shop A',
          category: 'Essen',
          memo: 'Wocheneinkauf',
        },
      ]),
    );
    const row = getBooking(db, out.bookingId!)!;
    expect(row).toMatchObject({ source: 'bank', status: 'confirmed', memo: 'Wocheneinkauf' });
    expect(row.splits.map((s) => s.categoryId)).toEqual(['essen']);
    expect(
      db
        .select()
        .from(schema.payee)
        .all()
        .some((p) => p.name === 'Shop A' && p.id === row.payeeId),
    ).toBe(true);
    expect(item(id).resolvedAt).not.toBeNull();
    expect(
      db
        .select()
        .from(auditLog)
        .where(eq(auditLog.groupId, out.groupId))
        .all()
        .every((a) => a.actor === 'operator'),
    ).toBe(true);
    undoGroup(out.groupId);
    expect(live('giro')).toHaveLength(0);
    expect(item(id).resolvedAt).toBeNull();
  });

  it('confirms without an assignment like the app (open booking for later classification)', () => {
    const id = candidate();
    const out = done(only([{ id: 'e1', candidate: id, action: 'confirm' }]));
    expect(getBooking(db, out.bookingId!)).toMatchObject({ source: 'bank', status: 'confirmed' });
  });

  it('skips an unknown category without writing', () => {
    const id = candidate();
    const before = auditCount();
    const out = skipped(
      only([{ id: 'e1', candidate: id, action: 'confirm', category: 'Gibt es nicht' }]),
    );
    expect(out.reason).toBe('unknown_category');
    expect(auditCount()).toBe(before);
    expect(live('giro')).toHaveLength(0);
  });

  it('handles an already resolved candidate as skipped', () => {
    const id = candidate();
    done(only([{ id: 'e1', candidate: id, action: 'dismiss', reason: 'Test' }]));
    expect(skipped(only([{ id: 'e2', candidate: id, action: 'confirm' }])).reason).toBe(
      'already_resolved',
    );
  });
});

describe('bank-inbox dismiss', () => {
  it('resolves the candidate with the reason, creates no booking and undo reopens it', () => {
    const id = candidate();
    const out = done(
      only([{ id: 'e1', candidate: id, action: 'dismiss', reason: 'Doppelt in YNAB' }]),
    );
    expect(item(id)).toMatchObject({ resolution: 'Doppelt in YNAB' });
    expect(item(id).resolvedAt).not.toBeNull();
    expect(live('giro')).toHaveLength(0);
    undoGroup(out.groupId);
    expect(item(id).resolvedAt).toBeNull();
  });

  it('rejects dismissing a booked bank row at parse time', () => {
    const bank = posted();
    expect(() =>
      parseBankInboxFile([{ id: 'e1', bankBooking: bank, action: 'dismiss', reason: 'x' }]),
    ).toThrow(OperatorInputError);
    expect(getBooking(db, bank)).toBeDefined();
  });

  it('requires exactly one target', () => {
    expect(() =>
      parseBankInboxFile([
        { id: 'e1', candidate: 'a', bankBooking: 'b', action: 'merge', bookingId: 'c' },
      ]),
    ).toThrow(OperatorInputError);
    expect(() => parseBankInboxFile([{ id: 'e1', action: 'confirm' }])).toThrow(OperatorInputError);
  });
});

describe('bank-inbox resolve-info', () => {
  it('resolves an information item with the reason and undo reopens it', () => {
    const id = infoItem('security');
    const out = done(
      only([{ id: 'e1', action: 'resolve-info', inboxItemId: id, reason: 'Erledigt' }]),
    );
    expect(item(id)).toMatchObject({ resolution: 'Erledigt' });
    expect(item(id).resolvedAt).not.toBeNull();
    undoGroup(out.groupId);
    expect(item(id).resolvedAt).toBeNull();
  });

  it.each(['payslip-intake', 'payslip-source', 'bank-sync'])('allows %s', (refType) => {
    done(
      only([{ id: 'e1', action: 'resolve-info', inboxItemId: infoItem(refType), reason: 'ok' }]),
    );
  });

  it('allows only Quellsaldo items of read_source', () => {
    const balance = infoItem('read_source', 'Quellsaldo weicht ab');
    const other = infoItem('read_source', 'Kurse nicht abrufbar');
    done(only([{ id: 'e1', action: 'resolve-info', inboxItemId: balance, reason: 'ok' }]));
    expect(
      skipped(only([{ id: 'e2', action: 'resolve-info', inboxItemId: other, reason: 'ok' }]))
        .reason,
    ).toBe('not_info');
    expect(item(other).resolvedAt).toBeNull();
  });

  it('refuses a bank-sync-candidate and an already resolved item', () => {
    const id = candidate();
    expect(
      skipped(only([{ id: 'e1', action: 'resolve-info', inboxItemId: id, reason: 'x' }])).reason,
    ).toBe('not_info');
    expect(item(id).resolvedAt).toBeNull();
    const info = infoItem('security');
    done(only([{ id: 'e2', action: 'resolve-info', inboxItemId: info, reason: 'x' }]));
    expect(
      skipped(only([{ id: 'e3', action: 'resolve-info', inboxItemId: info, reason: 'x' }])).reason,
    ).toBe('already_resolved');
  });
});

describe('bank-inbox apply', () => {
  it('writes nothing on a dry run and reports what would happen', () => {
    const own = manual();
    const id = candidate();
    const info = infoItem('security');
    const before = auditCount();
    const out = run(
      [
        { id: 'e1', candidate: id, action: 'merge', bookingId: own },
        { id: 'e2', action: 'resolve-info', inboxItemId: info, reason: 'x' },
        { id: 'e3', candidate: 'missing', action: 'dismiss', reason: 'x' },
      ],
      true,
    );
    expect(out.map((o) => o.status)).toEqual(['done', 'done', 'skipped']);
    expect(
      out.filter((o) => o.status === 'done').every((o) => (o as BankInboxDone).groupId === ''),
    ).toBe(true);
    expect(auditCount()).toBe(before);
    expect(getBooking(db, own)!.source).toBe('manual');
    expect(item(id).resolvedAt).toBeNull();
    expect(item(info).resolvedAt).toBeNull();
  });

  it('gives each entry its own audit group and continues after a skipped one', () => {
    const a = candidate(-100);
    const b = candidate(-200);
    const out = run([
      { id: 'e1', candidate: a, action: 'dismiss', reason: 'x' },
      { id: 'e2', candidate: 'missing', action: 'dismiss', reason: 'x' },
      { id: 'e3', candidate: b, action: 'dismiss', reason: 'x' },
    ]);
    expect(out.map((o) => o.status)).toEqual(['done', 'skipped', 'done']);
    expect(
      new Set(out.filter((o) => o.status === 'done').map((o) => (o as BankInboxDone).groupId)).size,
    ).toBe(2);
  });

  it('rejects duplicate entry ids', () => {
    expect(() =>
      parseBankInboxFile([
        { id: 'e1', candidate: 'a', action: 'dismiss', reason: 'x' },
        { id: 'e1', candidate: 'b', action: 'dismiss', reason: 'x' },
      ]),
    ).toThrow(OperatorInputError);
  });
});

describe('bank-inbox list', () => {
  it('lists open candidates with matches and pending bank bookings, read-only', () => {
    const own = manual();
    const id = candidate();
    const resolved = candidate(-77);
    db.update(inboxItem).set({ resolvedAt: DAY }).where(eq(inboxItem.id, resolved)).run();
    const bank = posted(-999);
    const before = auditCount();
    const list = listBankInbox(db);
    expect(list.candidates.map((c) => c.id)).toEqual([id]);
    const c = list.candidates[0]!;
    expect(c).toMatchObject({ accountName: 'Giro', amountCents: -1201, memo: 'Banktext Shop A' });
    expect(
      (c as { matches: { merge: { bookingId: string }[] } }).matches.merge.map((m) => m.bookingId),
    ).toEqual([own]);
    expect(list.bankBookings.map((b) => b.bookingId)).toEqual([bank]);
    expect(auditCount()).toBe(before);
    expect(listBankInbox(db, { sourceId: 'nope' }).candidates).toEqual([]);
  });
});
