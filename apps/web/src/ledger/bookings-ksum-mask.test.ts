import { afterEach, expect, it } from 'vitest';
import { setAmountsHidden } from '@budget/ui';
import { ksumEurText } from './bookings-page';

afterEach(() => setAmountsHidden(false));

it('masks the EUR sum of a non-EUR account when amounts are hidden', () => {
  setAmountsHidden(true);
  const text = ksumEurText(123456);
  expect(text).not.toMatch(/1\.234|123/);
  expect(text).toContain('•••');
  setAmountsHidden(false);
  expect(ksumEurText(123456)).toContain('1.234,56');
});
