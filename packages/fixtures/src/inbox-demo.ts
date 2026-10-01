import {
  createBooking,
  matchOccurrences,
  refreshOccurrences,
  schema,
  updateBooking,
  type Db,
} from '@budget/db';
import { and, eq, gt } from 'drizzle-orm';

/**
 * Extra state on top of the sample ledger so that the Posteingang shows every kind of item the
 * prototype shows (design/prototype/konten.js): four uncategorised bookings with suggestions, a
 * Strom payment that got dearer, a P2P value that is 34 days old and a possible transfer and a
 * bank consent of the data-source package (P4) that are rendered generically. The overspent
 * envelopes, the missed and the deviating payments and the rules come from the ledger itself.
 * Used by the e2e servers for the inbox only (`db-seed --inbox-demo`); never by the sample server.
 */
const ACTOR = { actor: 'demo' };

export function seedInboxDemo(db: Db, today: string): void {
  const spend = (accountId: string, date: string, amountCents: number, payeeId: string) =>
    createBooking(db, { accountId, date, amountCents, payeeId, splits: [{ amountCents }] }, ACTOR);
  spend('acc-karte', '2026-09-05', -7_250, 'pay-restaurant');
  spend('acc-giro', '2026-09-08', -1_860, 'pay-apotheke');
  spend('acc-giro', '2026-09-11', -4_130, 'pay-supermarkt');
  spend('acc-giro', '2026-09-14', -2_490, 'pay-buchhandlung');

  // The last Strom debit was 118,00 € instead of the planned 105,00 €.
  refreshOccurrences(db, today);
  updateBooking(
    db,
    'bk-004124',
    { amountCents: -11_800, splits: [{ categoryId: 'cat-strom', amountCents: -11_800 }] },
    ACTOR,
    { unlockReconciled: true },
  );
  matchOccurrences(db, today);

  // The P2P position was valued by hand on 14.08.: 34 days before the sample day.
  const manual = db
    .select()
    .from(schema.price)
    .where(and(eq(schema.price.securityId, 'sec-p2p'), gt(schema.price.date, '2026-08-14')))
    .all();
  const last = manual[manual.length - 1];
  db.delete(schema.price)
    .where(and(eq(schema.price.securityId, 'sec-p2p'), gt(schema.price.date, '2026-08-14')))
    .run();
  if (last)
    db.insert(schema.price)
      .values({ ...last, date: '2026-08-14' })
      .onConflictDoNothing()
      .run();

  // Items of the data-source package, shown generically until it exists.
  db.insert(schema.inboxItem)
    .values([
      {
        id: 'demo-transfer',
        kind: 'import',
        title: 'Girokonto −412,00 € ⇢ Kreditkarte +412,00 €',
        detail: '03.09. · wird budgetneutral, wenn bestätigt',
        refType: 'transfer',
        refId: 'demo',
      },
      {
        id: 'demo-consent',
        kind: 'consent',
        title: 'Bank A · Tagesgeld: Einwilligung läuft in 12 Tagen ab',
        detail: 'danach kein automatischer Abruf mehr',
        refType: 'bank_connection',
        refId: 'demo',
      },
    ])
    .run();
}
