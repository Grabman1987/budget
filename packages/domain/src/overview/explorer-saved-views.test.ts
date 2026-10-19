import { describe, expect, it } from 'vitest';
import {
  explorerViewInput,
  explorerViewsDocument,
  legacyExplorerViews,
  savedExplorerQuery,
} from './explorer-saved-views';

const query = { dim: 'kategorie', cls: 'want', cols: 'quartal', period: '3J', meas: 'summe' };
const id = '00000000-0000-4000-8000-000000000001';

describe('versioned saved Explorer intent', () => {
  it('retains exactly the five choices, including a bounded calendar range', () => {
    expect(savedExplorerQuery(query)).toEqual(query);
    expect(savedExplorerQuery({ ...query, period: '2026-01..2026-03' })).toEqual({
      ...query,
      period: '2026-01..2026-03',
    });
    expect(explorerViewInput({ name: '  Muster  ', query })).toEqual({ name: 'Muster', query });
    expect(explorerViewInput({ name: 'a'.repeat(40), query })).not.toBeNull();
    expect(explorerViewInput({ name: 'a'.repeat(41), query })).toBeNull();
  });
  it('rejects unknown fields, malformed ranges and future/corrupt documents without defaulting', () => {
    for (const invalid of [
      { ...query, dim: 'unknown' },
      { ...query, period: '2026-13..2026-14' },
      { ...query, accountId: 'outside-scope' },
    ])
      expect(savedExplorerQuery(invalid)).toBeNull();
    const doc = { schemaVersion: 1, views: [{ id, name: 'Muster', query }], imports: [] };
    expect(explorerViewsDocument(doc)).toEqual(doc);
    expect(explorerViewsDocument({ ...doc, schemaVersion: 2 })).toBeNull();
    expect(explorerViewsDocument({ ...doc, views: [...doc.views, ...doc.views] })).toBeNull();
  });
  it('preserves invalid legacy records and malformed source for recovery', () => {
    const invalid = { name: 'Alt', query: { ...query, dim: 'unknown' } };
    expect(legacyExplorerViews(JSON.stringify([{ name: 'Muster', query }, invalid]))).toEqual({
      views: [{ name: 'Muster', query }],
      pending: [invalid],
      unreadable: false,
    });
    expect(legacyExplorerViews('broken')).toEqual({ views: [], pending: [], unreadable: true });
    expect(
      legacyExplorerViews(
        JSON.stringify(Array.from({ length: 21 }, () => ({ name: 'Muster', query }))),
      ),
    ).toMatchObject({ unreadable: true, views: [] });
  });
});
