// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { setPlanDensity, usePlanDensity } from './plan-density';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setPlanDensity('all');
  localStorage.clear();
});

it('keeps the density across remounts and persists it like the month preference', () => {
  const first = renderHook(usePlanDensity);
  act(() => setPlanDensity('compact'));
  expect(first.result.current).toBe('compact');
  expect(localStorage.getItem('budget.plan.density')).toBe('compact');
  first.unmount();
  expect(renderHook(usePlanDensity).result.current).toBe('compact');
});

it('accepts another tab and falls back for invalid or cleared storage', () => {
  const { result } = renderHook(usePlanDensity);
  for (const [stored, expected] of [
    ['minimal', 'minimal'],
    ['invalid', 'all'],
  ] as const) {
    act(() => {
      localStorage.setItem('budget.plan.density', stored);
      window.dispatchEvent(new StorageEvent('storage', { key: 'budget.plan.density' }));
    });
    expect(result.current).toBe(expected);
  }
  act(() => {
    setPlanDensity('minimal');
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
  });
  expect(result.current).toBe('all');
});

it('retains an in-memory choice when storage is unavailable', () => {
  const { result } = renderHook(usePlanDensity);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  act(() => setPlanDensity('minimal'));
  expect(result.current).toBe('minimal');
});
