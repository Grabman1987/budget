import { useMatches } from '@tanstack/react-router';
import type { PageMeta } from '../nav/pages';

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    meta?: PageMeta;
  }
}

/** Loader result of routes whose title depends on the URL (report, report group, account). */
export interface PageTitleData {
  title?: string;
}

/**
 * Metadata of the active leaf route (title, area, register). A route loader may override the title
 * (`{ title }`): the loader runs before the page renders, so the document title and the screen
 * reader announcement are right from the first render and never change afterwards.
 */
export function useActivePage(): PageMeta | undefined {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const meta = match?.staticData.meta;
    if (!meta) continue;
    const title = (match?.loaderData as PageTitleData | undefined)?.title;
    return title ? { ...meta, title } : meta;
  }
  return undefined;
}
