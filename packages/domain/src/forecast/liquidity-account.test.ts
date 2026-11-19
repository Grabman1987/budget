import { expect, it } from 'vitest';
import { isPaymentAccount } from './liquidity-account';

const account = {
  type: 'checking',
  onBudget: true,
  role: 'budget',
  closedAt: null,
  openingDate: '2026-01-01',
  currency: 'EUR',
};

it.each(['checking', 'cash', 'savings'])(
  'accepts an open EUR budget %s payment account',
  (type) => {
    expect(isPaymentAccount({ ...account, type }, '2026-10-10')).toBe(true);
  },
);

it.each([
  'credit_card',
  'loan',
  'brokerage',
  'crypto',
  'p2p',
  'receivable',
  'other_asset',
  'other_liability',
])('never treats %s as a payment account', (type) => {
  expect(isPaymentAccount({ ...account, type }, '2026-10-10')).toBe(false);
});

it.each([
  { role: 'reserve' },
  { onBudget: false },
  { closedAt: '2026-10-10' },
  { openingDate: '2026-10-11' },
  { currency: 'USD' },
])('rejects ineligible payment scope %j', (override) => {
  expect(isPaymentAccount({ ...account, ...override }, '2026-10-10')).toBe(false);
});
