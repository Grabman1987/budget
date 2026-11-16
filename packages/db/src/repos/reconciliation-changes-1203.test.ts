import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { accounts } from './entities';
import { createBooking, deleteBooking, updateBooking } from './bookings';
import { bookedBalance, reconcileAccount, reconciliationChangesSince } from './reconciliation';

let opened: OpenedDatabase;
const ctx = () => ({ actor: 'synthetic-1203' });
const pause = () => new Promise((r) => setTimeout(r, 15));
const book = (date: string, amountCents: number) =>
  createBooking(
    opened.db,
    {
      accountId: 'a',
      date,
      status: 'confirmed',
      amountCents,
      splits: [{ amountCents, categoryId: null }],
    },
    ctx(),
  );
beforeEach(() => {
  opened = createTestDatabase();
  accounts.create(
    opened.db,
    {
      id: 'a',
      name: 'Synthetisches Konto',
      type: 'checking',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 10000,
      role: 'budget',
    },
    ctx(),
  );
});
afterEach(() => opened.close());

it('lists bookings created, changed and deleted after a check inside its period and explains the difference to the cent', async () => {
  book('2026-08-20', -100);
  const { reconciliationId } = reconcileAccount(
    opened.db,
    { accountId: 'a', date: '2026-09-01', statementBalanceCents: 9900, today: '2026-10-19' },
    ctx(),
  );
  expect(reconciliationChangesSince(opened.db, reconciliationId)!.changes).toEqual([]);
  await pause();
  const added = book('2026-08-25', -250);
  const doomed = book('2026-08-26', -40);
  book('2026-09-15', -999); // after the checked day: not part of the period
  updateBooking(
    opened.db,
    added,
    { amountCents: -300, splits: [{ amountCents: -300, categoryId: null }] },
    ctx(),
  );
  deleteBooking(opened.db, doomed, ctx());
  const result = reconciliationChangesSince(opened.db, reconciliationId)!;
  expect(result.statementBalanceCents).toBe(9900);
  expect(result.currentBalanceCents).toBe(bookedBalance(opened.db, 'a', '2026-09-01'));
  expect(result.currentBalanceCents).toBe(9600);
  expect(result.changes.map((c) => [c.bookingId, c.change, c.effectCents])).toEqual([
    [added, 'created', -250],
    [doomed, 'created', -40],
    [added, 'changed', -50],
    [doomed, 'deleted', 40],
  ]);
  expect(result.explainedCents).toBe(-300);
  expect(result.unexplainedCents).toBe(0);
  expect(reconciliationChangesSince(opened.db, 'missing')).toBeNull();
});
