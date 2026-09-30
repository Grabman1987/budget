import { describe, expect, it } from 'vitest';
import { applyBulk, mapCachedBookings, patchListed, type Names } from './cache';
import type { BookingPage, ListedBooking } from './types';

const names: Names = {
  category: (id) => (id === 'c2' ? 'Haushalt' : null),
  payee: (id) => (id === 'p2' ? 'Drogerie' : null),
};
const booking = (
  id: string,
  amountCents: number,
  over: Partial<ListedBooking> = {},
): ListedBooking => ({
  id,
  accountId: 'a1',
  accountName: 'Girokonto',
  date: '2026-09-10',
  amountCents,
  payeeId: 'p1',
  payeeName: 'Supermarkt',
  memo: null,
  status: 'confirmed',
  flag: null,
  transferId: null,
  transferAccountId: null,
  transferAccountName: null,
  projectId: null,
  currency: 'EUR',
  originalAmountCents: null,
  originalCurrency: null,
  splits: [
    {
      id: `${id}s`,
      categoryId: 'c1',
      categoryName: 'Lebensmittel',
      amountCents,
      memo: null,
      contactId: null,
      incomeTypeId: null,
      transferId: null,
    },
  ],
  balanceAfterCents: null,
  ...over,
});
const page = (...items: ListedBooking[]): BookingPage => ({
  items,
  nextCursor: null,
  total: items.length,
  sumCents: items.reduce((s, b) => s + b.amountCents, 0),
});

describe('patchListed', () => {
  it('shows category and payee names of the patch at once', () => {
    const next = patchListed(
      booking('b1', -1000),
      { payeeId: 'p2', splits: [{ categoryId: 'c2', amountCents: -1000 }], flag: 'red' },
      names,
    );
    expect(next).toMatchObject({ payeeName: 'Drogerie', flag: 'red' });
    expect(next.splits[0]).toMatchObject({ categoryId: 'c2', categoryName: 'Haushalt' });
  });
  it('moves the single split with an amount change', () => {
    const next = patchListed(booking('b1', -1000), { amountCents: -1500 }, names);
    expect(next.splits[0]?.amountCents).toBe(-1500);
  });
});

describe('applyBulk', () => {
  it('leaves transfers and split bookings untouched in the category', () => {
    const transfer = booking('t', -500, { transferId: 'x' });
    expect(applyBulk(transfer, { categoryId: 'c2' }, names).splits[0]?.categoryId).toBe('c1');
    expect(applyBulk(booking('b', -500), { categoryId: 'c2' }, names).splits[0]?.categoryId).toBe(
      'c2',
    );
  });
});

describe('mapCachedBookings', () => {
  it('removes a booking and corrects total and sum, also in infinite results', () => {
    const data = page(booking('b1', -1000), booking('b2', -500));
    const out = mapCachedBookings(data, (b) => (b.id === 'b1' ? null : b));
    expect(out).toMatchObject({ total: 1, sumCents: -500 });
    const infinite = { pages: [data], pageParams: [undefined] };
    const outInf = mapCachedBookings(infinite, (b) => (b.id === 'b2' ? null : b));
    expect(outInf.pages[0]).toMatchObject({ total: 1, sumCents: -1000 });
  });
  it('recomputes the sum when an amount changes', () => {
    const out = mapCachedBookings(page(booking('b1', -1000)), (b) => ({
      ...b,
      amountCents: -1200,
    }));
    expect(out?.sumCents).toBe(-1200);
  });
});
