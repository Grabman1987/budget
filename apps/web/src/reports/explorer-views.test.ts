import { DEFAULT_EXPLORER_QUERY, EXPLORER_PRESETS } from '@budget/domain';
import { describe, expect, it } from 'vitest';
import {
  EXPLORER_VIEWS_KEY,
  loadViews,
  MAX_NAME,
  MAX_VIEWS,
  sameQuery,
  storeViews,
  withoutView,
  withView,
} from './explorer-views';

const memory = (initial?: string) => {
  const data = new Map<string, string>(
    initial === undefined ? [] : [[EXPLORER_VIEWS_KEY, initial]],
  );
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};

describe('saved Explorer views', () => {
  it('round-trips a view through the storage', () => {
    const storage = memory();
    const views = withView([], '  Meine Sicht  ', DEFAULT_EXPLORER_QUERY);
    expect(storeViews(storage, views)).toBe(true);
    expect(loadViews(storage)).toEqual([{ name: 'Meine Sicht', query: DEFAULT_EXPLORER_QUERY }]);
  });

  it('replaces a view of the same name, ignoring case, and ignores an empty name', () => {
    const other = EXPLORER_PRESETS[1]!.query;
    const once = withView([], 'Sicht', DEFAULT_EXPLORER_QUERY);
    const twice = withView(once, 'SICHT', other);
    expect(twice).toEqual([{ name: 'SICHT', query: other }]);
    expect(withView(twice, '   ', other)).toBe(twice);
  });

  it('cuts long names and keeps at most the newest twenty views', () => {
    expect(withView([], 'x'.repeat(100), DEFAULT_EXPLORER_QUERY)[0]!.name).toHaveLength(MAX_NAME);
    let views = withView([], 'v0', DEFAULT_EXPLORER_QUERY);
    for (let i = 1; i <= MAX_VIEWS + 4; i++)
      views = withView(views, `v${i}`, DEFAULT_EXPLORER_QUERY);
    expect(views).toHaveLength(MAX_VIEWS);
    expect(views.at(-1)!.name).toBe(`v${MAX_VIEWS + 4}`);
  });

  it('drops what is broken, unknown or tampered with and survives a missing storage', () => {
    expect(loadViews(memory('not json'))).toEqual([]);
    expect(loadViews(memory('{"a":1}'))).toEqual([]);
    expect(
      loadViews(
        memory(
          JSON.stringify([
            { name: 'ok', query: DEFAULT_EXPLORER_QUERY },
            { name: 'bad dim', query: { ...DEFAULT_EXPLORER_QUERY, dim: 'x' } },
            { name: '', query: DEFAULT_EXPLORER_QUERY },
            { query: DEFAULT_EXPLORER_QUERY },
            null,
          ]),
        ),
      ),
    ).toEqual([{ name: 'ok', query: DEFAULT_EXPLORER_QUERY }]);
    expect(loadViews(null)).toEqual([]);
    expect(storeViews(null, [])).toBe(false);
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(storeViews(full, [])).toBe(false);
  });

  it('removes a view by name and compares queries by their five choices', () => {
    const views = withView(withView([], 'a', DEFAULT_EXPLORER_QUERY), 'b', DEFAULT_EXPLORER_QUERY);
    expect(withoutView(views, 'a').map((v) => v.name)).toEqual(['b']);
    expect(sameQuery(DEFAULT_EXPLORER_QUERY, { ...DEFAULT_EXPLORER_QUERY })).toBe(true);
    expect(sameQuery(DEFAULT_EXPLORER_QUERY, { ...DEFAULT_EXPLORER_QUERY, meas: 'avg' })).toBe(
      false,
    );
  });
});
