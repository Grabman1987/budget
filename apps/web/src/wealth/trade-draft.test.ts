import { describe, expect, it } from 'vitest';
import type { TradeRow } from './trade-api';
import { tradeDraft, validateTrade, type TradeDraft } from './trade-draft';
const buy = (): TradeDraft => ({
  ...tradeDraft('2026-01-02', 'security', 'account'),
  units: '10',
  amount: '1.000',
  fee: '10',
});
describe('manual source trade entry', () => {
  it.each([
    [-1, '0,00000001'],
    [-9007199254740991, '90071992,54740991'],
  ])('round-trips exact signed source units %s through edit prefill', (unitsE8, units) => {
    const source: TradeRow = {
      id: 'trade',
      accountId: 'account',
      securityId: 'security',
      date: '2026-01-03',
      kind: 'sell',
      unitsE8,
      amountCents: 60000,
      feeCents: 400,
      taxCents: 2000,
      note: null,
      bookingId: 'booking',
      importKey: null,
      savingsPlanId: null,
      savingsMonth: null,
      createdAt: '2026-01-03T00:00:00Z',
      updatedAt: '2026-01-03T00:00:00Z',
      deletedAt: null,
    };
    const draft = tradeDraft('', '', '', source);
    expect(draft.units).toBe(units);
    expect(validateTrade(draft).values).toMatchObject({
      unitsE8,
      amountCents: 60000,
      feeCents: 400,
      taxCents: 2000,
    });
  });
  it('parses literal source cents and signed units using shared settlement', () => {
    expect(validateTrade(buy())).toMatchObject({
      values: { unitsE8: 1000000000, amountCents: 100000, feeCents: 1000, taxCents: 0 },
      settlement: -101000,
    });
    expect(
      validateTrade({ ...buy(), kind: 'sell', units: '4', amount: '600', fee: '4', tax: '20' }),
    ).toMatchObject({
      values: { unitsE8: -400000000, amountCents: 60000, feeCents: 400, taxCents: 2000 },
      settlement: 57600,
    });
    expect(validateTrade({ ...buy(), units: '0,00000001' }).values?.unitsE8).toBe(1);
  });
  it.each(['0', '-1', '+1', '1,123456789', '9007199254740992', '1e2'])(
    'rejects unsigned/precision/overflow boundary %s',
    (units) => {
      expect(validateTrade({ ...buy(), units }).errors.units).toBeTruthy();
      expect(validateTrade({ ...buy(), units }).values).toBeUndefined();
    },
  );
  it('keeps tax validation and impossible dates explicit, without inventory or present-date policy', () => {
    expect(validateTrade({ ...buy(), tax: '20' }).errors.form).toBeTruthy();
    expect(
      validateTrade({ ...buy(), kind: 'sell', amount: '10', tax: '11' }).errors.form,
    ).toBeTruthy();
    expect(validateTrade({ ...buy(), date: '2026-02-30' }).errors.date).toBeTruthy();
    expect(validateTrade({ ...buy(), date: '2030-01-01', units: '500' }).values).toBeDefined();
  });
  it('rejects invalid/negative source money and missing identity without zero substitution', () => {
    expect(
      validateTrade({ ...buy(), accountId: '', securityId: '', amount: '', fee: '-1' }).errors,
    ).toMatchObject({
      accountId: expect.any(String),
      securityId: expect.any(String),
      amount: expect.any(String),
      fee: expect.any(String),
    });
    expect(
      validateTrade({ ...buy(), amount: '9007199254740991', fee: '10' }).values,
    ).toBeUndefined();
  });
});
