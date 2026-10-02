import { describe, expect, it } from 'vitest';
import { feesLast12Months, incomeLast12Months, type ProductTrade } from './cost';
import {
  COST_RATE_TARGET_BP,
  KEST_RATE_BP,
  feeBreakdownLast12Months,
  incomeByKindLast12Months,
  latentTaxCents,
  taxBreakdownLast12Months,
} from './costs-taxes';

const TODAY = '2026-09-17';
const trade = (
  over: Partial<ProductTrade> & Pick<ProductTrade, 'kind' | 'date'>,
): ProductTrade => ({
  unitsE8: 0,
  amountCents: 0,
  feeCents: 0,
  taxCents: 0,
  ...over,
});

const trades: ProductTrade[] = [
  trade({
    kind: 'buy',
    date: '2026-01-10',
    unitsE8: 1,
    amountCents: 20_000,
    feeCents: 100,
    taxCents: 5,
  }),
  trade({
    kind: 'sell',
    date: '2026-08-10',
    unitsE8: -1,
    amountCents: 26_000,
    feeCents: 100,
    taxCents: 400,
  }),
  trade({ kind: 'dividend', date: '2026-06-10', amountCents: 1_800, feeCents: 25, taxCents: 495 }),
  trade({ kind: 'interest', date: '2026-07-05', amountCents: 1_000, taxCents: 275 }),
  trade({ kind: 'fee', date: '2026-04-02', amountCents: 120 }),
  trade({ kind: 'tax', date: '2026-04-30', amountCents: 80 }),
  // Outside the window: exactly one year ago is excluded, after today is not part of the data.
  trade({ kind: 'dividend', date: '2025-09-17', amountCents: 9_999, feeCents: 9, taxCents: 99 }),
  trade({
    kind: 'sell',
    date: '2025-01-01',
    unitsE8: -1,
    amountCents: 100,
    feeCents: 7,
    taxCents: 7,
  }),
];

describe('latentTaxCents', () => {
  it('is 27,5 % of a gain rounded half up and nothing on a loss', () => {
    expect(KEST_RATE_BP).toBe(2_750);
    expect(latentTaxCents(100_000)).toBe(27_500);
    expect(latentTaxCents(1)).toBe(0);
    expect(latentTaxCents(2)).toBe(1);
    expect(latentTaxCents(-50_000)).toBe(0);
    expect(latentTaxCents(0)).toBe(0);
    expect(latentTaxCents(100_000, 2_500)).toBe(25_000);
  });

  it('is exact for amounts beyond 2^53 / 10 000', () => {
    expect(latentTaxCents(9_007_199_254_740_000)).toBe(
      Number((9_007_199_254_740_000n * 2_750n + 5_000n) / 10_000n),
    );
  });
});

describe('taxBreakdownLast12Months', () => {
  it('reads the broker taxes as booked and separates income from the rest', () => {
    expect(taxBreakdownLast12Months(trades, TODAY)).toEqual({
      dividendCents: 495,
      interestCents: 275,
      saleCents: 400,
      purchaseCents: 5,
      bookingCents: 80,
      onIncomeCents: 770,
      totalCents: 770 + 400 + 5 + 80,
    });
  });

  it('matches the income summary of the shared income function', () => {
    const income = incomeLast12Months(trades, TODAY);
    expect(taxBreakdownLast12Months(trades, TODAY).onIncomeCents).toBe(income.taxCents);
  });
});

describe('feeBreakdownLast12Months', () => {
  it('splits fees by origin and adds up to the shared fee total', () => {
    const fees = feeBreakdownLast12Months(trades, TODAY);
    expect(fees).toEqual({
      orderCents: 200,
      incomeCents: 25,
      bookingCents: 120,
      otherCents: 0,
      totalCents: 345,
    });
    expect(fees.totalCents).toBe(feesLast12Months(trades, TODAY));
  });

  it('counts a fee on a tax booking or split as other fees', () => {
    const extra = [
      trade({ kind: 'tax', date: '2026-05-01', amountCents: 10, feeCents: 3 }),
      trade({ kind: 'split', date: '2026-05-02', unitsE8: 5, feeCents: 2 }),
    ];
    const fees = feeBreakdownLast12Months(extra, TODAY);
    expect(fees.otherCents).toBe(5);
    expect(fees.totalCents).toBe(feesLast12Months(extra, TODAY));
  });
});

describe('incomeByKindLast12Months', () => {
  it('sums dividends and interest separately inside the window', () => {
    expect(incomeByKindLast12Months(trades, TODAY)).toEqual({
      dividend: { grossCents: 1_800, taxCents: 495, feeCents: 25 },
      interest: { grossCents: 1_000, taxCents: 275, feeCents: 0 },
    });
  });
});

it('keeps the cost target of rule S3-2 (0,30 %)', () => {
  expect(COST_RATE_TARGET_BP).toBe(30);
});
