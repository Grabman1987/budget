import type { TradeConfirmationIntake } from '@budget/domain';
import { describe, expect, it } from 'vitest';
import { applyTradePrefill, tradeDraft, validateTrade } from './trade-draft';

// Synthetic data only.
const intake = (
  proposal: Partial<TradeConfirmationIntake['proposal']> = {},
  securityId: string | null = 'security',
): TradeConfirmationIntake => ({
  proposal: {
    reference: 'wpa:1a2b-3c4d',
    source: 'sell',
    kind: 'sell',
    instrument: { name: 'Synthetic Index Fund (Acc)', isin: 'IE00SYNTH008' },
    date: '2026-11-09',
    unitsE8: 200_000_000,
    amountCents: 50_000,
    feeCents: 100,
    taxCents: 1250,
    currency: 'EUR',
    settlementHint: '1234',
    open: [],
    unchecked: false,
    ...proposal,
  },
  securityId,
  importKey: 'wpa:1a2b-3c4d',
  duplicate: null,
  probableDuplicate: null,
});
const base = () => tradeDraft('2026-11-12', '', 'depot');
const EUR = { id: 'depot', currency: 'EUR' };

describe('trade form prefill from a broker trade confirmation (#1099)', () => {
  it('fills a verified sale so that it validates to the printed figures', () => {
    const { draft, open } = applyTradePrefill(base(), intake(), [EUR]);
    expect(open).toEqual([]);
    expect(validateTrade(draft).values).toEqual({
      accountId: 'depot',
      securityId: 'security',
      date: '2026-11-09',
      kind: 'sell',
      unitsE8: -200_000_000,
      amountCents: 50_000,
      feeCents: 100,
      taxCents: 1250,
      note: null,
    });
    // Net cash of the sale: 500,00 − 1,00 − 12,50.
    expect(validateTrade(draft).settlement).toBe(48_650);
  });

  it('chooses no account when several depots take the document currency', () => {
    const { draft, open } = applyTradePrefill(base(), intake(), [
      EUR,
      { id: 'second', currency: 'EUR' },
    ]);
    expect(draft.accountId).toBe('');
    expect(open).toEqual(['Anlagekonto']);
    expect(draft.amount).toBe('500,00');
  });

  it('leaves the money empty when no depot is in the document currency', () => {
    const { draft, open } = applyTradePrefill(base(), intake({ currency: 'USD' }), [EUR]);
    expect([draft.accountId, draft.amount, draft.fee, draft.tax]).toEqual(['', '', '', '']);
    expect(open).toEqual([
      'Anlagekonto',
      'Bruttobetrag (Währung der Abrechnung passt zu keinem Anlagekonto)',
      'Gebühren (Währung der Abrechnung passt zu keinem Anlagekonto)',
      'Einbehaltene Steuer (Währung der Abrechnung passt zu keinem Anlagekonto)',
    ]);
    expect(draft.units).toBe('2');
  });

  it('empties and names every unread field instead of keeping a default', () => {
    const { draft, open } = applyTradePrefill(
      base(),
      intake(
        {
          kind: null,
          instrument: null,
          date: null,
          unitsE8: null,
          amountCents: null,
          feeCents: null,
          taxCents: null,
        },
        null,
      ),
      [EUR],
    );
    expect(draft).toMatchObject({
      securityId: '',
      date: '',
      units: '',
      amount: '',
      fee: '',
      tax: '',
    });
    expect(open).toEqual([
      'Handelsart (steht auf Kauf, bitte prüfen)',
      'Instrument',
      'Handelsdatum',
      'Stück',
      'Bruttobetrag',
      'Gebühren',
      'Einbehaltene Steuer',
    ]);
    expect(validateTrade(draft).values).toBeUndefined();
  });

  it('keeps account and instrument of a savings plan execution', () => {
    const planned = { ...base(), securityId: 'plan-security' };
    const { draft, open } = applyTradePrefill(
      planned,
      intake({ source: 'savings_plan', kind: 'buy', taxCents: 0 }, null),
      [EUR],
      true,
    );
    expect(open).toEqual([]);
    expect(draft).toMatchObject({ accountId: 'depot', securityId: 'plan-security', kind: 'buy' });
  });
});
