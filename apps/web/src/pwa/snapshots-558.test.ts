import { afterEach, expect, it, vi } from 'vitest';
import { snapshotRequest } from './snapshots';

afterEach(() => vi.useRealTimers());

it('persists only the four approved primary response keys', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-17T12:00:00+02:00'));
  expect(snapshotRequest('/api/heute?period=payday&month=2026-09')?.kind).toBe('heute');
  expect(snapshotRequest('/api/accounts')?.kind).toBe('accounts');
  expect(snapshotRequest('/api/budget/2026-09')?.kind).toBe('plan');
  expect(snapshotRequest('/api/bookings?to=2026-09-17&limit=50')?.kind).toBe('bookings');
  for (const path of [
    '/api/auth/status',
    '/api/lookups',
    '/api/budget/2026-08',
    '/api/bookings?to=2026-09-16&limit=50',
    '/api/bookings?accountId=a&to=2026-09-17&limit=50',
    '/api/bookings?to=2026-09-17&cursor=older&limit=50',
  ])
    expect(snapshotRequest(path)).toBeNull();
});
