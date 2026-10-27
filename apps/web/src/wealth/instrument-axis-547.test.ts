import { expect, it } from 'vitest';
import { euroAxis } from './networth-model';

it('keeps a literal EUR2500 tick distinct and names the shared monetary unit', () => {
  const axis = euroAxis([0, 2500, 5000]);
  expect(axis.unit).toBe('Tsd. €');
  expect(axis.label(2500)).toBe('2,5');
  expect(axis.label(5000)).toBe('5');
  expect(euroAxis([0, 0.01, 0.02]).label(0.01)).toBe('0,01');
  expect(euroAxis([0, 0.01, 0.02]).unit).toBe('€');
});
