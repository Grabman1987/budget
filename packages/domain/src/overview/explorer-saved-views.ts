import { parseExplorerQuery, type ExplorerQuery } from './explorer';

export const MAX_EXPLORER_VIEWS = 20;
export const MAX_EXPLORER_VIEW_NAME = 40;
export const EXPLORER_VIEW_SCHEMA = 1;

export interface ExplorerViewInput {
  name: string;
  query: ExplorerQuery;
}
export interface PersistedExplorerView extends ExplorerViewInput {
  id: string;
}
export interface ExplorerViewsDocument {
  schemaVersion: 1;
  views: PersistedExplorerView[];
  /** Recent acknowledgments; older acknowledgments remain in the existing audit history. */
  imports: string[];
}
export interface ExplorerViewsState {
  schemaVersion: 1;
  revision: string;
  views: PersistedExplorerView[];
  unavailable: boolean;
}
export type ExplorerViewsChange =
  | { kind: 'save'; view: ExplorerViewInput; id?: string }
  | { kind: 'delete'; id: string }
  | { kind: 'import'; views: ExplorerViewInput[] };
export interface ExplorerViewsWrite extends ExplorerViewsState {
  groupId: string;
  changed: boolean;
}

const record = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw);
const keys = (raw: Record<string, unknown>, allowed: string[]) =>
  Object.keys(raw).every((key) => allowed.includes(key));

/** Persist only the existing tuple. An extra filter must never be silently discarded. */
export function savedExplorerQuery(raw: unknown): ExplorerQuery | null {
  return record(raw) && keys(raw, ['dim', 'cls', 'cols', 'period', 'meas'])
    ? parseExplorerQuery(raw)
    : null;
}

export function explorerViewInput(raw: unknown): ExplorerViewInput | null {
  if (!record(raw) || !keys(raw, ['name', 'query'])) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const query = savedExplorerQuery(raw.query);
  return name.length > 0 && name.length <= MAX_EXPLORER_VIEW_NAME && query ? { name, query } : null;
}

/** Future/corrupt settings stay unavailable, rather than partially broadening their queries. */
export function explorerViewsDocument(raw: unknown): ExplorerViewsDocument | null {
  if (
    !record(raw) ||
    !keys(raw, ['schemaVersion', 'views', 'imports']) ||
    raw.schemaVersion !== EXPLORER_VIEW_SCHEMA ||
    !Array.isArray(raw.views) ||
    raw.views.length > MAX_EXPLORER_VIEWS ||
    !Array.isArray(raw.imports) ||
    raw.imports.length > MAX_EXPLORER_VIEWS ||
    !raw.imports.every((value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
  )
    return null;
  const views: PersistedExplorerView[] = [];
  for (const value of raw.views) {
    if (!record(value) || !keys(value, ['id', 'name', 'query'])) return null;
    const view = explorerViewInput({ name: value.name, query: value.query });
    if (
      !view ||
      typeof value.id !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.id)
    )
      return null;
    views.push({ id: value.id, ...view });
  }
  if (
    new Set(views.map((view) => view.id)).size !== views.length ||
    new Set(views.map((view) => view.name.toLowerCase())).size !== views.length
  )
    return null;
  return { schemaVersion: 1, views, imports: raw.imports as string[] };
}

/** Keep invalid legacy entries recoverable; only valid candidates are offered for promotion. */
export function legacyExplorerViews(raw: string | null): {
  views: ExplorerViewInput[];
  pending: unknown[];
  unreadable: boolean;
} {
  if (raw === null) return { views: [], pending: [], unreadable: false };
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values) || values.length > MAX_EXPLORER_VIEWS)
      return { views: [], pending: [], unreadable: true };
    const views: ExplorerViewInput[] = [];
    const pending: unknown[] = [];
    for (const value of values) {
      const view = explorerViewInput(value);
      if (view) views.push(view);
      else pending.push(value);
    }
    return { views, pending, unreadable: false };
  } catch {
    return { views: [], pending: [], unreadable: true };
  }
}
