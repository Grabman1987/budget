import { useMatches } from '@tanstack/react-router';
import { createContext, useContext, useEffect } from 'react';
import type { PageMeta } from '../nav/pages';

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    meta?: PageMeta;
  }
}

/** Metadata of the active leaf route (title, area, register). */
export function useActivePage(): PageMeta | undefined {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const meta = matches[i]?.staticData.meta;
    if (meta) return meta;
  }
  return undefined;
}

const TitleContext = createContext<(title: string | undefined) => void>(() => {});

export const PageTitleProvider = TitleContext.Provider;

/** Pages whose title comes from the URL (report, account) set it here; cleared on unmount. */
export function useSetPageTitle(title: string | undefined): void {
  const set = useContext(TitleContext);
  useEffect(() => {
    set(title);
    return () => set(undefined);
  }, [set, title]);
}
