import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});
it('requests only once even with concurrent mounts and a denied request', async () => {
  const persist = vi.fn().mockResolvedValue(false);
  const getItem = vi.fn().mockReturnValue(null);
  const setItem = vi.fn();
  vi.stubGlobal('navigator', { storage: { persist, persisted: vi.fn().mockResolvedValue(false) } });
  vi.stubGlobal('localStorage', { getItem, setItem });
  const { protectStorage } = await import('./storage-protection');
  expect(await Promise.all([protectStorage(), protectStorage()])).toEqual([
    'best-effort',
    'best-effort',
  ]);
  await protectStorage();
  expect(persist).toHaveBeenCalledTimes(1);
  expect(setItem).toHaveBeenCalledWith('budget-storage-persistence-requested', '1');
});
it('does not prompt again on a later visit', async () => {
  const persist = vi.fn();
  vi.stubGlobal('navigator', { storage: { persist, persisted: vi.fn().mockResolvedValue(false) } });
  vi.stubGlobal('localStorage', { getItem: () => '1' });
  expect(await (await import('./storage-protection')).protectStorage()).toBe('best-effort');
  expect(persist).not.toHaveBeenCalled();
});
it('reports unsupported browsers without failing login', async () => {
  vi.stubGlobal('navigator', {});
  expect(await (await import('./storage-protection')).protectStorage()).toBe('unsupported');
});
