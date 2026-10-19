import { describe, expect, it } from 'vitest';
import { acknowledgeExplorerPromotion } from './explorer-view-api';
import { EXPLORER_VIEWS_KEY } from './explorer-views';

describe('local Explorer acknowledgment', () => {
  const state = {
    schemaVersion: 1 as const,
    revision: 'server-ack',
    views: [],
    unavailable: false,
  };
  it('clears only acknowledged unchanged source and preserves invalid pending entries', () => {
    const data = new Map([[EXPLORER_VIEWS_KEY, 'original']]);
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    };
    expect(acknowledgeExplorerPromotion(storage, 'older', [], state)).toBe(false);
    expect(data.get(EXPLORER_VIEWS_KEY)).toBe('original');
    expect(
      acknowledgeExplorerPromotion(storage, 'original', [{ name: 'Invalid', query: null }], state),
    ).toBe(true);
    const pending = JSON.stringify([{ name: 'Invalid', query: null }]);
    expect(data.get(EXPLORER_VIEWS_KEY)).toBe(pending);
    expect(
      acknowledgeExplorerPromotion(storage, pending, [], { ...state, unavailable: true }),
    ).toBe(false);
    expect(data.get(EXPLORER_VIEWS_KEY)).toBe(pending);
    const future = JSON.parse(JSON.stringify({ ...state, schemaVersion: 2 }));
    expect(acknowledgeExplorerPromotion(storage, pending, [], future)).toBe(false);
    expect(data.get(EXPLORER_VIEWS_KEY)).toBe(pending);
    expect(acknowledgeExplorerPromotion(storage, pending, [], state)).toBe(true);
    expect(data.has(EXPLORER_VIEWS_KEY)).toBe(false);
  });
  it('retains raw local data if storage cannot write the acknowledgment', () => {
    const storage = {
      getItem: () => 'original',
      setItem: () => {
        throw Error('blocked');
      },
      removeItem: () => {
        throw Error('blocked');
      },
    };
    expect(acknowledgeExplorerPromotion(storage, 'original', [], state)).toBe(false);
    expect(storage.getItem()).toBe('original');
  });
});
