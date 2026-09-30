import { describe, expect, it } from 'vitest';
import { todayFromEnv } from './today';

describe('BUDGET_TODAY', () => {
  it('is off when unset or empty', () => {
    expect(todayFromEnv({})).toBeUndefined();
    expect(todayFromEnv({ BUDGET_TODAY: '' })).toBeUndefined();
  });

  it('pins the day outside production', () => {
    expect(todayFromEnv({ BUDGET_TODAY: '2026-09-17' })?.()).toBe('2026-09-17');
    expect(todayFromEnv({ BUDGET_TODAY: '2028-02-29', NODE_ENV: 'test' })?.()).toBe('2028-02-29');
  });

  it('accepts only real calendar days', () => {
    for (const bad of [
      '2026-02-30',
      '2027-02-29',
      '2026-13-01',
      '2026-00-10',
      '2026-9-17',
      'today',
      '17.09.2026',
    ])
      expect(() => todayFromEnv({ BUDGET_TODAY: bad }), bad).toThrow(/calendar day/);
  });

  it('refuses to start in production when it is set', () => {
    expect(() => todayFromEnv({ BUDGET_TODAY: '2026-09-17', NODE_ENV: 'production' })).toThrow(
      /production/,
    );
    expect(todayFromEnv({ NODE_ENV: 'production' })).toBeUndefined();
  });
});
