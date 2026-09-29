import { describe, expect, it } from 'vitest';
import { LIMIT, TODAY, paceModel } from './pace-model';

describe('paceModel (sample data ported from the prototype, all values in cents)', () => {
  const m = paceModel();

  it('plan reaches the limit at month end', () => {
    expect(Math.round(m.plan(30))).toBe(LIMIT);
    expect(m.plan(0)).toBe(0);
  });

  it('plan is monotonic and jumps on fixed-cost days', () => {
    for (let d = 1; d <= 30; d++) expect(m.plan(d)).toBeGreaterThanOrEqual(m.plan(d - 1));
    expect(m.plan(1) - m.plan(0)).toBeGreaterThan(89000);
  });

  it('actual is cumulative up to today', () => {
    for (let d = 1; d <= TODAY; d++) expect(m.actual(d)).toBeGreaterThanOrEqual(m.actual(d - 1));
    // fixed costs due by day 17 (136.200) + variable spending so far (69.034)
    expect(m.actual(TODAY)).toBe(205234);
  });

  it('forecast starts at today and ends above actual', () => {
    expect(m.forecastEnd).toBeGreaterThan(m.actual(TODAY));
    expect(Number.isInteger(m.forecastEnd)).toBe(true);
  });

  it('exposes integer cents at the reporting points', () => {
    expect(Number.isInteger(m.actual(TODAY))).toBe(true);
    expect(Number.isInteger(m.plan(TODAY))).toBe(true);
    expect(Number.isInteger(m.previous(TODAY))).toBe(true);
  });
});
