import { describe, expect, it } from 'vitest';
import { cellBookingRows } from './report-cell-bookings';

const base = {
  bookingId: 'b1',
  date: '2026-03-04',
  payeeName: 'Beispiel Markt',
  accountName: 'Girokonto',
  memo: null,
  bookingCents: null,
};

describe('cellBookingRows', () => {
  it('maps a whole booking without a split hint', () => {
    const [row] = cellBookingRows([{ ...base, cents: 1250, bookingCents: -1250 }]);
    expect(row).toMatchObject({
      payee: 'Beispiel Markt',
      account: 'Girokonto',
      memo: '–',
      cents: 1250,
      partOf: null,
    });
  });

  it('shows a split share with the whole booking amount', () => {
    const rows = cellBookingRows([
      { ...base, cents: 700, bookingCents: -2000, memo: ' Wocheneinkauf ' },
      { ...base, bookingId: 'b2', cents: -300, bookingCents: 300, payeeName: null },
    ]);
    expect(rows[0]).toMatchObject({ cents: 700, partOf: 2000, memo: 'Wocheneinkauf' });
    expect(rows[1]).toMatchObject({ cents: -300, partOf: null, payee: '–' });
    expect(rows.reduce((sum, row) => sum + row.cents, 0)).toBe(400);
  });
});
