import { expect, it } from 'vitest';
import type { SavingsPlanRecord, TradeRow } from '@budget/db';
import { planPurchases, savingsMonthStrip } from './savings-model';

const plan = (patch: Partial<SavingsPlanRecord> = {}): SavingsPlanRecord => ({
  id: 'plan', securityId: 'fund', accountId: 'depot', sourceAccountId: 'cash',
  amountCents: 10000, dayOfMonth: 15, validFrom: '2026-01-01', validTo: null,
  note: null, deletedAt: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  ...patch,
});
const buy = (patch: Partial<TradeRow> = {}): TradeRow => ({
  id: 'linked', securityId: 'fund', accountId: 'depot', kind: 'buy', date: '2026-08-02',
  unitsE8: 700_000_000, amountCents: 7000, feeCents: 0, taxCents: 0, bookingId: null,
  importKey: null, note: null, savingsPlanId: 'plan', savingsMonth: '2026-07',
  deletedAt: null, createdAt: '2026-08-02T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z',
  ...patch,
});

it('keeps twelve exact months, explicit assignments, missing executions and extra manual buys distinct', () => {
  const rows = [plan()];
  const trades = [buy(), buy({ id: 'manual', date: '2026-07-25', savingsPlanId: null, savingsMonth: null, amountCents: 2500 })];
  const slots = savingsMonthStrip(rows, trades, '2026-09-10');
  expect(slots.map((slot) => slot.month)).toEqual([
    '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
    '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
  ]);
  expect(slots[0]).toMatchObject({ status: 'not_planned', amountCents: null });
  expect(slots[9]).toMatchObject({
    status: 'executed', plannedCents: 10000, amountCents: 7000, unitsE8: 700_000_000,
    tradeDate: '2026-08-02', plannedDate: '2026-07-15',
  });
  expect(slots[10]).toMatchObject({ status: 'missing_link', plannedCents: 10000, amountCents: null, unitsE8: null });
  expect(slots[11]).toMatchObject({ status: 'open', plannedDate: '2026-09-15', amountCents: null });
  // The extra manual buy remains in the existing gross purchases total; it is not an execution.
  expect(planPurchases(rows, trades, '2026-09-10').totalCents).toBe(9500);
});

it('requires matching plan, instrument, account and explicit month rather than approximate recognition', () => {
  const rows = [plan()];
  for (const trade of [
    buy({ accountId: 'other' }), buy({ securityId: 'other' }),
    buy({ deletedAt: '2026-09-01T00:00:00Z' }), buy({ date: '2026-09-11' }),
    buy({ savingsPlanId: null, savingsMonth: null }),
  ]) {
    expect(savingsMonthStrip(rows, [trade], '2026-09-10')[9]).toMatchObject({
      status: 'missing_link', amountCents: null,
    });
  }
  expect(savingsMonthStrip(rows, [buy({ savingsPlanId: 'wrong-version' })], '2026-09-10')[9]?.status).toBe('ambiguous');
  expect(savingsMonthStrip(rows, [buy(), buy({ id: 'second' })], '2026-09-10')[9]?.status).toBe('ambiguous');
});

it('uses the version effective on the planned date including month-end clamping', () => {
  const rows = [
    plan({ id: 'old', validTo: '2026-07-31', dayOfMonth: 31 }),
    plan({ id: 'new', validFrom: '2026-08-01', amountCents: 20000, dayOfMonth: 31 }),
  ];
  const slots = savingsMonthStrip(rows, [buy({ savingsPlanId: 'old' })], '2026-09-10');
  expect(slots[4]).toMatchObject({ month: '2026-02', plannedDate: '2026-02-28', plannedCents: 10000 });
  expect(slots[9]).toMatchObject({ status: 'executed', plannedDate: '2026-07-31', plannedCents: 10000, amountCents: 7000 });
  expect(slots[10]).toMatchObject({ status: 'missing_link', plannedDate: '2026-08-31', plannedCents: 20000 });
  expect(slots[11]).toMatchObject({ status: 'open', plannedDate: '2026-09-30', plannedCents: 20000 });
});

it('does not turn overlapping or unsafe assignments into an executed amount', () => {
  expect(savingsMonthStrip([plan({ amountCents: Number.MAX_SAFE_INTEGER + 1 })], [], '2026-09-10')[9]).toMatchObject({ status: 'ambiguous', plannedCents: null });
  expect(savingsMonthStrip([plan(), plan({ id: 'overlap' })], [buy()], '2026-09-10')[9]?.status).toBe('ambiguous');
  expect(savingsMonthStrip([plan()], [buy({ amountCents: Number.MAX_SAFE_INTEGER + 1 })], '2026-09-10')[9]).toMatchObject({ status: 'ambiguous', amountCents: null });
  expect(savingsMonthStrip([plan()], [buy({ unitsE8: 0 })], '2026-09-10')[9]?.status).toBe('ambiguous');
});
