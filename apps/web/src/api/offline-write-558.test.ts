import { afterEach, expect, it, vi } from 'vitest';
import { request } from './http';

afterEach(() => vi.unstubAllGlobals());

it('does not send an offline financial write outside the existing idempotent capture path', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
  vi.stubGlobal('navigator', { onLine: false });
  vi.stubGlobal('fetch', fetch);
  await expect(request('PUT', '/api/budget/2026-09/assigned', { items: [] })).rejects.toMatchObject(
    { status: 0, code: 'offline_read_only' },
  );
  expect(fetch).not.toHaveBeenCalled();
  await expect(
    request(
      'POST',
      '/api/bookings',
      { amountCents: -1250 },
      { 'Idempotency-Key': 'synthetic-key' },
    ),
  ).resolves.toEqual({ ok: true });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('allows only keyed booking edits and receipt checks through the existing offline delivery gate', async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response('{"result":null}'));
  vi.stubGlobal('navigator', { onLine: false });
  vi.stubGlobal('fetch', fetch);
  for (const [method, path] of [
    ['PATCH', '/api/bookings/synthetic-booking'],
    ['POST', '/api/bookings/delivery/synthetic-delivery-key'],
  ] as const) {
    await expect(request(method, path, {})).rejects.toMatchObject({ code: 'offline_read_only' });
    await expect(
      request(method, path, {}, { 'Idempotency-Key': 'synthetic-delivery-key' }),
    ).resolves.toEqual({ result: null });
  }
  await expect(
    request(
      'PATCH',
      '/api/accounts/synthetic-account',
      {},
      { 'Idempotency-Key': 'synthetic-delivery-key' },
    ),
  ).rejects.toMatchObject({ code: 'offline_read_only' });
  expect(fetch).toHaveBeenCalledTimes(2);
});
