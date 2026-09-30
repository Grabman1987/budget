import { describe, expect, it } from 'vitest';
import { percentToBp } from './account-form';
import { lowPointIndex, monthTicks } from './balance-chart';
import { dayHeading, eur, eurWhole, longDay, monthStartLabel, shortDay } from './format';
import { errorText } from './labels';
import { ApiError } from '../api/http';

const series = (values: number[], start = '2026-08-30') =>
  values.map((balanceCents, i) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), balanceCents };
  });

describe('format', () => {
  it('formats money the de-AT way with the real minus', () => {
    expect(eur(-123456)).toBe('−1.234,56 €');
    expect(eurWhole(150_000, true)).toBe('+1.500 €');
  });
  it('formats days', () => {
    expect(shortDay('2026-09-17')).toBe('17.09.');
    expect(longDay('2026-09-17')).toBe('17.09.2026');
    expect(dayHeading('2026-09-17')).toBe('Do 17.09.');
    expect(monthStartLabel('2026-03-01')).toBe('1. März');
  });
});

describe('balance chart helpers', () => {
  it('finds month starts inside the window, not the first point', () => {
    expect(monthTicks(series([1, 2, 3, 4], '2026-08-30')).map((t) => t.day)).toEqual([
      '2026-09-01',
    ]);
    expect(monthTicks(series([1, 2], '2026-09-01'))).toEqual([]);
  });
  it('marks the low only for a real dip', () => {
    expect(lowPointIndex(series([5, 1, 4]))).toBe(1);
    expect(lowPointIndex(series([1, 2, 3]))).toBe(-1);
    expect(lowPointIndex(series([3, 2, 1]))).toBe(-1);
    expect(lowPointIndex(series([1, 2]))).toBe(-1);
  });
});

describe('account form helpers', () => {
  it('converts percent to basis points', () => {
    expect(percentToBp('3,5')).toBe(350);
    expect(percentToBp('6.32')).toBe(632);
    expect(percentToBp(' ')).toBeNull();
    expect(percentToBp('abc')).toBeNaN();
  });
});

describe('errorText', () => {
  it('prefers the server message, names a lost connection, else the fallback', () => {
    expect(errorText(new ApiError(422, 'invariant', 'Summe stimmt nicht'))).toBe(
      'Summe stimmt nicht',
    );
    expect(errorText(new ApiError(0, 'network'))).toBe('Keine Verbindung zum Server.');
    expect(errorText(new Error('x'), 'Fehlgeschlagen')).toBe('Fehlgeschlagen');
  });
});
