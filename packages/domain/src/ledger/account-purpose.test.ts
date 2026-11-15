import { describe, expect, it } from 'vitest';
import { ACCOUNT_PURPOSES, accountPurpose, purposeHasOverdraft } from './account-purpose';

describe('account purpose', () => {
  it.each([
    ['cash', 'budget', 'cash'],
    ['checking', 'budget', 'other'],
    ['savings', 'reserve', 'investment'],
    ['p2p', 'investment', 'investment'],
    ['brokerage', 'investment', 'investment'],
    ['crypto', 'investment', 'investment'],
    ['other_asset', 'investment', 'investment'],
    ['credit_card', 'budget', 'other'],
    ['loan', 'debt', 'other'],
  ] as const)('maps legacy %s/%s to %s', (type, role, expected) => {
    expect(accountPurpose({ type, role })).toBe(expected);
  });

  it('uses configured salary and referenced settlement accounts without retyping them', () => {
    expect(accountPurpose({ type: 'checking' }, { salary: true })).toBe('salary');
    expect(accountPurpose({ type: 'checking' }, { settlement: true })).toBe('settlement');
    expect(accountPurpose({ type: 'savings', purpose: 'other' }, { salary: true })).toBe('other');
  });

  it.each(ACCOUNT_PURPOSES)(
    'allows overdraft for %s except cash, retaining card and loan terms',
    (purpose) => {
      for (const type of ['checking', 'cash', 'savings', 'p2p', 'other_asset'])
        expect(purposeHasOverdraft(type, purpose)).toBe(purpose !== 'cash');
      expect(purposeHasOverdraft('credit_card', purpose)).toBe(false);
      expect(purposeHasOverdraft('loan', purpose)).toBe(false);
    },
  );
});
