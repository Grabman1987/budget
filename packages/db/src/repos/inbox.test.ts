import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { inboxItem } from '../schema';
import { insertTracked, undo } from './audit';
import { createBooking, createTransfer, deleteBooking, updateBooking } from './bookings';
import { readInbox, readInboxCount, resolveInboxItem } from './inbox';
import { openStaleValueItem, resolveStaleValueItems } from './market';
import { seedBasics, testCtx } from './test-helpers';
let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const TODAY = '2026-09-17';
const queue = () => {
  const result = readInbox(opened.db, TODAY);
  expect(readInboxCount(opened.db, TODAY)).toEqual({ asOf: TODAY, count: result.entries.length });
  return result;
};
const uncat = (amountCents = -1000, date = TODAY) =>
  createBooking(
    opened.db,
    { accountId: 'giro', date, amountCents, splits: [{ amountCents }] },
    testCtx,
  );
describe('actual inbox work', () => {
  it('counts one task per actual budget booking and stored warning; no future/tracking/transfers/income/zero/legacy-summary tasks', () => {
    uncat();
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: TODAY,
        amountCents: -2000,
        splits: [{ amountCents: -700 }, { amountCents: -1300 }],
      },
      testCtx,
    );
    uncat(-1000, '2026-09-18');
    uncat(0);
    createBooking(
      opened.db,
      { accountId: 'usd', date: TODAY, amountCents: -1000, splits: [{ amountCents: -1000 }] },
      testCtx,
    );
    createTransfer(
      opened.db,
      { fromAccountId: 'giro', toAccountId: 'spar', date: TODAY, amountCents: 1000 },
      testCtx,
    );
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: TODAY,
        amountCents: 2000,
        splits: [{ amountCents: 2000, incomeTypeId: 'income-salary' }],
      },
      testCtx,
    );
    insertTracked(
      opened.db,
      inboxItem,
      { id: 'legacy', kind: 'uncategorized', title: '4 Buchungen ohne Kategorie' },
      testCtx,
    );
    openStaleValueItem(opened.db, {
      title: 'Kurse fehlen',
      refType: 'fx',
      refId: 'USD',
      detail: 'unavailable',
    });
    expect(queue().count).toBe(3);
    expect(
      queue()
        .entries.filter((e) => e.type === 'booking')
        .map((e) => e.missingSplits)
        .sort(),
    ).toEqual([1, 2]);
  });
  it('categorization and confirmation use audited booking APIs; undo restores count without duplicate rows', () => {
    const id = uncat();
    updateBooking(opened.db, id, { status: 'pending' }, testCtx);
    updateBooking(opened.db, id, { status: 'confirmed' }, testCtx);
    expect(queue().count).toBe(1);
    const ctx = { actor: 'test', groupId: 'categorize' };
    updateBooking(opened.db, id, { splits: [{ amountCents: -1000, categoryId: 'essen' }] }, ctx);
    expect(queue().count).toBe(0);
    const reversed = undo(opened.db, { groupId: ctx.groupId }, testCtx);
    expect(queue().count).toBe(1);
    undo(opened.db, { groupId: reversed.groupId }, testCtx);
    expect(queue().count).toBe(0);
  });
  it('resolves a stored source warning without financial changes, and undo/redo restores its count', () => {
    openStaleValueItem(opened.db, {
      title: 'Kurse fehlen',
      refType: 'fx',
      refId: 'USD',
      detail: 'unavailable',
    });
    const item = queue().entries[0]!;
    const resolved = resolveInboxItem(opened.db, item.id, testCtx);
    expect(queue().count).toBe(0);
    expect(() => resolveInboxItem(opened.db, item.id, testCtx)).toThrow(/bereits/);
    const reversed = undo(opened.db, { groupId: resolved.groupId }, testCtx);
    expect(queue().count).toBe(1);
    undo(opened.db, { groupId: reversed.groupId }, testCtx);
    expect(queue().count).toBe(0);
  });
  it('refuses unknown/derived/legacy IDs and stale undo after automatic source recovery', () => {
    const id = uncat();
    expect(() => resolveInboxItem(opened.db, 'missing', testCtx)).toThrow();
    expect(() => resolveInboxItem(opened.db, `booking:${id}`, testCtx)).toThrow();
    insertTracked(
      opened.db,
      inboxItem,
      { id: 'legacy', kind: 'uncategorized', title: 'Alt' },
      testCtx,
    );
    expect(() => resolveInboxItem(opened.db, 'legacy', testCtx)).toThrow();
    openStaleValueItem(opened.db, {
      title: 'Kurse fehlen',
      refType: 'fx',
      refId: 'USD',
      detail: 'unavailable',
    });
    const item = queue().entries.find((e) => e.type === 'stored')!;
    const resolved = resolveInboxItem(opened.db, item.id, testCtx);
    const reversed = undo(opened.db, { groupId: resolved.groupId }, testCtx);
    resolveStaleValueItems(opened.db, 'fx', 'USD', 'Abruf wieder erfolgreich');
    expect(() => undo(opened.db, { groupId: reversed.groupId }, testCtx)).toThrow(/changed/);
    expect(queue().count).toBe(1);
    deleteBooking(opened.db, id, testCtx);
    expect(queue().count).toBe(0);
  });
});
