import { describe, expect, it } from 'vitest';
import { sourceInteger } from './read-source';
describe('source decimal precision', () => {
  it('uses exact integer cents and e8 without float rounding', () => {
    expect(sourceInteger('12.34', 2)).toBe(1234);
    expect(sourceInteger('-0.01', 2)).toBe(-1);
    expect(sourceInteger('0.00000003', 8)).toBe(3);
    expect(sourceInteger('1.230000', 2)).toBe(123);
    expect(sourceInteger('90071992547409.91', 2)).toBe(Number.MAX_SAFE_INTEGER);
  });
  it.each(['1.001', '90071992547409.92', '1e2', 'NaN', '1,00', ''])(
    'rejects unsupported money %s',
    (value) => {
      expect(sourceInteger(value, 2)).toBeNull();
    },
  );
});
