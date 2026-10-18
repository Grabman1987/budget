// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readMemory, remember } from '../ledger/capture-model';
import {
  CAPTURE_MEMORY_KEY,
  FINANCIAL_LOCAL_STORAGE_KEYS,
  clearDeviceFinancialData,
} from './local-data';

const clearChoices = vi.hoisted(() => vi.fn());
vi.mock('./queue-store', () => ({ clearChoices }));

const cacheNames = vi.hoisted(() => ({ list: [] as string[] }));
const deleted: string[] = [];

beforeEach(() => {
  localStorage.clear();
  clearChoices.mockReset().mockResolvedValue(undefined);
  deleted.length = 0;
  cacheNames.list = ['budget-shell-abc123', 'api-responses', 'budget-snapshots-v1'];
  vi.stubGlobal('caches', {
    keys: async () => [...cacheNames.list],
    delete: async (name: string) => {
      deleted.push(name);
      return true;
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('clearDeviceFinancialData (#557)', () => {
  it('lists exactly the financial localStorage keys', () => {
    expect([...FINANCIAL_LOCAL_STORAGE_KEYS]).toEqual(['budget-capture-memory']);
    expect(CAPTURE_MEMORY_KEY).toBe('budget-capture-memory');
  });

  it('removes the capture memory the capture panel really writes', async () => {
    remember('account-1', 'category-1');
    expect(readMemory()).toEqual({ accounts: ['account-1'], categories: ['category-1'] });
    await clearDeviceFinancialData();
    expect(localStorage.getItem('budget-capture-memory')).toBeNull();
    expect(readMemory()).toEqual({ accounts: [], categories: [] });
  });

  it('keeps UI preferences that hold no financial data', async () => {
    const preferences: Record<string, string> = {
      'budget-theme': 'dark',
      'budget-amounts-hidden': '1',
      'budget-sidebar-collapsed': '1',
      'budget-sidebar-width': '280',
      'budget.plan.months': '6',
      'budget-liquidity-selection': '{"horizon":"6m","levers":[]}',
      'budget-balance-month': '1',
    };
    for (const [key, value] of Object.entries(preferences)) localStorage.setItem(key, value);
    localStorage.setItem('budget-capture-memory', '{"accounts":["a"],"categories":["c"]}');
    await clearDeviceFinancialData();
    for (const [key, value] of Object.entries(preferences))
      expect(localStorage.getItem(key)).toBe(value);
    expect(localStorage.getItem('budget-capture-memory')).toBeNull();
  });

  it('clears the cached form choices but nothing else in IndexedDB', async () => {
    await clearDeviceFinancialData();
    expect(clearChoices).toHaveBeenCalledTimes(1);
  });

  it('deletes service-worker caches except the app shell', async () => {
    await clearDeviceFinancialData();
    expect(deleted.sort()).toEqual(['api-responses', 'budget-snapshots-v1']);
  });

  it('never throws when storage, IndexedDB or Cache Storage fail', async () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    clearChoices.mockRejectedValue(new Error('no indexeddb'));
    vi.stubGlobal('caches', {
      keys: async () => {
        throw new Error('no cache storage');
      },
    });
    await expect(clearDeviceFinancialData()).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });

  it('does not wait forever for a blocked database', async () => {
    vi.useFakeTimers();
    clearChoices.mockReturnValue(new Promise(() => undefined));
    const done = clearDeviceFinancialData();
    await vi.advanceTimersByTimeAsync(3000);
    await expect(done).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
