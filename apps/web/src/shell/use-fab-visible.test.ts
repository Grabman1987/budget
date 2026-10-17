// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let pathname = '/';
vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname } }),
}));
const { useFabVisible } = await import('./use-fab-visible');

beforeEach(() => {
  pathname = '/';
  vi.stubGlobal('innerHeight', 800);
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: 3000,
  });
});
afterEach(() => vi.unstubAllGlobals());

const scroll = (y: number) =>
  act(() => {
    vi.stubGlobal('scrollY', y);
    window.dispatchEvent(new Event('scroll'));
  });

it.each([false, true])(
  'hides after a deliberate scroll down, shows up, stable on bounce (reduce=%s)',
  (reduce) => {
    vi.stubGlobal('matchMedia', () => ({ matches: reduce }));
    vi.stubGlobal('scrollY', 0);
    const { result, unmount } = renderHook(() => useFabVisible());
    expect(result.current).toBe(true);
    scroll(30);
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

it('shows again at the page end and after a route change', () => {
  vi.stubGlobal('scrollY', 0);
  const { result, rerender } = renderHook(() => useFabVisible());
  scroll(1000);
  expect(result.current).toBe(false);
  scroll(2200);
  expect(result.current).toBe(true);
  scroll(1500);
  scroll(1800);
  expect(result.current).toBe(false);
  pathname = '/konten';
  rerender();
  expect(result.current).toBe(true);
});
