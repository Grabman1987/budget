import { parseExplorerQuery, type ExplorerQuery } from '@budget/domain';

/**
 * Saved views of the Explorer (5.3): a name and the five choices of the pivot. They are kept in
 * this browser (`localStorage`), as the prototype does; the query itself never contains data.
 * All functions take the storage so tests need no browser.
 */

export const EXPLORER_VIEWS_KEY = 'budget-explorer-views';
export const MAX_VIEWS = 20;
export const MAX_NAME = 40;

export interface SavedView {
  name: string;
  query: ExplorerQuery;
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

/** The saved views; anything unreadable or no longer valid is dropped. */
export function loadViews(storage: Storage | null): SavedView[] {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(EXPLORER_VIEWS_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item: unknown) => {
      if (typeof item !== 'object' || item === null) return [];
      const { name, query } = item as { name?: unknown; query?: unknown };
      const parsed =
        typeof query === 'object' && query !== null
          ? parseExplorerQuery(query as Record<string, unknown>)
          : null;
      return typeof name === 'string' && name.trim() !== '' && parsed
        ? [{ name: name.trim().slice(0, MAX_NAME), query: parsed }]
        : [];
    });
  } catch {
    return [];
  }
}

/** Writes the views; `false` when the storage is unavailable or full. */
export function storeViews(storage: Storage | null, views: SavedView[]): boolean {
  try {
    if (!storage) return false;
    storage.setItem(EXPLORER_VIEWS_KEY, JSON.stringify(views));
    return true;
  } catch {
    return false;
  }
}

/** The views with `name` added; a view of the same name (any case) is replaced. */
export function withView(views: SavedView[], name: string, query: ExplorerQuery): SavedView[] {
  const clean = name.trim().slice(0, MAX_NAME);
  if (clean === '') return views;
  const rest = views.filter((v) => v.name.toLowerCase() !== clean.toLowerCase());
  return [...rest, { name: clean, query }].slice(-MAX_VIEWS);
}

export const withoutView = (views: SavedView[], name: string): SavedView[] =>
  views.filter((v) => v.name !== name);

export const sameQuery = (a: ExplorerQuery, b: ExplorerQuery): boolean =>
  a.dim === b.dim &&
  a.cls === b.cls &&
  a.cols === b.cols &&
  a.period === b.period &&
  a.meas === b.meas;
