import { expect, it } from 'vitest';
import { investableAmount, type InvestableAmountInput } from './investable-amount';

const base: InvestableAmountInput = {
  accounts: [{ balanceCents: 102_459 }],
  payday: '2026-10-15',
  openOutflows: [
    { day: '2026-09-30', cents: 500 },
    { day: '2026-10-15', cents: 1000 },
    { day: '2026-11-14', cents: 2300 },
    { day: '2026-11-15', cents: 9000 },
  ],
  reserves: {
    futureEnvelopeAvailableCents: [3000, -800],
    reserveAccounts: [],
    emergency: { averageNeedCents: 1000, targetMonths: 6 },
  },
  needWantEnvelopeAvailableCents: [544, -321, 856],
};

it('includes overdue, payday and the 30th day after payday when payday is tomorrow', () => {
  expect(investableAmount(base)).toEqual({
    payday: '2026-10-15',
    through: '2026-11-14',
    cashCents: 102_459,
    obligationsCents: 3800,
    committedReservesCents: 9000,
    needWantAvailableCents: 1400,
    rawCents: 88_259,
    investableCents: 88_259,
  });
});

it('floors the headline while keeping the signed arithmetic', () => {
  expect(investableAmount({ ...base, accounts: [{ balanceCents: 201 }] })).toMatchObject({
    rawCents: -13_999,
    investableCents: 0,
  });
});

it('nets overlapping reserves and deducts only reserves still charged to cash', () => {
  const reserves = {
    ...base.reserves,
    reserveAccounts: [
      { balanceCents: 5000, onBudget: false, inCash: false },
      { balanceCents: 2800, onBudget: true, inCash: true },
    ],
  };
  expect(investableAmount({ ...base, reserves }).committedReservesCents).toBe(4000);
  reserves.reserveAccounts[1]!.inCash = false;
  expect(investableAmount({ ...base, reserves }).committedReservesCents).toBe(1200);
});

it.each([1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid cents (%s)', (value) => {
  expect(() => investableAmount({ ...base, accounts: [{ balanceCents: value }] })).toThrow(
    RangeError,
  );
  expect(() => investableAmount({ ...base, needWantEnvelopeAvailableCents: [value] })).toThrow(
    RangeError,
  );
  expect(() =>
    investableAmount({ ...base, openOutflows: [{ day: '2027-01-01', cents: value }] }),
  ).toThrow(RangeError);
});
