import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from '../api/http';
import { queryClient } from './status-query';

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe('stale time and writes', () => {
  it('keeps a read fresh, and marks every cached query stale after a successful write', async () => {
    queryClient.setQueryData(['heute', 'x'], { n: 1 });
    expect(queryClient.getQueryState(['heute', 'x'])?.isInvalidated).toBe(false);
    expect(queryClient.isFetching()).toBe(0);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    await request('GET', '/api/heute');
    expect(queryClient.getQueryState(['heute', 'x'])?.isInvalidated).toBe(false);
    await request('POST', '/api/bookings', {});
    expect(queryClient.getQueryState(['heute', 'x'])?.isInvalidated).toBe(true);
  });

  it('does not invalidate when the write fails', async () => {
    queryClient.setQueryData(['heute', 'x'], { n: 1 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'nope' }), { status: 409 })),
    );
    await expect(request('POST', '/api/bookings', {})).rejects.toThrow();
    expect(queryClient.getQueryState(['heute', 'x'])?.isInvalidated).toBe(false);
  });
});
