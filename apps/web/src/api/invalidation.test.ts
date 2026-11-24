import { describe, expect, it } from 'vitest';
import { invalidationPredicate } from './invalidation';

const key = (...queryKey: unknown[]) => ({ queryKey });

describe('invalidationPredicate', () => {
  it('invalidates every family for unknown writes and session changes', () => {
    expect(invalidationPredicate()).toBeUndefined();
    expect(invalidationPredicate('/api/auth/login/verify')).toBeUndefined();
    expect(invalidationPredicate('/api/auth/logout')).toBeUndefined();
  });

  it('keeps ledger writes away from sessions and display settings only', () => {
    for (const path of ['/api/bookings', '/api/accounts/x', '/api/budget/2026-11/assign']) {
      const stale = invalidationPredicate(path)!;
      for (const root of ['ledger', 'budget', 'goals', 'expected', 'rules', 'categories'])
        expect(stale(key(root, 'x'))).toBe(true);
      expect(stale(key('auth', 'status'))).toBe(false);
      expect(stale(key('display-settings'))).toBe(false);
    }
  });

  it('narrows step-up, passkey and display-setting writes', () => {
    expect(invalidationPredicate('/api/auth/step-up/verify')!(key('ledger', 'heute'))).toBe(false);
    expect(invalidationPredicate('/api/auth/passkeys/1')!(key('auth', 'passkeys'))).toBe(true);
    expect(invalidationPredicate('/api/display-settings')!(key('budget', '2026-11'))).toBe(false);
  });

  it('lets a profile write reach the data families that read the profile', () => {
    const stale = invalidationPredicate('/api/profile')!;
    expect(stale(key('profile'))).toBe(true);
    expect(stale(key('ledger', 'heute', '2026-11', 'month'))).toBe(true);
    expect(stale(key('auth', 'status'))).toBe(false);
  });
});
