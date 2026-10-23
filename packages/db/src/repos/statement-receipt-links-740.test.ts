import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  parseStatementText,
  type StatementReceiptLinksInput,
  type StatementReceiptLinksPage,
} from '@budget/domain';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  account,
  auditLog,
  booking,
  bookingSplit,
  bookingReceipt,
  expectedPayment,
  expectedPaymentVersion,
  receipt,
  transfer,
} from '../schema';
import { seedBasics } from './test-helpers';
import { createBooking, deleteBooking, restoreBooking, updateBooking } from './bookings';
import { history, undo, updateTracked } from './audit';
import { linkReceipt, unlinkReceipt } from './receipts';
import { mutateStatementIntake, stageStatementIntake } from './statement-intake';
import { changeStatementReceiptLinks, readStatementReceiptLinks } from './statement-receipt-links';

let opened: OpenedDatabase;
const ctx = { actor: 'synthetic-manual-links-740' };
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const stage = (
  hash = 'a'.repeat(64),
  text = 'Rechnungsdatum 01.10.2026\nAbrechnungsbetrag 120,00 EUR',
) =>
  stageStatementIntake(
    opened.db,
    {
      accountId: 'giro',
      sha256: hash,
      sizeBytes: 50,
      filename: 'synthetic.pdf',
      proposal: parseStatementText(text, hash),
    },
    ctx,
  ).intake;
const add = (memo = 'Synthetic purchase', accountId = 'giro', amountCents = -1251) =>
  createBooking(
    opened.db,
    {
      accountId,
      date: '2026-09-17',
      amountCents,
      memo,
      splits: [{ amountCents, categoryId: 'essen' }],
    },
    ctx,
  );
const financial = () =>
  JSON.stringify(
    [account, booking, bookingSplit, transfer, expectedPayment, expectedPaymentVersion].map((t) =>
      opened.db.all(sql`SELECT * FROM ${t} ORDER BY rowid`),
    ),
  );
const allState = () =>
  JSON.stringify(
    [auditLog, bookingReceipt, receipt, booking, bookingSplit].map((t) =>
      opened.db.all(sql`SELECT * FROM ${t} ORDER BY rowid`),
    ),
  );
const input = (
  page: StatementReceiptLinksPage,
  attach: string[] = [],
  detach: string[] = [],
): StatementReceiptLinksInput => {
  const target = (id: string) => {
    const row = [...page.items, ...page.attached].find((b) => b.bookingId === id)!;
    return { bookingId: id, bookingRevision: row.bookingRevision };
  };
  const { revision, sha256, accountId } = page.source;
  return {
    sourceCas: { revision, sha256, accountId },
    linksRevision: page.linksRevision,
    attach: attach.map(target),
    detach: detach.map(target),
  };
};
const attached = (id: string) =>
  readStatementReceiptLinks(opened.db, id)
    .attached.map((b) => b.bookingId)
    .sort();

it('links multiple existing bookings to one original, preserves n:m and every financial row through group undo/redo', () => {
  const first = stage(),
    second = stage('b'.repeat(64));
  const a = add('First'),
    b = add('Second', 'giro', 501);
  linkReceipt(opened.db, second.receiptId, a, ctx);
  const before = financial();
  const result = changeStatementReceiptLinks(
    opened.db,
    first.id,
    input(readStatementReceiptLinks(opened.db, first.id), [a, b]),
    ctx,
  );
  expect(result.changedCount).toBe(2);
  expect(result.groupId).toEqual(expect.any(String));
  expect(attached(first.id)).toEqual([a, b].sort());
  expect(attached(second.id)).toEqual([a]);
  const entries = opened.db
    .select()
    .from(auditLog)
    .where(eq(auditLog.groupId, result.groupId!))
    .all();
  expect(entries).toHaveLength(2);
  expect(entries.map((e) => e.entityType)).toEqual(['booking_receipt', 'booking_receipt']);
  expect(opened.db.select().from(receipt).all()).toHaveLength(2);
  expect(financial()).toBe(before);
  const reversed = undo(opened.db, { groupId: result.groupId! }, ctx);
  expect(attached(first.id)).toEqual([]);
  expect(attached(second.id)).toEqual([a]);
  expect(financial()).toBe(before);
  undo(opened.db, { groupId: reversed.groupId }, ctx);
  expect(attached(first.id)).toEqual([a, b].sort());
  expect(financial()).toBe(before);
  const detach = changeStatementReceiptLinks(
    opened.db,
    first.id,
    input(readStatementReceiptLinks(opened.db, first.id), [], [a, b]),
    ctx,
  );
  expect(detach.changedCount).toBe(2);
  expect(attached(first.id)).toEqual([]);
  undo(opened.db, { groupId: detach.groupId! }, ctx);
  expect(attached(first.id)).toEqual([a, b].sort());
  expect(attached(second.id)).toEqual([a]);
  expect(financial()).toBe(before);
});

it('treats active attach, absent detach and empty selection as true audit-free no-ops', () => {
  const source = stage(),
    a = add('Attached'),
    b = add('Unattached');
  linkReceipt(opened.db, source.receiptId, a, ctx);
  const page = readStatementReceiptLinks(opened.db, source.id),
    before = allState();
  expect(changeStatementReceiptLinks(opened.db, source.id, input(page, [a], [b]), ctx)).toEqual({
    groupId: null,
    changedCount: 0,
    attachedIds: [],
    detachedIds: [],
  });
  expect(changeStatementReceiptLinks(opened.db, source.id, input(page), ctx).groupId).toBeNull();
  expect(allState()).toBe(before);
});

it.each(['edited', 'deleted', 'booking-aba', 'split-aba'] as const)(
  'rejects the whole batch when its second booking is %s',
  (kind) => {
    const source = stage(),
      a = add('Valid'),
      b = add('Will change');
    const request = input(readStatementReceiptLinks(opened.db, source.id), [a, b]);
    if (kind === 'edited') updateBooking(opened.db, b, { memo: 'Changed' }, ctx);
    if (kind === 'deleted') deleteBooking(opened.db, b, ctx);
    if (kind === 'booking-aba') {
      deleteBooking(opened.db, b, ctx);
      restoreBooking(opened.db, b, ctx);
    }
    if (kind === 'split-aba') {
      updateBooking(opened.db, b, { splits: [{ amountCents: -1251, categoryId: 'reise' }] }, ctx);
      const edit = history(
        opened.db,
        'booking_split',
        opened.db.select().from(bookingSplit).where(eq(bookingSplit.bookingId, b)).get()!.id,
      )[0]!;
      undo(opened.db, { groupId: edit.groupId! }, ctx);
    }
    const before = allState(),
      money = financial();
    expect(() => changeStatementReceiptLinks(opened.db, source.id, request, ctx)).toThrow(
      /ausgewählte Buchung/,
    );
    expect(attached(source.id)).toEqual([]);
    expect(allState()).toBe(before);
    expect(financial()).toBe(money);
  },
);

it('detects pair ABA even when a different writer links and unlinks the same original', () => {
  const source = stage(),
    a = add();
  const request = input(readStatementReceiptLinks(opened.db, source.id), [a]);
  linkReceipt(opened.db, source.receiptId, a, ctx);
  unlinkReceipt(opened.db, source.receiptId, a, ctx);
  const before = allState();
  expect(attached(source.id)).toEqual([]);
  expect(() => changeStatementReceiptLinks(opened.db, source.id, request, ctx)).toThrow(
    /Quelle oder Verknüpfungen/,
  );
  expect(allState()).toBe(before);
});

it('rejects stale source revisions and source hash/account substitutions without writes', () => {
  const source = stage(),
    a = add();
  const page = readStatementReceiptLinks(opened.db, source.id);
  for (const sourceCas of [
    { ...input(page).sourceCas, sha256: 'f'.repeat(64) },
    { ...input(page).sourceCas, accountId: 'spar' },
  ]) {
    const before = allState();
    expect(() =>
      changeStatementReceiptLinks(opened.db, source.id, { ...input(page, [a]), sourceCas }, ctx),
    ).toThrow();
    expect(allState()).toBe(before);
  }
  mutateStatementIntake(opened.db, source.id, source, 'reject', {}, ctx);
  const before = allState();
  expect(() => changeStatementReceiptLinks(opened.db, source.id, input(page, [a]), ctx)).toThrow();
  expect(allState()).toBe(before);
});

it('shows foreign attached bookings but neither suggests nor mutates them', () => {
  const source = stage(),
    a = add('Same account'),
    foreign = add('Foreign account', 'spar');
  linkReceipt(opened.db, source.receiptId, foreign, ctx);
  const page = readStatementReceiptLinks(opened.db, source.id);
  expect(page.items.map((b) => b.bookingId)).toEqual([a]);
  expect(page.attached[0]).toMatchObject({ bookingId: foreign, accountId: 'spar', attached: true });
  const before = allState();
  expect(() =>
    changeStatementReceiptLinks(opened.db, source.id, input(page, [a], [foreign]), ctx),
  ).toThrow(/gehört nicht/);
  expect(allState()).toBe(before);
});

it('blocks wrong-currency targets even with a freshly read booking token', () => {
  const source = stage(),
    a = add(),
    wrong = add('Legacy wrong currency');
  // Simulate a historical/imported row; ordinary booking writes prohibit this shape.
  opened.db.update(booking).set({ currency: 'USD' }).where(eq(booking.id, wrong)).run();
  linkReceipt(opened.db, source.receiptId, wrong, ctx);
  const page = readStatementReceiptLinks(opened.db, source.id),
    before = allState();
  expect(page.items.map((b) => b.bookingId)).toEqual([a]);
  expect(() =>
    changeStatementReceiptLinks(opened.db, source.id, input(page, [a], [wrong]), ctx),
  ).toThrow(/gehört nicht/);
  expect(allState()).toBe(before);
});

it('does not infer an unprinted source currency and preserves attached visibility', () => {
  const source = stage('a'.repeat(64), 'Rechnungsdatum 01.10.2026'),
    a = add();
  linkReceipt(opened.db, source.receiptId, a, ctx);
  const page = readStatementReceiptLinks(opened.db, source.id),
    before = allState();
  expect(page.unavailableReason).toBe('source_currency_required');
  expect(page.items).toEqual([]);
  expect(page.attached.map((b) => b.bookingId)).toEqual([a]);
  expect(() =>
    changeStatementReceiptLinks(opened.db, source.id, input(page, [], [a]), ctx),
  ).toThrow();
  expect(allState()).toBe(before);
});

it('invalidates snapshots after account metadata ABA', () => {
  const source = stage(),
    a = add(),
    page = readStatementReceiptLinks(opened.db, source.id);
  const original = opened.db.select().from(account).where(eq(account.id, 'giro')).get()!;
  updateTracked(opened.db, account, ['giro'], { name: 'Renamed' }, ctx);
  updateTracked(opened.db, account, ['giro'], { name: original.name }, ctx);
  const before = allState();
  expect(() => changeStatementReceiptLinks(opened.db, source.id, input(page, [a]), ctx)).toThrow(
    /Quelle oder Verknüpfungen/,
  );
  expect(allState()).toBe(before);
});

it('pages candidates and existing links independently and searches literal wildcard characters', () => {
  const source = stage();
  const ids = Array.from({ length: 4 }, (_, i) =>
    add(i === 0 ? 'Literal 50%_! purchase' : `Purchase ${i}`),
  );
  ids.slice(0, 3).forEach((id) => linkReceipt(opened.db, source.receiptId, id, ctx));
  const first = readStatementReceiptLinks(opened.db, source.id, { limit: 2 });
  expect(first.items).toHaveLength(2);
  expect(first.attached).toHaveLength(2);
  expect(first.nextOffset).toBe(2);
  expect(first.nextAttachedOffset).toBe(2);
  const second = readStatementReceiptLinks(opened.db, source.id, {
    limit: 2,
    offset: 2,
    attachedOffset: 2,
  });
  expect([...first.items, ...second.items].map((b) => b.bookingId).sort()).toEqual([...ids].sort());
  expect([...first.attached, ...second.attached].map((b) => b.bookingId).sort()).toEqual(
    ids.slice(0, 3).sort(),
  );
  expect(second.nextOffset).toBeNull();
  expect(second.nextAttachedOffset).toBeNull();
  for (const q of ['%', '_', '!', ids[0]!])
    expect(
      readStatementReceiptLinks(opened.db, source.id, { q }).items.map((b) => b.bookingId),
    ).toEqual([ids[0]]);
  expect(readStatementReceiptLinks(opened.db, source.id, { q: "' OR 1=1 --" }).items).toEqual([]);
});

it('rejects duplicate IDs, oversized batches and invalid paging before writes', () => {
  const source = stage(),
    a = add(),
    page = readStatementReceiptLinks(opened.db, source.id),
    before = allState();
  for (const request of [
    input(page, [a, a]),
    input(page, [a], [a]),
    { ...input(page), attach: Array.from({ length: 101 }, () => input(page, [a]).attach[0]!) },
  ])
    expect(() => changeStatementReceiptLinks(opened.db, source.id, request, ctx)).toThrow();
  for (const query of [
    { limit: 0 },
    { limit: 101 },
    { offset: -1 },
    { attachedOffset: 100001 },
    { q: 'x'.repeat(201) },
  ])
    expect(() => readStatementReceiptLinks(opened.db, source.id, query)).toThrow();
  expect(allState()).toBe(before);
});
