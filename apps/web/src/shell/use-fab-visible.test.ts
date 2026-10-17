// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useFabVisible } from './use-fab-visible';

afterEach(() => vi.unstubAllGlobals());

it.each([false, true])(
  'hides down, shows up, and keeps stationary/bounce events stable (reduce=%s)',
  (reduce) => {
    vi.stubGlobal('matchMedia', () => ({ matches: reduce }));
    vi.stubGlobal('scrollY', 0);
    const { result, unmount } = renderHook(() => useFabVisible());
    const scroll = (y: number) =>
      act(() => {
        vi.stubGlobal('scrollY', y);
        window.dispatchEvent(new Event('scroll'));
      });
    expect(result.current).toBe(true);
    scroll(200);
    expect(result.current).toBe(false);
    scroll(200);
    expect(result.current).toBe(false);
    scroll(180);
    expect(result.current).toBe(true);
    scroll(0);
    scroll(-20);
    scroll(0);
    expect(result.current).toBe(true);
    unmount();
  },
);
