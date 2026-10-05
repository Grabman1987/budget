import { expect, it } from 'vitest';
import { reconcileWholePicture, recordedPrincipal } from './reconciliation';
import { allocationBar } from '../ledger/alloc';
it('keeps a literal cent residual and does not erase negative savings', () => {
  expect(reconcileWholePicture(10000, 9999, -1234, 1100)).toEqual({
    deltaCents: -1,
    otherCents: 133,
  });
  expect(recordedPrincipal(10000, 1000)).toBe(9000);
  expect(recordedPrincipal(10000, -1000)).toBe(10000);
  expect(() => reconcileWholePicture(Number.MAX_SAFE_INTEGER, -10000, 0, 0)).toThrow(RangeError);
});
it('shows the 102% spending stack despite negative future assignment and a positive rest', () => {
  const bar = allocationBar({
    incomeCents: 100000,
    needCents: 68000,
    wantCents: 34000,
    futureCents: -42000,
    restCents: 40000,
  });
  expect(bar).toMatchObject({
    need: 68000,
    want: 34000,
    future: 0,
    rest: 0,
    scale: 102000,
    overflowCents: 2000,
    overflowBp: 200,
  });
});
