import { afterEach, beforeEach, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { ContactAllocationError } from '@budget/domain';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { contact } from '../schema';
import { seedBasics, testCtx } from './test-helpers';
import { createBooking } from './bookings';
import { createEntity } from './entities';
import {
  getContactStatement,
  listContactStatements,
  readOverdueContactReminders,
  settleContact,
} from './contacts';

let opened: OpenedDatabase;
const today = '2026-09-30';
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  createEntity(opened.db, contact, { id: 'k2', name: 'Beispielkontakt Zwei' }, testCtx);
});
afterEach(() => opened.close());

function outlay(contactId: string, amountCents: number, date: string) {
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date,
      amountCents: -amountCents,
      splits: [{ categoryId: 'auslagen', contactId, amountCents: -amountCents }],
    },
    testCtx,
    { contactModel: true },
  );
}

/** k1 owes 400 after a 600 repayment, but its stored allocation is made contradictory. */
function contradictoryK1() {
  outlay('k1', 1000, '2026-08-01');
  settleContact(
    opened.db,
    'k1',
    { accountId: 'giro', date: '2026-09-01', amountCents: 600 },
    testCtx,
  );
  opened.db.run(sql`UPDATE contact_allocation SET amount_cents = amount_cents + 5000`);
}

it('lists a contact with contradictory settlement data flagged, with its plain balance', () => {
  outlay('k2', 700, '2026-08-02');
  contradictoryK1();
  expect(() => getContactStatement(opened.db, 'k1', today)).toThrow(ContactAllocationError);
  const rows = listContactStatements(opened.db, today, true);
  const k1 = rows.find((r) => r.id === 'k1')!;
  const k2 = rows.find((r) => r.id === 'k2')!;
  expect(k1.allocationNeedsReview).toBe(true);
  expect(k1.balanceCents).toBe(400);
  expect(k1.receivableCents).toBe(400);
  expect(k1.creditCents).toBe(0);
  expect(k2.allocationNeedsReview).toBe(false);
  expect(k2.balanceCents).toBe(700);
  expect(k2.receivableCents).toBe(700);
});

it('keeps overdue reminders for consistent contacts when one contact needs review', () => {
  outlay('k2', 700, '2026-08-02');
  contradictoryK1();
  const result = readOverdueContactReminders(opened.db, today);
  expect(result.unavailableCount).toBe(1);
  expect(result.items.map((i) => [i.contactId, i.overdueCents])).toEqual([['k2', 700]]);
});
