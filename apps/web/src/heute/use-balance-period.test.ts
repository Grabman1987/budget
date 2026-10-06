import { describe, expect, it } from 'vitest';
import { effectivePeriod } from './use-balance-period';

describe('effectivePeriod', () => {
  it('falls back to month outside the current month, whatever was chosen or stored', () => {
    expect(effectivePeriod('2026-08', '2026-09', 'payday', false)).toBe('month');
    expect(effectivePeriod('2026-10', '2026-09', undefined, false)).toBe('month');
  });
  it('uses the choice, then the stored flag, then payday in the current month', () => {
    expect(effectivePeriod('2026-09', '2026-09', 'month', false)).toBe('month');
    expect(effectivePeriod('2026-09', '2026-09', 'payday', true)).toBe('payday');
    expect(effectivePeriod('2026-09', '2026-09', undefined, true)).toBe('month');
    expect(effectivePeriod('2026-09', '2026-09', undefined, false)).toBe('payday');
  });
});
