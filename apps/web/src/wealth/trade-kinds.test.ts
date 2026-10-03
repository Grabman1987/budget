import { describe, expect, it } from 'vitest';
import { tradeDraft, validateTrade, type TradeDraft } from './trade-draft';

const draft = (changes: Partial<TradeDraft>): TradeDraft => ({
  ...tradeDraft('2026-09-17', 'fund', 'depot'),
  amount: '100',
  units: '',
  ...changes,
});
describe('remaining manual trade kinds', () => {
  it.each([
    ['dividend', '', '100', '1', '27,50', 0, 7150],
    ['interest', '', '100', '1', '27,50', 0, 7150],
    ['fee', '', '5', '0', '0', 0, -500],
    ['tax', '', '7,50', '0', '0', 0, -750],
    ['delivery_in', '2,00000001', '100', '0', '0', 200000001, 0],
    ['delivery_out', '2,00000001', '100', '0', '0', -200000001, 0],
    ['split', '10', '0', '0', '0', 1000000000, 0],
    ['split', '+10', '0', '0', '0', 1000000000, 0],
    ['split', '-10', '0', '0', '0', -1000000000, 0],
  ] as const)(
    '%s gives literal units and cash',
    (kind, units, amount, fee, tax, unitsE8, settlement) => {
      expect(validateTrade(draft({ kind, units, amount, fee, tax }))).toMatchObject({
        errors: {},
        values: { kind, unitsE8 },
        settlement,
      });
    },
  );
  it('rejects zero split change and invalid separate costs explicitly', () => {
    expect(
      validateTrade(draft({ kind: 'split', units: '0', amount: '0' })).errors.units,
    ).toBeTruthy();
    expect(
      validateTrade(draft({ kind: 'delivery_in', units: '2', fee: '1' })).errors.form,
    ).toBeTruthy();
    expect(validateTrade(draft({ kind: 'tax', tax: '1' })).errors.form).toBeTruthy();
    expect(validateTrade(draft({ kind: 'split', units: '-1' })).errors.amount).toBeTruthy();
  });
});
