import { useSyncExternalStore } from 'react';

/** matchMedia is missing in some environments (jsdom): treat those as "no match". */
const listFor = (query: string) =>
  typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;

/** Subscribe to a CSS media query. Server/first render assumes `false`. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = listFor(query);
      if (!list) return () => {};
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => listFor(query)?.matches ?? false,
    () => false,
  );
}

/** Phone layout breakpoint (DESIGN.md: below 768 px). */
export const useIsPhone = () => useMediaQuery('(max-width: 767px)');

/** System colour scheme is dark (`prefers-color-scheme`). */
export const usePrefersDark = () => useMediaQuery('(prefers-color-scheme: dark)');
