import { useSyncExternalStore } from 'react';

/** Subscribe to a CSS media query. Server/first render assumes `false`. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Phone layout breakpoint (DESIGN.md: below 768 px). */
export const useIsPhone = () => useMediaQuery('(max-width: 767px)');

/** System colour scheme is dark (`prefers-color-scheme`). */
export const usePrefersDark = () => useMediaQuery('(prefers-color-scheme: dark)');
