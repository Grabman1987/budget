import { describe, expect, it } from 'vitest';
import { eurParts } from './format';

describe('eurParts lead figure formatting', () => {
  it.each([
    [10_050, { whole: '100', fraction: '50' }],
    [10_099, { whole: '100', fraction: '99' }],
    [-10_099, { whole: '−100', fraction: '99' }],
    [99_950, { whole: '999', fraction: '50' }],
    [-99_950, { whole: '−999', fraction: '50' }],
    [123_456, { whole: '1.234', fraction: '56' }],
    [99_999, { whole: '999', fraction: '99' }],
    [100_000, { whole: '1.000', fraction: '00' }],
  ])('splits %i cents without rounding the euro part', (amount, expected) => {
    expect(eurParts(amount)).toEqual(expected);
  });
});
