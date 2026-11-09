import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { appSetting, auditLog, booking, contact } from '../schema';
import { createBooking, getBooking, updateBooking } from './bookings';
import { budgetSummary } from './budget';
import { getContactStatement, settleContact } from './contacts';
import { createEntity } from './entities';
import { applyContactAllocations, parseContactAllocateFile } from './operator-contact-allocate';
import { OperatorInputError, undoAuditGroups } from './operator-ops';
import { netWorthAsOf } from './portfolio';
import { bookedBalance } from './reconciliation';
import { seedBasics, testCtx } from './test-helpers';

const TODAY = '2026-09-30';
const operator = { actor: 'operator' };
let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  createEntity(opened.db, contact, { id: 'k2', name: 'Beispielkontakt Zwei' }, testCtx);
});
afterEach(() => opened.close());

const statement = (contactId = 'k1') => getContactStatement(opened.db, contactId, TODAY);
const cash = () => ({
  balance: bookedBalance(opened.db, 'giro', TODAY),
  wealth: netWorthAsOf(opened.db, TODAY),
});
const run = (entries: unknown[], dryRun = false) =>
  applyContactAllocations(opened.db, parseContactAllocateFile({ entries }), operator, {
    dryRun,
    today: TODAY,
  });
const receipt = (contactId: string, amountCents: number, date = '2026-09-01') => {
  const saved = settleContact(
    opened.db,
    contactId,
    { accountId: 'giro', date, amountCents },
    testCtx,
  );
  return getBooking(opened.db, saved.bookingId)!.splits.find(
    (split) => split.contactId === contactId,
  )!.id;
};
const purchase = (amountCents: number, categoryId = 'essen', date = '2026-09-02') => {
  const bookingId = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date,
      amountCents: -amountCents,
      splits: [{ categoryId, contactId: 'k1', amountCents: -amountCents }],
    },
    testCtx,
    { contactModel: true },
  );
  return getBooking(opened.db, bookingId)!.splits.find((split) => split.contactId === 'k1')!;
};

describe('contact-allocate input', () => {
  it('leaves an already adopted --unlock run unchanged, including its audit', () => {
    const paid = receipt('k1', 701);
    const before = opened.sqlite.serialize();
    const result = applyContactAllocations(
      opened.db,
      parseContactAllocateFile({
        entries: [
          { action: 'adopt', contactId: 'k1', receiptSplitId: paid },
          { action: 'reallocate', contactId: 'k1', receiptSplitId: paid, allocations: [] },
        ],
      }),
      operator,
      { today: TODAY, unlock: true },
    );
    expect(result.map((o) => [o.status, o.groupId])).toEqual([
      ['unchanged', ''],
      ['unchanged', ''],
    ]);
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
  });
  it('adopts, unlocks, reopens and waives in one audited run with byte-identical dry-run and Undo', () => {
    const first = purchase(1001, 'auslagen', '2026-09-01');
    const paid = receipt('k1', 701, '2026-09-02');
    const source = statement().movements.find((m) => m.splitId === paid)!;
    opened.db
      .delete(appSetting)
      .where(eq(appSetting.id, `contacts.credit.${source.bookingId}`))
      .run();
    updateBooking(opened.db, source.bookingId, { status: 'reconciled' }, testCtx);
    updateBooking(opened.db, first.bookingId, { status: 'reconciled' }, testCtx);
    const input = parseContactAllocateFile({
      entries: [
        { action: 'adopt', contactId: 'k1', receiptSplitId: paid },
        { action: 'reallocate', contactId: 'k1', receiptSplitId: paid, allocations: [] },
        {
          action: 'waive',
          contactId: 'k1',
          outlaySplitId: first.id,
          amountCents: 1001,
          categoryId: 'essen',
        },
      ],
    });
    expect(
      applyContactAllocations(opened.db, input, operator, { today: TODAY }).map((o) => o.reason),
    ).toEqual(['reconciled_locked', 'reconciled_locked', 'reconciled_locked']);
    const before = opened.sqlite.serialize();
    const preview = applyContactAllocations(opened.db, input, operator, {
      today: TODAY,
      dryRun: true,
      unlock: true,
    });
    expect(preview.map((o) => [o.status, o.groupId])).toEqual([
      ['updated', ''],
      ['updated', ''],
      ['updated', ''],
    ]);
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
    const applied = applyContactAllocations(opened.db, input, operator, {
      today: TODAY,
      unlock: true,
    });
    expect(applied.map((o) => o.status)).toEqual(['updated', 'updated', 'updated']);
    expect(new Set(applied.map((o) => o.groupId)).size).toBe(1);
    expect(statement().balanceCents).toBe(-701);
    expect(statement().creditCents).toBe(701);
    undoAuditGroups(opened.db, [applied[0]!.groupId], operator);
    expect(statement().balanceCents).toBe(300);
    expect(getBooking(opened.db, source.bookingId)?.status).toBe('reconciled');
    expect(getBooking(opened.db, first.bookingId)?.status).toBe('reconciled');
  });
  it('accepts empty batches and all explicit credit choices', () => {
    expect(parseContactAllocateFile({ entries: [] })).toEqual({ entries: [] });
    expect(
      parseContactAllocateFile({
        entries: [
          {
            action: 'reallocate',
            contactId: 'example-contact',
            receiptSplitId: 'example-receipt',
            allocations: [{ outlaySplitId: 'example-outlay', amountCents: 501 }],
          },
          {
            action: 'credit',
            contactId: 'example-contact',
            receiptSplitId: 'example-receipt',
            date: TODAY,
            amountCents: 101,
            choice: 'category',
            categoryId: 'example-category',
          },
          {
            action: 'credit',
            contactId: 'example-contact',
            receiptSplitId: 'example-receipt',
            date: TODAY,
            amountCents: 100,
            choice: 'gift',
            accountId: 'example-account',
          },
          {
            action: 'credit',
            contactId: 'example-contact',
            receiptSplitId: 'example-receipt',
            date: TODAY,
            amountCents: 99,
            choice: 'free',
          },
        ],
      }).entries,
    ).toHaveLength(4);
  });

  it.each([
    null,
    [],
    { entries: [], extra: true },
    { entries: [{ action: 'unknown' }] },
    ...[0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '100'].map((amountCents) => ({
      entries: [
        {
          action: 'credit',
          contactId: 'k1',
          receiptSplitId: 'receipt',
          date: TODAY,
          amountCents,
          choice: 'free',
        },
      ],
    })),
    {
      entries: [
        {
          action: 'credit',
          contactId: 'k1',
          receiptSplitId: 'receipt',
          date: '2026-02-30',
          amountCents: 100,
          choice: 'free',
        },
      ],
    },
    {
      entries: [
        {
          action: 'credit',
          contactId: 'k1',
          receiptSplitId: 'receipt',
          date: TODAY,
          amountCents: 100,
          choice: 'category',
        },
      ],
    },
    {
      entries: [
        {
          action: 'credit',
          contactId: 'k1',
          receiptSplitId: 'receipt',
          date: TODAY,
          amountCents: 100,
          choice: 'gift',
          categoryId: 'essen',
        },
      ],
    },
    {
      entries: [
        {
          action: 'credit',
          contactId: 'k1',
          receiptSplitId: 'receipt',
          date: TODAY,
          amountCents: 100,
          choice: 'free',
          unlock: true,
        },
      ],
    },
  ])('rejects malformed input before writing (%j)', (input) => {
    const before = opened.sqlite.serialize();
    expect(() => parseContactAllocateFile(input)).toThrow(OperatorInputError);
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
  });
});

it('reallocates exact cents, skips invalid entries and groups all successes for undo-group', () => {
  const first = purchase(601, 'essen', '2026-09-01');
  const second = purchase(501, 'reise', '2026-09-02');
  const receiptSplitId = receipt('k1', 501, '2026-09-03');
  const creditSplitId = receipt('k2', 901);
  const before = [statement(), statement('k2')];
  const money = cash();
  const rta = budgetSummary(opened.db, '2026-09').summary.toBeAssignedCents;
  const outcomes = run([
    {
      action: 'reallocate',
      contactId: 'k1',
      receiptSplitId,
      allocations: [{ outlaySplitId: second.id, amountCents: 501 }],
    },
    {
      action: 'credit',
      contactId: 'k2',
      receiptSplitId: creditSplitId,
      date: TODAY,
      amountCents: 5000,
      choice: 'gift',
    },
    {
      action: 'credit',
      contactId: 'k2',
      receiptSplitId: creditSplitId,
      date: TODAY,
      amountCents: 251,
      choice: 'category',
      categoryId: 'miete',
    },
    {
      action: 'credit',
      contactId: 'k2',
      receiptSplitId: creditSplitId,
      date: TODAY,
      amountCents: 150,
      choice: 'gift',
    },
    {
      action: 'credit',
      contactId: 'k2',
      receiptSplitId: creditSplitId,
      date: TODAY,
      amountCents: 100,
      choice: 'free',
    },
  ]);
  expect(outcomes.map((o) => o.status)).toEqual([
    'updated',
    'skipped',
    'updated',
    'updated',
    'updated',
  ]);
  expect(outcomes[1]).toMatchObject({ reason: 'invalid_credit_choice', groupId: '' });
  expect(new Set(outcomes.filter((o) => o.status === 'updated').map((o) => o.groupId)).size).toBe(
    1,
  );
  expect(statement().outlays.map((o) => [o.splitId, o.remainingCents])).toEqual([
    [first.id, 601],
    [second.id, 0],
  ]);
  expect(statement('k2').creditCents).toBe(751);
  expect(statement('k2').credits.map((c) => [c.categoryId, c.remainingCents])).toEqual([
    [null, 400],
    ['miete', 251],
    [null, 100],
  ]);
  expect(cash()).toEqual(money);
  expect(budgetSummary(opened.db, '2026-09').summary.toBeAssignedCents).toBe(rta + 150);
  const groupId = outcomes[0]!.groupId;
  expect(
    opened.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actor, 'operator'))
      .all()
      .every((entry) => entry.groupId === groupId),
  ).toBe(true);
  undoAuditGroups(opened.db, [groupId], operator);
  expect([statement(), statement('k2')]).toEqual(before);
  expect(cash()).toEqual(money);
  expect(budgetSummary(opened.db, '2026-09').summary.toBeAssignedCents).toBe(rta);
});

it('executes dependent credit choices in dry-run savepoints and leaves the database byte-identical', () => {
  const receiptSplitId = receipt('k1', 601);
  const outlay = purchase(501);
  const before = opened.sqlite.serialize();
  const entries = [
    {
      action: 'credit',
      contactId: 'k1',
      receiptSplitId,
      date: TODAY,
      amountCents: 151,
      choice: 'category',
      categoryId: 'miete',
    },
    {
      action: 'credit',
      contactId: 'k1',
      receiptSplitId,
      date: TODAY,
      amountCents: 1000,
      choice: 'gift',
    },
    {
      action: 'credit',
      contactId: 'k1',
      receiptSplitId,
      date: TODAY,
      amountCents: 51,
      choice: 'free',
    },
  ];
  const dry = run(entries, true);
  expect(dry.map((o) => [o.status, o.groupId])).toEqual([
    ['updated', ''],
    ['skipped', ''],
    ['updated', ''],
  ]);
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
  const applied = run(entries);
  expect(applied.map((o) => ({ ...o, groupId: '' }))).toEqual(dry);
  expect(statement().outlays.find((o) => o.splitId === outlay.id)?.remainingCents).toBe(102);
  expect(statement().creditCents).toBe(202);
  undoAuditGroups(opened.db, [applied[0]!.groupId], operator);
  expect(statement().outlays.find((o) => o.splitId === outlay.id)?.remainingCents).toBe(0);
  expect(statement().creditCents).toBe(100);
});

it('reports unchanged allocations without creating an operator audit group', () => {
  const outlay = purchase(601, 'essen', '2026-09-01');
  const receiptSplitId = receipt('k1', 501, '2026-09-02');
  const before = opened.sqlite.serialize();
  expect(
    run([
      {
        action: 'reallocate',
        contactId: 'k1',
        receiptSplitId,
        allocations: [{ outlaySplitId: outlay.id, amountCents: 501 }],
      },
    ]),
  ).toMatchObject([{ status: 'unchanged', groupId: '' }]);
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
});

it('refuses unknown, foreign and locked IDs without exposing submitted data', () => {
  const receiptSplitId = receipt('k1', 100);
  const source = getBooking(opened.db, statement().movements[0]!.bookingId)!;
  updateBooking(opened.db, source.id, { status: 'reconciled' }, testCtx);
  const before = opened.sqlite.serialize();
  const outcomes = run([
    {
      action: 'credit',
      contactId: 'not-a-contact',
      receiptSplitId,
      date: TODAY,
      amountCents: 1,
      choice: 'gift',
    },
    {
      action: 'credit',
      contactId: 'k2',
      receiptSplitId,
      date: TODAY,
      amountCents: 1,
      choice: 'gift',
    },
    {
      action: 'credit',
      contactId: 'k1',
      receiptSplitId,
      date: TODAY,
      amountCents: 1,
      choice: 'gift',
    },
  ]);
  expect(outcomes.map((o) => o.reason)).toEqual([
    'unknown_contact',
    'invalid_receipt',
    'reconciled_locked',
  ]);
  expect(JSON.stringify(outcomes)).not.toContain(receiptSplitId);
  expect(JSON.stringify(outcomes)).not.toContain('not-a-contact');
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
  expect(opened.db.select().from(booking).where(eq(booking.id, source.id)).get()?.status).toBe(
    'reconciled',
  );
});
