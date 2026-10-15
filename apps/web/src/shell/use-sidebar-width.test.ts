// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  clampSidebarWidth,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  useSidebarWidth,
} from './use-sidebar-width';

it('keeps sidebar widths within the supported range and rounds pointer values', () => {
  expect(clampSidebarWidth(120)).toBe(SIDEBAR_WIDTH_MIN);
  expect(clampSidebarWidth(236.4)).toBe(236);
  expect(clampSidebarWidth(400)).toBe(SIDEBAR_WIDTH_MAX);
});

it('uses the default width when the stored value is malformed', () => {
  localStorage.setItem('budget-sidebar-width', '9999');
  const bounded = renderHook(() => useSidebarWidth());
  expect(bounded.result.current[0]).toBe(SIDEBAR_WIDTH_MAX);
  bounded.unmount();
  localStorage.setItem('budget-sidebar-width', '236px');
  const fallback = renderHook(() => useSidebarWidth());
  expect(fallback.result.current[0]).toBe(SIDEBAR_WIDTH_DEFAULT);
});

it('uses the default width when storage is inaccessible', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked');
    },
  });
  const { result } = renderHook(() => useSidebarWidth());
  expect(result.current[0]).toBe(SIDEBAR_WIDTH_DEFAULT);
});

it('persists user-adjusted widths', () => {
  const { result } = renderHook(() => useSidebarWidth());
  act(() => result.current[1](312));
  expect(result.current[0]).toBe(312);
  expect(localStorage.getItem('budget-sidebar-width')).toBe('312');
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  vi.restoreAllMocks();
});
