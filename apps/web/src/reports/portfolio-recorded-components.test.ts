import { expect, it } from 'vitest';
import type { ProductTrade } from '@budget/domain';
import { recordedComponents } from './portfolio-recorded-components';

const trade = (date: string, kind: ProductTrade['kind'], amountCents: number): ProductTrade => ({
  date,
  kind,
  amountCents,
  feeCents: 10,
  taxCents: 20,
  unitsE8: 0,
});

it('keeps all months of a long interval and its exact open/closed boundaries', () => {
  const rows = recordedComponents(
    [
      trade('2024-01-15', 'dividend', 9999),
      trade('2024-01-16', 'dividend', 1000),
      trade('2025-03-10', 'interest', 2000),
      trade('2025-03-11', 'dividend', 9999),
    ],
    '2024-01-15',
    '2025-03-10',
  );
  expect(rows).toHaveLength(15);
  expect(rows[0]).toEqual({ month: '2024-01', incomeCents: 1000, feesCents: 10, taxesCents: 20 });
  expect(rows.at(-1)).toEqual({
    month: '2025-03',
    incomeCents: 2000,
    feesCents: 10,
    taxesCents: 20,
  });
  expect(rows[1]).toEqual({ month: '2024-02', incomeCents: 0, feesCents: 0, taxesCents: 0 });
});

it('uses recorded standalone fees/taxes and trade charges without computing withholding', () => {
  expect(
    recordedComponents(
      [
        trade('2026-01-02', 'buy', 10000),
        trade('2026-01-03', 'dividend', 1000),
        trade('2026-01-04', 'fee', 300),
        trade('2026-01-05', 'tax', 700),
      ],
      '2025-12-31',
      '2026-01-31',
    ),
  ).toEqual([{ month: '2026-01', incomeCents: 1000, feesCents: 340, taxesCents: 760 }]);
});
