import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { auditLog, budgetMonth, expectedOccurrence, INCOME_TYPES } from '../schema';
import { setCategoryTarget } from './categories';
import { createBooking } from './bookings';
import { createExpectedPayment, addExpectedVersion } from './expected';
import { budgetSummary } from './budget';
import { planIncomeTargets } from './income-targets';
import { seedBasics, testCtx as ctx } from './test-helpers';
import { undo } from './audit';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.sqlite.close());
const view = (month = '2026-09') =>
  planIncomeTargets(opened.db, budgetSummary(opened.db, month).summary, '2026-09-17');
describe('Plan income target sources', () => {
  it('reads dated schedule amounts without materialised occurrences or writes', () => {
    const db = opened.db;
    const made = createExpectedPayment(
      db,
      {
        name: 'Monatseinkommen',
        kind: 'inflow',
        rhythm: 'monthly',
        dueDay: 15,
        accountId: 'giro',
        incomeTypeId: INCOME_TYPES.salary.id,
      },
      { validFrom: '2026-01-01', amountCents: 200_000 },
      ctx,
      '2026-09-17',
    );
    const changed = addExpectedVersion(
      db,
      made.payment.id,
      { validFrom: '2026-09-01', amountCents: 250_000, amountMaxCents: 270_000 },
      ctx,
      '2026-09-17',
    );
    setCategoryTarget(
      db,
      'essen',
      { kind: 'monthly', amountCents: 260_000, everyMonths: 1, targetDate: null },
      '2026-09',
      ctx,
    );
    const before = db.select().from(auditLog).all().length;
    expect(view()).toMatchObject({
      source: 'expected',
      expectedCents: 250_000,
      targetsCents: 260_000,
      differenceCents: -10_000,
    });
    expect(db.select().from(auditLog).all()).toHaveLength(before);
    undo(db, { groupId: changed.groupId }, ctx);
    expect(view().expectedCents).toBe(200_000);
    db.delete(expectedOccurrence).run();
    expect(view().expectedCents).toBe(200_000);
    expect(db.select().from(expectedOccurrence).all()).toEqual([]);
  });
  it('uses three complete earned-income months, also for future planning, respecting held money', () => {
    for (const [month, cents] of [
      ['2026-06', 200_000],
      ['2026-07', 900_000],
      ['2026-08', 220_000],
    ] as const) {
      createBooking(
        opened.db,
        {
          accountId: 'giro',
          date: `${month}-15`,
          amountCents: cents,
          splits: [{ categoryId: null, amountCents: cents, incomeTypeId: INCOME_TYPES.salary.id }],
        },
        ctx,
      );
      createBooking(
        opened.db,
        {
          accountId: 'giro',
          date: `${month}-16`,
          amountCents: 10_000,
          splits: [
            { categoryId: null, amountCents: 10_000, incomeTypeId: INCOME_TYPES.capital.id },
          ],
        },
        ctx,
      );
    }
    expect(view()).toMatchObject({ source: 'median', expectedCents: 220_000 });
    expect(view('2026-12').expectedCents).toBe(220_000);
    opened.db
      .insert(budgetMonth)
      .values([
        { month: '2026-08', heldCents: 30_000 },
        { month: '2026-09', heldCents: 50_000 },
      ])
      .run();
    expect(view()).toMatchObject({ expectedCents: 220_000, assignedIncomeCents: 200_000 });
  });
  it('does not disguise a due payment without an EUR amount as a median', () => {
    createExpectedPayment(
      opened.db,
      {
        name: 'Fremdwährungszahlung',
        kind: 'inflow',
        rhythm: 'monthly',
        dueDay: 15,
        incomeTypeId: INCOME_TYPES.salary.id,
      },
      { validFrom: '2026-01-01', amountCents: 200_000, currency: 'USD' },
      ctx,
      '2026-09-17',
    );
    expect(view()).toMatchObject({
      source: 'unavailable',
      expectedCents: null,
      differenceCents: null,
    });
  });
});
