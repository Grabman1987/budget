import { sqliteOf, type OpenedDatabase } from '../client';
import { createEntity } from './entities';
import { createBooking } from './bookings';
import { settleContact } from './contacts';
import { contact } from '../schema';
import { testCtx } from './test-helpers';

/**
 * Synthetic fixture of the contact identity contract (#869/#870), literal cents:
 * Kontakt A: outlay 12 000 repaid 7 500 (open 4 500) and a closed outlay 3 000 repaid 3 000.
 * Kontakt B: closed history only (2 000 out, 2 000 back). A credit cannot coexist with an open
 * outlay (the statement nets a credit against later outlays), so credit cases use a third contact
 * inside the tests.
 * Needs `seedBasics` (account "giro", category "auslagen").
 */
export function seedIdentityContacts(db: OpenedDatabase['db']) {
  createEntity(db, contact, { id: 'ka', name: 'Kontakt A' }, testCtx);
  createEntity(db, contact, { id: 'kb', name: 'Kontakt B' }, testCtx);
  const outlay = (contactId: string, cents: number, date: string) =>
    createBooking(
      db,
      {
        accountId: 'giro',
        date,
        amountCents: -cents,
        splits: [{ categoryId: 'auslagen', contactId, amountCents: -cents }],
      },
      testCtx,
    );
  const splitIdOf = (contactId: string, cents: number) => {
    const row = sqliteOf(db)
      .prepare(
        'SELECT s.id FROM booking_split s JOIN booking b ON b.id = s.booking_id WHERE s.contact_id = ? AND s.amount_cents = ? AND b.deleted_at IS NULL',
      )
      .get(contactId, -cents) as { id: string };
    return row.id;
  };
  outlay('ka', 3_000, '2026-03-01');
  outlay('kb', 2_000, '2026-03-03');
  const pay = (
    contactId: string,
    cents: number,
    allocations: [string, number][],
    date = '2026-03-10',
  ) =>
    settleContact(
      db,
      contactId,
      {
        accountId: 'giro',
        date,
        amountCents: cents,
        allocations: allocations.map(([outlaySplitId, amountCents]) => ({
          outlaySplitId,
          amountCents,
        })),
      },
      testCtx,
    );
  pay('ka', 3_000, [[splitIdOf('ka', 3_000), 3_000]]);
  pay('kb', 2_000, [[splitIdOf('kb', 2_000), 2_000]]);
  outlay('ka', 12_000, '2026-03-20');
  pay('ka', 7_500, [[splitIdOf('ka', 12_000), 7_500]], '2026-03-25');
  return { a: 'ka', b: 'kb' };
}
