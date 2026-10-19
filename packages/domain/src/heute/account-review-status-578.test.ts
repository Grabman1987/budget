import { describe, expect, it } from 'vitest';
import { accountReviewPolicy, reviewStatus, type ReviewAccount } from './account-review-status';

const account: ReviewAccount = {
  type: 'checking',
  onBudget: true,
  openingDate: '2023-10-01',
  closedAt: null,
  bookingCount: 1,
};

describe('owner account review deadlines (#578)', () => {
  it.each([
    ['checking', true, '14-days'],
    ['cash', true, '14-days'],
    ['savings', true, '14-days'],
    ['checking', false, 'calendar-month'],
    ['cash', false, 'calendar-month'],
    ['savings', false, 'calendar-month'],
    ['credit_card', true, '14-days'],
    ['credit_card', false, '14-days'],
    ['loan', false, 'calendar-month'],
    ['other_liability', true, 'calendar-month'],
    ['brokerage', false, 'calendar-month'],
    ['crypto', false, 'calendar-month'],
    ['p2p', false, 'calendar-month'],
    ['other_asset', true, 'calendar-month'],
    ['receivable', false, 'unsupported'],
  ] as const)('uses the existing group for %s/onBudget=%s', (type, onBudget, expected) => {
    expect(accountReviewPolicy({ type, onBudget })).toBe(expected);
  });

  it.each(['checking', 'cash', 'savings', 'credit_card'])('uses inclusive day14 for %s', (type) => {
    const a = { ...account, type };
    expect(reviewStatus(a, '2026-09-01', '2026-09-02', '2026-09-14', false).state).toBe(
      'unreviewed',
    );
    expect(reviewStatus(a, '2026-09-01', '2026-09-02', '2026-09-15', false)).toMatchObject({
      state: 'due',
      dueOn: '2026-09-15',
      days: 14,
      action: 'reconcile',
    });
    expect(reviewStatus(a, '2026-09-01', '2026-09-02', '2026-09-16', false).state).toBe('due');
  });

  it.each([
    ['2026-01-31', '2026-02-27', '2026-02-28'],
    ['2024-01-31', '2024-02-28', '2024-02-29'],
    ['2026-03-31', '2026-04-29', '2026-04-30'],
    ['2026-12-31', '2027-01-30', '2027-01-31'],
  ])('clamps one calendar month after %s', (checked, before, due) => {
    for (const type of ['loan', 'other_liability', 'brokerage', 'crypto', 'p2p', 'other_asset']) {
      const a = { ...account, type, onBudget: false };
      expect(reviewStatus(a, checked!, checked!, before!, true).state).toBe('unreviewed');
      expect(reviewStatus(a, checked!, checked!, due!, true)).toMatchObject({
        state: 'due',
        dueOn: due,
      });
    }
  });

  it('keeps an actually checked quiet account checked months later, but never invents an initial check', () => {
    expect(reviewStatus(account, '2026-01-31', '2026-01-20', '2026-10-19', false).state).toBe(
      'checked',
    );
    expect(reviewStatus(account, null, '2026-01-20', '2026-10-19', false).state).toBe('due');
    expect(
      reviewStatus(
        { ...account, openingDate: '2026-10-10' },
        null,
        '2026-10-11',
        '2026-10-19',
        false,
      ).state,
    ).toBe('unreviewed');
  });

  it('uses later activity evidence for new same-day/backdated records and date evidence for a maturing future record', () => {
    expect(reviewStatus(account, '2026-09-01', '2026-09-01', '2026-09-15', false).state).toBe(
      'checked',
    );
    expect(reviewStatus(account, '2026-09-01', '2026-08-20', '2026-09-15', true).state).toBe('due');
    expect(reviewStatus(account, '2026-09-01', '2026-09-01', '2026-09-15', true).state).toBe('due');
    expect(reviewStatus(account, '2026-09-01', '2026-10-01', '2026-09-15', false).state).toBe(
      'checked',
    );
    expect(reviewStatus(account, '2026-09-01', '2026-10-01', '2026-10-01', false).state).toBe(
      'due',
    );
    // Performed on a later day for an earlier statement: later booked dates remain outside it.
    expect(reviewStatus(account, '2026-09-01', '2026-09-05', '2026-09-15', false).state).toBe(
      'due',
    );
  });

  it('excludes closed/future/empty accounts and retains manual-value and unsupported distinctions', () => {
    for (const a of [
      { ...account, closedAt: '2026-09-10' },
      { ...account, openingDate: '2027-01-01' },
      { ...account, bookingCount: 0 },
    ])
      expect(reviewStatus(a, null, null, '2026-10-19', true).state).toBe('inactive');
    expect(
      reviewStatus({ ...account, bookingCount: 0 }, '2026-01-01', null, '2026-10-19', false).state,
    ).toBe('checked');
    expect(
      reviewStatus({ ...account, type: 'p2p' }, '2026-01-31', '2026-02-01', '2026-02-28', false)
        .action,
    ).toBe('value');
    expect(
      reviewStatus({ ...account, type: 'receivable' }, null, '2026-01-01', '2026-10-19', false),
    ).toMatchObject({ state: 'unsupported', supported: false, action: null, dueOn: null });
  });
});
