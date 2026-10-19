import { describe, expect, it } from 'vitest';
import { assetsDebtsOf } from '../ledger/assets-debts';
import { debtOverview } from './overview';

// Loan: 100,00 at 12 % p. a., 60,00 a month. Interest 1,00 then 0,41 = 1,41; paid off in 11/2026.
const loan = {
  id: 'loan',
  currency: 'EUR',
  balanceCents: -10_000,
  interestRateBp: 1200,
  installmentCents: 6000,
  monthlyFeeCents: 0,
  originalAmountCents: 20_000,
};
// Card without any terms: settled on a running basis (owner decision 16.10.2026).
const card = {
  id: 'card',
  currency: 'EUR',
  balanceCents: -3000,
  interestRateBp: null,
  installmentCents: null,
  monthlyFeeCents: null,
  originalAmountCents: null,
  settledMonthly: true,
};

describe('credit cards in the debt overview', () => {
  it('shows a card without terms as settled on a running basis, not as missing terms', () => {
    const result = debtOverview([loan, card], '2026-10');
    expect(result.rows[1]).toMatchObject({ id: 'card', plan: null, status: 'settled_monthly' });
    expect(result.termsOpen).toBe(false);
    // The date and interest come from the loan alone; the card does not block them.
    expect(result.payoffDate).toBe('2026-11-30');
    expect(result.interestCents).toBe(141);
    expect(result.interestSavedCents).toBe(0);
  });

  it('keeps counting the card in the Restschuld: 100,00 + 30,00 = 130,00', () => {
    expect(debtOverview([loan, card], '2026-10').remainingCents).toBe(13_000);
    expect(debtOverview([card], '2026-10').remainingCents).toBe(3000);
  });

  it('Restschuld equals the debts of the net worth split (negative accounts), to the cent', () => {
    // Giro +50,00, loan -100,00, card -30,00, overdrawn giro -1,25: debts -131,25, net -81,25.
    const values = { giro: 5000, loan: -10_000, card: -3000, over: -125 };
    const meta = (id: string) => ({ id, name: id, type: id === 'giro' ? 'checking' : 'other' });
    const split = assetsDebtsOf(values, meta);
    expect(split.debtsCents).toBe(-13_125);
    expect(split.netCents).toBe(-8125);
    const overview = debtOverview(
      [loan, card, { ...card, id: 'over', balanceCents: -125 }],
      '2026-10',
    );
    expect(overview.remainingCents).toBe(13_125);
    expect(overview.remainingCents).toBe(-split.debtsCents);
  });

  it('a lone card without terms has no payoff date, no interest and no open terms', () => {
    expect(debtOverview([card], '2026-10')).toMatchObject({
      payoffDate: null,
      interestCents: null,
      termsOpen: false,
      rows: [{ status: 'settled_monthly', plan: null }],
    });
  });

  it('still models a card whose terms were entered', () => {
    // 30,00 at 0 %, 10,00 a month: October, November, December.
    const result = debtOverview(
      [{ ...card, interestRateBp: 0, installmentCents: 1000, monthlyFeeCents: 0 }],
      '2026-10',
    );
    expect(result.rows[0]?.status).toBe('ready');
    expect(result.payoffDate).toBe('2026-12-31');
    expect(result.interestCents).toBe(0);
  });

  it('a loan without terms still blocks the date and keeps terms open, next to a settled card', () => {
    const result = debtOverview([{ ...loan, installmentCents: null }, card], '2026-10');
    expect(result.rows.map((r) => r.status)).toEqual(['missing_terms', 'settled_monthly']);
    expect(result.termsOpen).toBe(true);
    expect(result.payoffDate).toBeNull();
    expect(result.interestCents).toBeNull();
  });

  it('an account not flagged as settled monthly keeps the old behaviour', () => {
    expect(debtOverview([{ ...card, settledMonthly: false }], '2026-10').rows[0]?.status).toBe(
      'missing_terms',
    );
  });

  it('does not add up cents of different currencies', () => {
    expect(debtOverview([loan, { ...card, currency: 'USD' }], '2026-10').remainingCents).toBeNull();
  });
});
