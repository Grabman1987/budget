import { afterEach, beforeEach, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { expectedOccurrence } from '../schema';
import { undo } from './audit';
import {
  createExpectedPayment,
  moveOccurrence,
  refreshOccurrences,
  skipOccurrence,
  upcoming,
} from './expected';
import { readPaymentDetail } from './expected-detail';
import { ConflictError } from './errors';
import { seedBasics, testCtx as ctx } from './test-helpers';

const TODAY = '2024-01-15';
let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());

function payment() {
  return createExpectedPayment(
    opened.db,
    { name: 'Synthetic rent', accountId: 'giro', dueDay: 20, startDate: '2024-01-01' },
    { validFrom: '2024-01-01', amountCents: 1000 },
    ctx,
    TODAY,
  ).payment;
}

const live = (paymentId: string) =>
  opened.db
    .select()
    .from(expectedOccurrence)
    .where(
      and(
        eq(expectedOccurrence.expectedPaymentId, paymentId),
        isNull(expectedOccurrence.deletedAt),
      ),
    )
    .all();

const at = (paymentId: string, dueDate: string) =>
  live(paymentId).find((o) => o.dueDate === dueDate);

it('moves one occurrence; re-planning neither recreates nor removes it; forecast reads follow', () => {
  const p = payment();
  const count = live(p.id).length;
  const feb = at(p.id, '2024-02-20')!;
  const moved = moveOccurrence(opened.db, feb.id, '2024-02-27', ctx, TODAY);
  expect(moved.occurrence).toMatchObject({ dueDate: '2024-02-27', plannedDueDate: '2024-02-20' });
  refreshOccurrences(opened.db, TODAY);
  refreshOccurrences(opened.db, TODAY);
  expect(live(p.id)).toHaveLength(count);
  expect(at(p.id, '2024-02-20')).toBeUndefined();
  expect(at(p.id, '2024-02-27')?.id).toBe(feb.id);
  // Other occurrences keep the rule.
  expect(at(p.id, '2024-03-20')).toBeDefined();
  const rows = upcoming(opened.db, '2024-02-01', '2024-02-29').filter((r) => r.paymentId === p.id);
  expect(rows.map((r) => r.dueDate)).toEqual(['2024-02-27']);
  // The detail shows the moved row once, with its rule date, and no preview on the rule date.
  const detail = readPaymentDetail(opened.db, p.id, TODAY);
  const feb27 = detail.future.filter((r) => r.dueDate.startsWith('2024-02'));
  expect(feb27).toHaveLength(1);
  expect(feb27[0]).toMatchObject({ dueDate: '2024-02-27', movedFrom: '2024-02-20' });
});

it('moving back to the rule date clears the marker; undo restores the original day', () => {
  const p = payment();
  const feb = at(p.id, '2024-02-20')!;
  const first = moveOccurrence(opened.db, feb.id, '2024-02-10', ctx, TODAY);
  const back = moveOccurrence(opened.db, feb.id, '2024-02-20', ctx, TODAY);
  expect(back.occurrence).toMatchObject({ dueDate: '2024-02-20', plannedDueDate: null });
  const again = moveOccurrence(opened.db, feb.id, '2024-02-12', ctx, TODAY);
  undo(opened.db, { groupId: again.groupId }, ctx);
  expect(at(p.id, '2024-02-20')).toMatchObject({ id: feb.id, plannedDueDate: null });
  expect(first.groupId).not.toBe(again.groupId);
});

it('refuses the past, a day of another occurrence and non-open occurrences', () => {
  const p = payment();
  const feb = at(p.id, '2024-02-20')!;
  expect(() => moveOccurrence(opened.db, feb.id, '2024-01-14', ctx, TODAY)).toThrow(RangeError);
  expect(() => moveOccurrence(opened.db, feb.id, '2024-03-20', ctx, TODAY)).toThrow(ConflictError);
  skipOccurrence(opened.db, p.id, '2024-03-20', ctx, TODAY);
  const mar = at(p.id, '2024-03-20')!;
  expect(() => moveOccurrence(opened.db, mar.id, '2024-03-25', ctx, TODAY)).toThrow(ConflictError);
});

it('skipping a moved occurrence by its chosen day strikes that row, nothing is duplicated', () => {
  const p = payment();
  const feb = at(p.id, '2024-02-20')!;
  moveOccurrence(opened.db, feb.id, '2024-02-27', ctx, TODAY);
  const count = live(p.id).length;
  const skipped = skipOccurrence(opened.db, p.id, '2024-02-27', ctx, TODAY);
  expect(skipped.occurrence).toMatchObject({ id: feb.id, status: 'skipped' });
  refreshOccurrences(opened.db, TODAY);
  expect(live(p.id)).toHaveLength(count);
});
