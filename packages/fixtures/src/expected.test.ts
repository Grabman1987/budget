import {
  createTestDatabase,
  matchOccurrences,
  monthIncome,
  refreshOccurrences,
  upcoming,
  type Db,
} from '@budget/db';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from './seed';

/** The sample ledger ends on 17.09.2026; the expected payments must explain its bookings. */
const TODAY = '2026-09-17';

let db: Db;
beforeAll(() => {
  db = createTestDatabase().db;
  seedDatabase(db);
  refreshOccurrences(db, TODAY);
  matchOccurrences(db, TODAY);
}, 60_000);

describe('sample expected payments', () => {
  it('September 2026: everything due up to the 17th is received, the rest is expected', () => {
    const rows = upcoming(db, '2026-09-01', '2026-09-30');
    expect(rows.length).toBeGreaterThan(15);
    for (const row of rows) {
      if (row.name === 'Beitrag zum Haushalt') continue; // see the next test
      const due = row.dueDate <= TODAY;
      expect(row.status, `${row.name} ${row.dueDate}`).toBe(due ? 'received' : 'expected');
      expect(row.bookingId === null, row.name).toBe(!due);
    }
  });

  it('the prototype has no contribution in its partial September: a missed occurrence', () => {
    const row = upcoming(db, '2026-09-01', '2026-09-30').find(
      (r) => r.name === 'Beitrag zum Haushalt',
    );
    expect(row).toMatchObject({ dueDate: '2026-09-01', status: 'missed', bookingId: null });
  });

  it('a received occurrence carries the booked amount of its payment', () => {
    const rent = upcoming(db, '2026-09-01', '2026-09-30').find((r) => r.name === 'Miete')!;
    expect(rent.amountCents).toBe(-89_000);
    expect(rent.bookedAmountCents).toBe(-89_000);
    const usd = upcoming(db, '2026-09-01', '2026-09-30').find((r) => r.name === 'KI-Assistent')!;
    expect(usd.currency).toBe('USD');
    expect(usd.status).toBe('received');
  });

  it('the salary falls on the last business day: 30.09.2026', () => {
    const salary = upcoming(db, '2026-09-01', '2026-09-30').find((r) => r.name === 'Gehalt')!;
    expect(salary.dueDate).toBe('2026-09-30');
    expect(salary.status).toBe('expected');
  });

  it('August 2026: all received, except the trip that cost less than planned', () => {
    const august = upcoming(db, '2026-08-01', '2026-08-31');
    const off = august.filter((r) => r.status !== 'received');
    expect(off.map((r) => [r.name, r.status])).toEqual([['Reisen (August)', 'deviating']]);
    expect(off[0]?.suggestion).toEqual({
      paymentId: off[0]?.paymentId,
      fromMonth: '2026-08',
      amountCents: 290_725,
    });
  });

  it('no booking is used twice', () => {
    const rows = upcoming(db, '2026-08-01', '2027-09-30').filter((r) => r.bookingId !== null);
    expect(new Set(rows.map((r) => r.bookingId)).size).toBe(rows.length);
  });

  it('income of August: salary and contribution arrived as planned', () => {
    const income = monthIncome(db, '2026-08');
    expect(income.receivedCents).toBe(income.expectedCents);
    expect(income.byIncomeType.map((t) => t.name)).toEqual(['Beiträge von Kontakten', 'Gehalt']);
  });

  it('the plan reaches twelve months ahead', () => {
    const rows = upcoming(db, '2027-09-01', '2027-09-30');
    expect(rows.some((r) => r.name === 'Gehalt' && r.dueDate === '2027-09-30')).toBe(true);
  });
});
