import { useCallback, useSyncExternalStore } from 'react';

/** `system` follows `prefers-color-scheme`; `light`/`dark` force the theme via `data-theme`. */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'budget-theme';

const listeners = new Set<() => void>();

function readStored(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch {
    // Storage can be blocked (private mode); fall back to the system theme.
  }
  return 'system';
}

/** Apply a preference to the document and remember it. */
export function setTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not persisted; still applied for this page view.
  }
  listeners.forEach((listener) => listener());
}

/** Restore the stored preference (also done before first paint by `public/theme-init.js`). */
export function initTheme(): ThemePreference {
  const preference = readStored();
  if (preference !== 'system') document.documentElement.setAttribute('data-theme', preference);
  return preference;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function currentPreference(): ThemePreference {
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' || attr === 'dark' ? attr : 'system';
}

export function useTheme(): [ThemePreference, (preference: ThemePreference) => void] {
  const preference = useSyncExternalStore(subscribe, currentPreference, () => 'system' as const);
  return [preference, useCallback((next: ThemePreference) => setTheme(next), [])];
}
