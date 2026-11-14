import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startReadModelRefresh, type ReadModelOffload } from './read-model-offload';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(recent: string[]) {
  let stamp = '1:1';
  const asked: string[] = [];
  const api = { request: (path: string) => (asked.push(path), new Response('{}')) };
  const offload = { recent: () => recent } as unknown as ReadModelOffload;
  const stop = startReadModelRefresh(api, () => stamp, offload, { everyMs: 1_000 });
  return { asked, stop, set: (value: string) => (stamp = value) };
}

it('recomputes recently read models once the stamp has settled, once per stamp', async () => {
  const { asked, stop, set } = setup(['/heute?period=month']);
  await vi.advanceTimersByTimeAsync(3_000);
  expect(asked).toEqual([]); // nothing changed since start
  set('2:1');
  await vi.advanceTimersByTimeAsync(1_000);
  expect(asked).toEqual([]); // just moved: wait one more check
  set('2:2'); // Litestream's own commit a little later
  await vi.advanceTimersByTimeAsync(1_000);
  expect(asked).toEqual([]);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(asked).toEqual(['/heute?period=month']);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(asked).toHaveLength(1);
  stop();
});

it('does nothing without a recent visitor', async () => {
  const { asked, stop, set } = setup([]);
  set('2:1');
  await vi.advanceTimersByTimeAsync(5_000);
  expect(asked).toEqual([]);
  stop();
});
