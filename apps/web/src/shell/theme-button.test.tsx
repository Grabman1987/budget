// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { setTheme, THEME_STORAGE_KEY } from '@budget/ui';
import { ThemeButton } from './theme-button';

afterEach(() => {
  cleanup();
  setTheme('system');
  vi.unstubAllGlobals();
});

it.each([false, true])('announces and persists the toggle state (system dark=%s)', (dark) => {
  vi.stubGlobal('matchMedia', () => ({
    matches: dark,
    addEventListener() {},
    removeEventListener() {},
  }));
  render(<ThemeButton variant="icon" />);
  const toggle = screen.getByRole('button', { name: 'Hell/Dunkel umschalten' });
  expect(toggle.getAttribute('aria-pressed')).toBe(String(dark));
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-pressed')).toBe(String(!dark));
  expect(document.documentElement.dataset['theme']).toBe(dark ? 'light' : 'dark');
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(dark ? 'light' : 'dark');
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-pressed')).toBe(String(dark));
});
