import { describe, expect, it } from 'vitest';
import { accountReminder } from './account-reminders';

const account = {
  type: 'checking',
  closedAt: null,
  bookingCount: 1,
  openingDate: '2026-01-01',
  lastReconciledOn: '2026-08-13',
  lastValuedOn: null,
};

describe('account reminder', () => {
  it('starts at 35 days and respects a custom interval', () => {
    expect(accountReminder(account, '2026-09-16')).toBeNull();
    expect(accountReminder(account, '2026-09-17')).toEqual({ days: 35, action: 'reconcile' });
    expect(accountReminder(account, '2026-09-17', 36)).toBeNull();
    expect(accountReminder(account, '2026-09-17', 10)).toEqual({ days: 35, action: 'reconcile' });
  });

  it('counts never checked accounts from opening, ignoring closed and empty accounts', () => {
    expect(accountReminder({ ...account, lastReconciledOn: null }, '2026-09-17')).toEqual({
      days: 259,
      action: 'reconcile',
    });
    expect(accountReminder({ ...account, closedAt: '2026-09-01' }, '2026-09-17')).toBeNull();
    expect(accountReminder({ ...account, bookingCount: 0 }, '2026-09-17')).toBeNull();
    expect(accountReminder({ ...account, openingDate: '2026-09-18' }, '2026-09-17')).toBeNull();
  });

  it.each(['p2p', 'other_asset'])('uses the value date for %s', (type) => {
    expect(
      accountReminder({ ...account, type, lastValuedOn: '2026-09-17' }, '2026-09-17'),
    ).toBeNull();
    expect(
      accountReminder(
        { ...account, type, lastReconciledOn: '2026-09-17', lastValuedOn: '2026-08-13' },
        '2026-09-17',
      ),
    ).toEqual({ days: 35, action: 'value' });
    expect(
      accountReminder({ ...account, type, lastReconciledOn: '2026-09-17' }, '2026-09-17'),
    ).toEqual({ days: 259, action: 'value' });
  });
});
