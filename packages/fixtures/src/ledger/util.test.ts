import { describe, expect, it } from 'vitest';
import { allocate, hash, isoDate, lastDayOfMonth, seeded, slug } from './util';

describe('fixture utilities', () => {
  it('allocate splits an integer total exactly by weights', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(1000, [0.792, 0.15, 0.05, 0.005, 0.003, 0])).toEqual([792, 150, 50, 5, 3, 0]);
    for (const total of [0, 1, 7, 99999]) {
      expect(allocate(total, [0.792, 0.15, 0.05, 0.005, 0.003]).reduce((a, b) => a + b, 0)).toBe(
        total,
      );
    }
    expect(allocate(5, [0, 0])).toEqual([0, 0]);
  });

  it('seeded streams are deterministic and differ by seed', () => {
    const a = seeded(hash('x'));
    const b = seeded(hash('x'));
    const c = seeded(hash('y'));
    const xs = [a(), a(), a()];
    expect(xs).toEqual([b(), b(), b()]);
    expect(xs).not.toEqual([c(), c(), c()]);
    expect(xs.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('dates clamp to the month length', () => {
    expect(lastDayOfMonth(2024, 1)).toBe(29);
    expect(isoDate(2025, 1, 30)).toBe('2025-02-28');
    expect(isoDate(2026, 8, 5)).toBe('2026-09-05');
  });

  it('slug removes umlauts and punctuation', () => {
    expect(slug('Bäckerei')).toBe('baeckerei');
    expect(slug('Depot · ETF')).toBe('depot-etf');
  });
});
