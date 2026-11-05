import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { request, onApiWrite } from './http';

const cleanup = vi.hoisted(() => vi.fn());
vi.mock('../pwa/local-data', () => ({ clearDeviceFinancialData: cleanup }));
const KEY = '55900000-0000-4000-8000-000000000001';
const fetchMock = vi.fn();
beforeEach(() => {
  cleanup.mockReset().mockResolvedValue(undefined);
  fetchMock.mockReset().mockResolvedValue(Response.json({ groupId: KEY }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('navigator', { onLine: false });
});
afterEach(() => vi.unstubAllGlobals());
function form() {
  const body = new FormData();
  body.set('file', new Blob(['synthetic-file'], { type: '' }), 'synthetic.png');
  body.set('uploadIntent', KEY);
  return body;
}

it('permits only the exact keyed multipart receipt path while ordinary offline writes stay blocked', async () => {
  const body = form();
  const write = vi.fn();
  const unsubscribe = onApiWrite(write);
  try {
    await expect(
      request('POST', '/api/receipts', body, { 'Idempotency-Key': KEY }),
    ).resolves.toEqual({ groupId: KEY });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/receipts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Idempotency-Key': KEY },
      body,
    });
    // The queue validates the full acknowledgement and wipe epoch before notifying writes.
    expect(write).not.toHaveBeenCalled();
    await expect(request('POST', '/api/receipts', {})).rejects.toMatchObject({
      code: 'offline_read_only',
    });
    await expect(request('DELETE', '/api/bookings/synthetic')).rejects.toMatchObject({
      code: 'offline_read_only',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    unsubscribe();
  }
});

it.each([
  'wrong-path',
  'wrong-key',
  'missing-key',
  'extra-field',
  'duplicate-file',
  'wrong-method',
])('rejects %s multipart without sending or broadening the offline bypass', async (change) => {
  const body = form();
  if (change === 'extra-field') body.set('arbitrary', 'synthetic');
  if (change === 'duplicate-file') body.append('file', new Blob(['synthetic']));
  await expect(
    request(
      change === 'wrong-method' ? 'PUT' : 'POST',
      change === 'wrong-path' ? '/api/receipts/synthetic/links' : '/api/receipts',
      body,
      change === 'missing-key'
        ? undefined
        : { 'Idempotency-Key': change === 'wrong-key' ? 'synthetic-other-key' : KEY },
    ),
  ).rejects.toMatchObject({ code: 'invalid_receipt_intent' });
  expect(fetchMock).not.toHaveBeenCalled();
});

it('retains file intents for reauthentication after a receipt upload receives 401', async () => {
  fetchMock.mockResolvedValue(Response.json({ error: 'unauthorized' }, { status: 401 }));
  await expect(
    request('POST', '/api/receipts', form(), { 'Idempotency-Key': KEY }),
  ).rejects.toMatchObject({ status: 401 });
  expect(cleanup).toHaveBeenCalledExactlyOnceWith({ preserveReceipts: true });
});
