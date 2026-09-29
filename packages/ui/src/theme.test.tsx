// @vitest-environment jsdom
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrefersDark } from './components/use-media-query';
import { THEME_STORAGE_KEY, initTheme, setTheme, useTheme } from './theme';

const root = document.documentElement;

beforeEach(() => {
  root.removeAttribute('data-theme');
  localStorage.clear();
});

describe('theme preference', () => {
  it('starts as "system" without an override', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('forces light or dark via data-theme and remembers it', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current[1]('dark'));
    expect(result.current[0]).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    act(() => result.current[1]('light'));
    expect(result.current[0]).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('"system" clears the override and the stored value so prefers-color-scheme decides', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current[1]('dark'));
    act(() => result.current[1]('system'));
    expect(result.current[0]).toBe('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('every hook instance follows a change made elsewhere', () => {
    const a = renderHook(() => useTheme());
    const b = renderHook(() => useTheme());
    act(() => setTheme('dark'));
    expect(a.result.current[0]).toBe('dark');
    expect(b.result.current[0]).toBe('dark');
  });

  it('initTheme restores a stored override and ignores anything else', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(initTheme()).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    root.removeAttribute('data-theme');
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(initTheme()).toBe('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('still applies the theme when storage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setTheme('dark')).not.toThrow();
    expect(root.getAttribute('data-theme')).toBe('dark');
    spy.mockRestore();
  });
});

describe('usePrefersDark', () => {
  type Listener = () => void;
  let dark = false;
  const listeners = new Set<Listener>();

  beforeEach(() => {
    dark = false;
    listeners.clear();
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return query === '(prefers-color-scheme: dark)' && dark;
      },
      media: query,
      addEventListener: (_: string, l: Listener) => listeners.add(l),
      removeEventListener: (_: string, l: Listener) => listeners.delete(l),
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  function Probe() {
    return <p>{usePrefersDark() ? 'dunkel' : 'hell'}</p>;
  }

  it('follows the system colour scheme and unsubscribes on unmount', () => {
    const { unmount } = render(<Probe />);
    expect(screen.getByText('hell')).toBeTruthy();
    act(() => {
      dark = true;
      listeners.forEach((l) => l());
    });
    expect(screen.getByText('dunkel')).toBeTruthy();
    unmount();
    expect(listeners.size).toBe(0);
  });
});
