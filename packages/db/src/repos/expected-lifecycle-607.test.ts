import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  auditLog,
  expectedOccurrence,
  expectedPayment,
  expectedPaymentPause,
  INCOME_TYPES,
} from '../schema';
import { undo, updateTracked } from './audit';
import { createBooking, deleteBooking } from './bookings';
import { AuditError, ConflictError } from './errors';
import {
  addExpectedVersion,
  createExpectedPayment,
  deleteExpectedPayment,
  endExpectedPayment,
  linkOccurrence,
  matchOccurrences,
  monthIncome,
  listExpectedPayments,
  pauseExpectedPayment,
  refreshOccurrences,
  skipOccurrence,
  unlinkOccurrence,
  updateExpectedPayment,
  upcoming,
} from './expected';
import { readPaymentDetail } from './expected-detail';
import { budgetSummary } from './budget';
import { planIncomeTargets } from './income-targets';
import { readPaymentLifecycles } from './expected-lifecycle-invariants';
import { readPaymentsPreview } from './payments-preview';
import { loadFacts, scheduled } from './rule-inputs';
import { seedBasics, testCtx as ctx } from './test-helpers';

const TODAY = '2026-03-20';
let opened: OpenedDatabase;
let db: OpenedDatabase['db'];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(TODAY + 'T12:00:00Z'));
  opened = createTestDatabase();
  // Keep SQLite's audit/default clock and the application day aligned in this synthetic DB.
  opened.sqlite.function('strftime', { varargs: true }, (...args) => {
    if (args.length !== 2 || args[0] !== '%Y-%m-%dT%H:%M:%fZ' || args[1] !== 'now')
      throw new Error('Unexpected synthetic clock request');
    return new Date().toISOString();
  });
  db = opened.db;
  seedBasics(db);
});
afterEach(() => {
  opened.close();
  vi.useRealTimers();
});
const make = (dueDay = 25) =>
  createExpectedPayment(
    db,
    {
      name: 'Synthetic recurring payment',
      accountId: 'giro',
      categoryId: 'miete',
      dueDay,
      startDate: '2026-01-01',
    },
    { validFrom: '2026-01-01', amountCents: 1234 },
    ctx,
    TODAY,
  ).payment;
const row = (id: string, date: string) =>
  db
    .select()
    .from(expectedOccurrence)
    .where(and(eq(expectedOccurrence.expectedPaymentId, id), eq(expectedOccurrence.dueDate, date)))
    .get()!;
const facts = (id: string) => readPaymentLifecycles(db, [id]).get(id)!;
const token = (id: string) => {
  const value = facts(id).reviewToken;
  expect(value).toMatch(/^[a-f0-9]{64}$/);
  return value!;
};
const book = (date = '2026-04-25') =>
  createBooking(
    db,
    {
      accountId: 'giro',
      date,
      amountCents: -1234,
      splits: [{ categoryId: 'miete', amountCents: -1234 }],
    },
    ctx,
  );
const unchanged = (before: Buffer) => expect(opened.sqlite.serialize().equals(before)).toBe(true);
const changes = () =>
  (opened.sqlite.prepare('SELECT total_changes() AS n').get() as { n: number }).n;

describe('#607 atomic lifecycle and retained financial history', () => {
  it('ending preserves the previous income report and its assigned occurrence, including whole Undo', () => {
    const p = createExpectedPayment(
      db,
      {
        name: 'Synthetic retained income',
        kind: 'inflow',
        accountId: 'giro',
        incomeTypeId: INCOME_TYPES.salary.id,
        dueDay: 25,
        startDate: '2026-01-01',
      },
      { validFrom: '2026-01-01', amountCents: 10000 },
      ctx,
      TODAY,
    ).payment;
    const bookingId = createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-02-25',
        amountCents: 10000,
        splits: [{ categoryId: null, incomeTypeId: INCOME_TYPES.salary.id, amountCents: 10000 }],
      },
      ctx,
    );
    linkOccurrence(db, row(p.id, '2026-02-25').id, bookingId, ctx);
    const before = monthIncome(db, '2026-02');
    const assigned = row(p.id, '2026-02-25');
    expect(before).toMatchObject({ month: '2026-02', expectedCents: 10000, receivedCents: 10000 });
    expect(assigned).toMatchObject({
      dueDate: '2026-02-25',
      status: 'received',
      expectedAmountCents: 10000,
      bookingId,
    });
    const ended = endExpectedPayment(db, p.id, '2026-04-01', token(p.id), ctx, TODAY);
    expect(monthIncome(db, '2026-02')).toEqual(before);
    expect(row(p.id, '2026-02-25')).toEqual(assigned);
    expect(monthIncome(db, '2026-04').expectedCents).toBe(0);
    undo(db, { groupId: ended.groupId }, ctx);
    expect(monthIncome(db, '2026-02')).toEqual(before);
    expect(row(p.id, '2026-02-25')).toEqual(assigned);
    expect(monthIncome(db, '2026-04').expectedCents).toBe(10000);
  });

  it('suppresses only forward open rows, preserves cents/identities, and requires whole-action Undo', () => {
    const p = make();
    const past = row(p.id, '2026-02-25');
    const march = row(p.id, '2026-03-25');
    const april = row(p.id, '2026-04-25');
    const paused = pauseExpectedPayment(db, p.id, '2026-04-25', token(p.id), ctx, TODAY);
    expect(row(p.id, past.dueDate)).toEqual(past);
    for (const old of [march, april])
      expect(row(p.id, old.dueDate)).toMatchObject({
        id: old.id,
        expectedAmountCents: -1234,
        bookingId: null,
        status: 'expected',
        deletedAt: expect.any(String),
      });
    expect(row(p.id, '2026-05-25')).toMatchObject({ deletedAt: null, expectedAmountCents: -1234 });
    const pauseAudit = db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.groupId, paused.groupId),
          eq(auditLog.entityType, 'expected_payment_pause'),
        ),
      )
      .get()!;
    const beforePartial = opened.sqlite.serialize();
    for (const force of [false, true]) {
      expect(() => undo(db, { auditId: pauseAudit.id }, ctx, { force })).toThrow(AuditError);
      unchanged(beforePartial);
    }
    const restored = undo(db, { groupId: paused.groupId }, ctx);
    expect(facts(p.id).pauses).toEqual([]);
    expect(row(p.id, april.dueDate)).toMatchObject({
      id: april.id,
      expectedAmountCents: -1234,
      deletedAt: null,
    });
    undo(db, { groupId: restored.groupId }, ctx);
    expect(facts(p.id).pauses).toEqual([{ fromDate: TODAY, throughDate: '2026-04-25' }]);
    const beforeBranch = opened.sqlite.serialize();
    expect(() => undo(db, { groupId: paused.groupId }, ctx, { force: true })).toThrow(AuditError);
    unchanged(beforeBranch);
  });

  it('rejects a stale reviewed payment or version without any writes and keeps batch tokens invariant', () => {
    const a = make();
    const b = make(26);
    expect(readPaymentLifecycles(db, [a.id, b.id]).get(a.id)?.reviewToken).toBe(token(a.id));
    const reviewed = token(a.id);
    updateExpectedPayment(db, a.id, { note: 'Synthetic changed intent' }, ctx, TODAY);
    const before = opened.sqlite.serialize();
    expect(() => pauseExpectedPayment(db, a.id, '2026-04-25', reviewed, ctx, TODAY)).toThrow(
      ConflictError,
    );
    expect(() => endExpectedPayment(db, a.id, '2026-04-01', reviewed, ctx, TODAY)).toThrow(
      ConflictError,
    );
    unchanged(before);
    const reviewedVersion = token(a.id);
    addExpectedVersion(db, a.id, { validFrom: '2026-04-01', amountCents: 2345 }, ctx, TODAY);
    const afterVersion = opened.sqlite.serialize();
    expect(() => endExpectedPayment(db, a.id, '2026-04-01', reviewedVersion, ctx, TODAY)).toThrow(
      ConflictError,
    );
    unchanged(afterVersion);
    expect(row(a.id, '2026-04-25').expectedAmountCents).toBe(-2345);
  });

  it('detects a genuine account A-to-B-to-A ABA even when the current row looks unchanged', () => {
    const p = make();
    const reviewed = token(p.id);
    updateExpectedPayment(db, p.id, { accountId: 'spar' }, ctx, TODAY);
    updateExpectedPayment(db, p.id, { accountId: 'giro' }, ctx, TODAY);
    expect(db.select().from(expectedPayment).where(eq(expectedPayment.id, p.id)).get()).toEqual(p);
    expect(token(p.id)).not.toBe(reviewed);
    const before = opened.sqlite.serialize();
    expect(() => endExpectedPayment(db, p.id, '2026-04-01', reviewed, ctx, TODAY)).toThrow(
      ConflictError,
    );
    unchanged(before);
  });

  it('keeps a positive assignment witness from audit alone after the occurrence is absent', () => {
    const p = make();
    const occurrence = row(p.id, '2026-04-25');
    linkOccurrence(db, occurrence.id, book(), ctx);
    opened.sqlite.prepare('DELETE FROM expected_occurrence WHERE id=?').run(occurrence.id);
    expect(facts(p.id).deletion).toBe('everAssigned');
    const before = opened.sqlite.serialize();
    expect(() => deleteExpectedPayment(db, p.id, ctx, TODAY, token(p.id))).toThrow(
      /bereits eine Buchung zugeordnet/,
    );
    unchanged(before);
  });

  it('does not attribute a later different-parent booking assignment to the former payment', () => {
    const a = make();
    const b = make(26);
    const occurrence = row(a.id, '2026-04-25');
    updateTracked(db, expectedOccurrence, [occurrence.id], { expectedPaymentId: b.id }, ctx);
    linkOccurrence(db, occurrence.id, book(), ctx);
    expect(facts(a.id).deletion).toBe('unavailable');
    expect(facts(b.id).deletion).toBe('everAssigned');
  });

  it('returns no mutation token for corrupt evidence, while clean legacy absence may still end forward', () => {
    const corrupt = make();
    opened.sqlite
      .prepare(
        "UPDATE audit_log SET after_json='invalid-json' WHERE entity_type='expected_payment' AND entity_id=?",
      )
      .run(corrupt.id);
    expect(facts(corrupt.id)).toMatchObject({ reviewToken: null, deletion: 'unavailable' });
    const before = opened.sqlite.serialize();
    expect(() =>
      pauseExpectedPayment(db, corrupt.id, '2026-04-01', 'a'.repeat(64), ctx, TODAY),
    ).toThrow(ConflictError);
    unchanged(before);
    const legacy = make(26);
    opened.sqlite
      .prepare("DELETE FROM audit_log WHERE entity_type='expected_payment' AND entity_id=?")
      .run(legacy.id);
    expect(facts(legacy.id).deletion).toBe('unavailable');
    endExpectedPayment(db, legacy.id, '2026-04-01', token(legacy.id), ctx, TODAY);
    expect(facts(legacy.id)).toMatchObject({ endedFrom: '2026-04-01', endEvidence: 'proven' });
    expect(
      db.select().from(expectedPayment).where(eq(expectedPayment.id, legacy.id)).get()?.endDate,
    ).toBe('2026-03-31');
  });

  it.each(['pause', 'end'] as const)(
    'keeps a future assignment through %s, hides later link loss even after due day, and preserves booking Undo/redo',
    (kind) => {
      const p = make();
      const occurrence = row(p.id, '2026-04-25');
      const bookingId = book();
      linkOccurrence(db, occurrence.id, bookingId, ctx);
      const assigned = row(p.id, occurrence.dueDate);
      if (kind === 'pause') pauseExpectedPayment(db, p.id, '2026-04-30', token(p.id), ctx, TODAY);
      else endExpectedPayment(db, p.id, '2026-04-01', token(p.id), ctx, TODAY);
      expect(row(p.id, occurrence.dueDate)).toEqual(assigned);
      const groupId = 'synthetic-607-booking-delete';
      deleteBooking(db, bookingId, { ...ctx, groupId });
      expect(row(p.id, occurrence.dueDate)).toMatchObject({
        id: occurrence.id,
        status: 'expected',
        bookingId: null,
        deletedAt: null,
        expectedAmountCents: -1234,
      });
      const beforeReads = opened.sqlite.serialize();
      const beforeChanges = changes();
      expect(
        upcoming(db, '2026-04-01', '2026-04-30').some((r) => r.occurrenceId === occurrence.id),
      ).toBe(false);
      expect(
        readPaymentsPreview(db, TODAY)
          .rows.flatMap((r) => r.events)
          .some((e) => e.paymentId === p.id && e.dueDate === '2026-04-25'),
      ).toBe(false);
      vi.setSystemTime(new Date('2026-05-20T12:00:00Z'));
      expect(
        upcoming(db, '2026-04-01', '2026-04-30').some((r) => r.occurrenceId === occurrence.id),
      ).toBe(false);
      expect(
        readPaymentDetail(db, p.id, '2026-05-20').history.find(
          (r) => r.occurrenceId === occurrence.id,
        ),
      ).toMatchObject({ dueDate: '2026-04-25', expectedAmountCents: -1234 });
      unchanged(beforeReads);
      expect(changes()).toBe(beforeChanges);
      const restored = undo(db, { groupId }, ctx);
      expect(row(p.id, occurrence.dueDate)).toMatchObject({
        id: occurrence.id,
        bookingId,
        status: 'received',
        expectedAmountCents: -1234,
      });
      undo(db, { groupId: restored.groupId }, ctx);
      expect(
        upcoming(db, '2026-04-01', '2026-04-30').some((r) => r.occurrenceId === occurrence.id),
      ).toBe(false);
      expect(facts(p.id).deletion).toBe('everAssigned');
    },
  );

  it.each(['pause', 'end'] as const)(
    'refuses independent skip Undo under %s atomically, including force',
    (kind) => {
      const p = make();
      const skipped = skipOccurrence(db, p.id, '2026-04-25', ctx, TODAY);
      if (kind === 'pause') pauseExpectedPayment(db, p.id, '2026-04-30', token(p.id), ctx, TODAY);
      else endExpectedPayment(db, p.id, '2026-04-01', token(p.id), ctx, TODAY);
      const before = opened.sqlite.serialize();
      expect(() => undo(db, { groupId: skipped.groupId }, ctx, { force: true })).toThrow(
        AuditError,
      );
      unchanged(before);
      expect(row(p.id, '2026-04-25')).toMatchObject({
        id: skipped.occurrence.id,
        status: 'skipped',
        expectedAmountCents: -1234,
      });
    },
  );

  it('retains lifetime assignment after link Undo and forbids delete redo despite current null', () => {
    const p = make();
    const deleted = deleteExpectedPayment(db, p.id, ctx, TODAY, token(p.id));
    const restored = undo(db, { groupId: deleted.groupId }, ctx);
    const occurrence = row(p.id, '2026-04-25');
    const linked = linkOccurrence(db, occurrence.id, book(), ctx);
    undo(db, { groupId: linked.groupId }, ctx);
    expect(row(p.id, occurrence.dueDate).bookingId).toBeNull();
    expect(facts(p.id).deletion).toBe('everAssigned');
    const before = opened.sqlite.serialize();
    expect(() => deleteExpectedPayment(db, p.id, ctx, TODAY, token(p.id))).toThrow(ConflictError);
    expect(() => undo(db, { groupId: restored.groupId }, ctx, { force: true })).toThrow(AuditError);
    unchanged(before);
  });

  it('rejects deleted manual/assigned/past skip revival without changing a byte', () => {
    const p = make();
    const assigned = row(p.id, '2026-04-25');
    linkOccurrence(db, assigned.id, book(), ctx);
    const manual = skipOccurrence(db, p.id, '2026-05-25', ctx, TODAY).occurrence;
    const past = row(p.id, '2026-02-25');
    const retained = [
      { kind: 'assigned', old: row(p.id, assigned.dueDate) },
      { kind: 'manual', old: manual },
      { kind: 'past', old: past },
    ];
    const deletedAt = TODAY + 'T12:00:00.000Z';
    // updateTracked accepts one row's primary key, not an array of row identities.
    for (const { old } of retained)
      updateTracked(db, expectedOccurrence, [old.id], { deletedAt }, ctx, 'delete');
    for (const { kind, old } of retained)
      expect(row(p.id, old.dueDate), `${kind} fixture must be a retained tombstone`).toMatchObject({
        id: old.id,
        deletedAt,
        status: old.status,
        bookingId: old.bookingId,
        expectedAmountCents: old.expectedAmountCents,
        contactShareCents: old.contactShareCents,
      });
    const before = opened.sqlite.serialize();
    for (const { kind, old } of retained) {
      expect(
        () => skipOccurrence(db, p.id, old.dueDate, ctx, TODAY),
        `${kind}: ${old.dueDate}`,
      ).toThrow(ConflictError);
      unchanged(before);
    }
  });

  it('preserves repeated explicit skip of its own Undo tombstone with the same identity', () => {
    const p = make();
    // Match the unchanged OLD826 compatibility case: no materialized row at this due date.
    opened.sqlite
      .prepare('DELETE FROM expected_occurrence WHERE expected_payment_id=? AND due_date=?')
      .run(p.id, '2026-05-25');
    const first = skipOccurrence(db, p.id, '2026-05-25', ctx, TODAY);
    undo(db, { groupId: first.groupId }, ctx);
    addExpectedVersion(db, p.id, { validFrom: '2026-04-01', amountCents: 2345 }, ctx, TODAY);
    const repeated = skipOccurrence(db, p.id, '2026-05-25', ctx, TODAY);
    expect(repeated.occurrence).toMatchObject({
      id: first.occurrence.id,
      status: 'skipped',
      bookingId: null,
      expectedAmountCents: -1234,
      deletedAt: null,
    });
    undo(db, { groupId: repeated.groupId }, ctx);
    expect(skipOccurrence(db, p.id, '2026-05-25', ctx, TODAY).occurrence.id).toBe(
      first.occurrence.id,
    );
  });

  it.each(['pause', 'end'] as const)(
    'does not automatically rematch or mark an aged suppressed %s row after link loss',
    (kind) => {
      const p = make();
      const occurrence = row(p.id, '2026-04-25');
      const bookingId = book();
      linkOccurrence(db, occurrence.id, bookingId, ctx);
      if (kind === 'pause') pauseExpectedPayment(db, p.id, '2026-04-30', token(p.id), ctx, TODAY);
      else endExpectedPayment(db, p.id, '2026-04-01', token(p.id), ctx, TODAY);
      vi.setSystemTime(new Date('2026-05-20T12:00:00Z'));
      deleteBooking(db, bookingId, ctx);
      const alternativeBookingId = book();
      refreshOccurrences(db, '2026-05-20');
      const retained = row(p.id, occurrence.dueDate);
      expect(retained).toMatchObject({
        id: occurrence.id,
        status: 'expected',
        bookingId: null,
        deletedAt: null,
        expectedAmountCents: -1234,
      });
      matchOccurrences(db, '2026-05-20');
      expect(row(p.id, occurrence.dueDate)).toEqual(retained);
      expect(
        db
          .select()
          .from(expectedOccurrence)
          .where(eq(expectedOccurrence.bookingId, alternativeBookingId))
          .all(),
      ).toEqual([]);
      expect(upcoming(db, '2026-04-01', '2026-04-30')).toEqual([]);
    },
  );

  it('refuses overlap restoration and retains every row and audit after refusal', () => {
    const p = make();
    const first = pauseExpectedPayment(db, p.id, '2026-04-30', token(p.id), ctx, TODAY);
    const inverse = undo(db, { groupId: first.groupId }, ctx);
    pauseExpectedPayment(db, p.id, '2026-05-31', token(p.id), ctx, TODAY);
    const before = opened.sqlite.serialize();
    expect(() => undo(db, { groupId: inverse.groupId }, ctx, { force: true })).toThrow(AuditError);
    unchanged(before);
    expect(db.select().from(expectedPaymentPause).all()).toHaveLength(2);
  });

  it('jumps a long pause to canonical resumed terms without writing or altering contract cents', () => {
    const p = make();
    pauseExpectedPayment(db, p.id, '2030-06-30', token(p.id), ctx, TODAY);
    const before = opened.sqlite.serialize();
    expect(
      readPaymentDetail(db, p.id, TODAY)
        .future.slice(0, 3)
        .map((r) => [r.dueDate, r.expectedAmountCents]),
    ).toEqual([
      ['2030-07-25', -1234],
      ['2030-08-25', -1234],
      ['2030-09-25', -1234],
    ]);
    expect(listExpectedPayments(db, TODAY)[0]).toMatchObject({
      nextDueDate: null,
      monthlyEquivalentCents: -1234,
      yearlyEquivalentCents: -14808,
    });
    expect(scheduled(loadFacts(db, '2026-04-30'), '2026-04-01', '2026-04-30', TODAY)).toEqual([]);
    unchanged(before);
    refreshOccurrences(db, TODAY);
    expect(row(p.id, '2026-04-25').deletedAt).not.toBeNull();
  });

  it('uses the same paused and resumed income dates in Plan targets and the shared rules', () => {
    const p = createExpectedPayment(
      db,
      {
        name: 'Synthetic income',
        kind: 'inflow',
        accountId: 'giro',
        incomeTypeId: INCOME_TYPES.salary.id,
        dueDay: 25,
        startDate: '2026-01-01',
      },
      { validFrom: '2026-01-01', amountCents: 10000 },
      ctx,
      TODAY,
    ).payment;
    pauseExpectedPayment(db, p.id, '2026-04-30', token(p.id), ctx, TODAY);
    const before = opened.sqlite.serialize();
    const beforeChanges = changes();
    expect(scheduled(loadFacts(db, '2026-04-30'), '2026-04-01', '2026-04-30', TODAY)).toEqual([]);
    expect(
      scheduled(loadFacts(db, '2026-05-31'), '2026-05-01', '2026-05-31', TODAY).map((item) => [
        item.dueDate,
        item.cents,
      ]),
    ).toEqual([['2026-05-25', 10000]]);
    expect(planIncomeTargets(db, budgetSummary(db, '2026-04').summary, TODAY).expectedCents).toBe(
      0,
    );
    expect(planIncomeTargets(db, budgetSummary(db, '2026-05').summary, TODAY).expectedCents).toBe(
      10000,
    );
    unchanged(before);
    expect(changes()).toBe(beforeChanges);
  });

  it('remembers a link then explicit unlink, without treating the retained missed row as new open debt', () => {
    const p = make();
    const occurrence = row(p.id, '2026-04-25');
    linkOccurrence(db, occurrence.id, book(), ctx);
    unlinkOccurrence(db, occurrence.id, ctx);
    expect(facts(p.id).deletion).toBe('everAssigned');
    pauseExpectedPayment(db, p.id, '2026-04-30', token(p.id), ctx, TODAY);
    expect(row(p.id, occurrence.dueDate)).toMatchObject({
      status: 'missed',
      bookingId: null,
      deletedAt: null,
      expectedAmountCents: -1234,
    });
  });
});
