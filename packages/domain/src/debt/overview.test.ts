import { describe, expect, it } from 'vitest';
import { debtOverview } from './overview';

const loan = {
  id: 'loan',
  currency: 'EUR',
  balanceCents: -10_000,
  interestRateBp: 1200,
  installmentCents: 6000,
  monthlyFeeCents: 0,
  originalAmountCents: 20_000,
};

describe('stored debt overview', () => {
  it('shows the remaining interest, month-end date and principal progress immediately', () => {
    // 100 + 41 cents interest; the second payment is 4,141 cents.
    expect(debtOverview([loan], '2026-10', 'loan', 0)).toMatchObject({
      payoffDate: '2026-11-30',
      interestCents: 141,
      interestSavedCents: 0,
      progress: { paidCents: 10_000, remainingCents: 10_000, originalCents: 20_000 },
    });
  });
  it('applies the extra once to the selected debt and includes cards in the final date', () => {
    const card = {
      ...loan,
      id: 'card',
      balanceCents: -3000,
      interestRateBp: 0,
      installmentCents: 1000,
    };
    const result = debtOverview([loan, card], '2026-10', 'loan', 5000);
    expect(result).toMatchObject({
      payoffDate: '2026-12-31',
      interestCents: 100,
      interestSavedCents: 41,
    });
    expect(result.rows[0]?.plan?.withExtra.payoffMonth).toBe('2026-10');
    expect(result.rows[1]?.plan?.withExtra.payoffMonth).toBe('2026-12');
  });
  it('never invents missing terms, progress or a complete payoff date', () => {
    const result = debtOverview(
      [loan, { ...loan, id: 'card', installmentCents: null, originalAmountCents: null }],
      '2026-10',
    );
    expect(result).toMatchObject({ payoffDate: null, interestCents: null, progress: null });
    expect(result.rows[1]?.status).toBe('missing_terms');
    expect(debtOverview([{ ...loan, monthlyFeeCents: null }], '2026-10').rows[0]?.status).toBe(
      'missing_terms',
    );
  });
  it('withholds invalid repayment, unsafe cents and mixed-currency totals', () => {
    expect(
      debtOverview([{ ...loan, interestRateBp: 100_001, installmentCents: 100_000 }], '2026-10')
        .rows[0]?.status,
    ).toBe('invalid_terms');
    expect(debtOverview([{ ...loan, balanceCents: -100.5 }], '2026-10')).toMatchObject({
      progress: null,
      rows: [{ status: 'invalid_terms' }],
    });
    expect(debtOverview([{ ...loan, installmentCents: 100 }], '2026-10').rows[0]?.status).toBe(
      'invalid_terms',
    );
    expect(
      debtOverview([{ ...loan, balanceCents: -Number.MAX_SAFE_INTEGER }], '2026-10').rows[0]
        ?.status,
    ).toBe('invalid_terms');
    expect(
      debtOverview([loan, { ...loan, id: 'card', currency: 'USD' }], '2026-10').interestCents,
    ).toBeNull();
    expect(() => debtOverview([loan], '2026-10', 'loan', -1)).toThrow(RangeError);
    expect(debtOverview([{ ...loan, originalAmountCents: 9000 }], '2026-10').progress).toBeNull();
  });
});
