import { expect, it } from 'vitest';
import { cashWithBankTransit } from './bank-transfer-transit';

it('sums opposing cash and multiple transit terms before checking the final native limit', () => {
  const transfers = new Map([
    [
      'recipient',
      [
        {
          debitDate: '2026-11-13',
          receiptDate: '2026-11-16',
          amountCents: Number.MAX_SAFE_INTEGER,
        },
        { debitDate: '2026-11-13', receiptDate: '2026-11-16', amountCents: 2 },
      ],
    ],
  ]);
  expect(cashWithBankTransit(transfers, 'recipient', '2026-11-14', -Number.MAX_SAFE_INTEGER)).toBe(
    2,
  );
  expect(cashWithBankTransit(transfers, 'recipient', '2026-11-16', 2)).toBe(2);
});
