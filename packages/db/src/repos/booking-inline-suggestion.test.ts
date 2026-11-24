import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, booking, category, categoryGroup, payee } from '../schema';
import { createBooking } from './bookings';
import { prepareInboxBankSuggestions, readInbox } from './inbox';
import { suggestedBankPayee } from './assignment-rules';
import { suggestedBookingCategory } from './booking-category-suggestion';

const ACC = 'acc-inline';
const TODAY = '2026-10-20';
let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  const { db } = opened;
  db.insert(account)
    .values({
      id: ACC,
      name: 'Konto Beispiel',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 100_000,
    })
    .run();
  db.insert(categoryGroup).values({ id: 'grp', name: 'Gruppe' }).run();
  for (const [id, name, kind] of [
    ['cat-home', 'Haushalt', 'variable'],
    ['cat-fun', 'Freizeit', 'variable'],
    ['cat-pay', 'Gehalt', 'income'],
  ] as const)
    db.insert(category)
      .values({ id, name, groupId: 'grp', kind, class: kind === 'income' ? null : 'want' })
      .run();
  db.insert(payee).values({ id: 'p-shop', name: 'Shop Beispiel' }).run();
});
afterEach(() => opened.close());

function book(
  categoryId: string | null,
  date: string,
  status: 'confirmed' | 'pending' = 'confirmed',
) {
  return createBooking(
    opened.db,
    {
      accountId: ACC,
      date,
      amountCents: -1000,
      payeeId: 'p-shop',
      status,
      splits: [{ amountCents: -1000, categoryId }],
    },
    { actor: 'test' },
  );
}

it('matches a payee name as whole-word prefix of the bank text', () => {
  const { db } = opened;
  const hit = suggestedBankPayee(db, 's', 'SHOP BEISPIEL PAYMENTS EUROPE S.C.A.', '');
  expect(hit).toMatchObject({ payeeId: 'p-shop', learned: false });
  expect(suggestedBankPayee(db, 's', 'SHOP BEISPIELE GMBH', '').payeeId).toBeNull();
  db.insert(payee).values({ id: 'p-long', name: 'Shop Beispiel Payments' }).run();
  expect(suggestedBankPayee(db, 's', 'SHOP BEISPIEL PAYMENTS EUROPE', '').payeeId).toBe('p-long');
  db.insert(payee).values({ id: 'p-long2', name: 'shop beispiel payments' }).run();
  expect(suggestedBankPayee(db, 's', 'SHOP BEISPIEL PAYMENTS EUROPE', '').payeeId).toBeNull();
  db.insert(payee).values({ id: 'p-short', name: 'Ab' }).run();
  expect(suggestedBankPayee(db, 's', 'AB CD EF', '').payeeId).toBeNull();
});

it('suggests the default category, else the most frequent one', () => {
  const { db } = opened;
  for (const d of ['2026-09-01', '2026-09-02', '2026-09-03']) book('cat-home', d);
  book('cat-fun', '2026-10-10');
  book('cat-pay', '2026-10-11', 'pending'); // pending is ignored
  book('cat-fun', '2024-01-01'); // outside the window
  expect(suggestedBookingCategory(db, 'p-shop', -500, TODAY)).toMatchObject({
    categoryId: 'cat-home',
    basis: 'häufigste Kategorie (3 von 4 Buchungen, 12 Monate)',
  });
  db.update(payee).set({ defaultCategoryId: 'cat-fun' }).where(eq(payee.id, 'p-shop')).run();
  expect(suggestedBookingCategory(db, 'p-shop', -500, TODAY)).toMatchObject({
    categoryId: 'cat-fun',
    basis: 'Standardkategorie',
  });
  db.update(category).set({ hiddenAt: '2026-10-01' }).where(eq(category.id, 'cat-fun')).run();
  expect(suggestedBookingCategory(db, 'p-shop', -500, TODAY)?.categoryId).toBe('cat-home');
});

it('never suggests an income category for an outflow', () => {
  for (const d of ['2026-09-01', '2026-09-02']) book('cat-pay', d);
  expect(suggestedBookingCategory(opened.db, 'p-shop', -500, TODAY)).toBeNull();
  expect(suggestedBookingCategory(opened.db, 'p-shop', 500, TODAY)?.categoryId).toBe('cat-pay');
});

it('adds a read-only suggestion to unclassified booking entries', () => {
  const { db } = opened;
  for (const d of ['2026-09-01', '2026-09-02']) book('cat-home', d);
  const open = createBooking(
    db,
    {
      accountId: ACC,
      date: '2026-10-15',
      amountCents: -1500,
      status: 'pending',
      splits: [{ amountCents: -1500 }],
    },
    { actor: 'test' },
  );
  db.update(booking)
    .set({ source: 'bank', bankSourceId: 's', bankRawPayee: 'SHOP BEISPIEL PAYMENTS EUROPE' })
    .where(eq(booking.id, open))
    .run();
  const entries = readInbox(db, TODAY).entries;
  const prepared = prepareInboxBankSuggestions(db, entries).find(
    (e) => e.type === 'booking' && e.bookingId === open,
  );
  expect(prepared).toMatchObject({
    suggestion: { payeeId: 'p-shop', payeeName: 'Shop Beispiel', categoryId: 'cat-home' },
  });
  expect(db.select().from(booking).where(eq(booking.id, open)).get()?.payeeId).toBeNull();
});
