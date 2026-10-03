import { describe, expect, it, vi } from 'vitest';
import { cryptoReadSource } from './crypto-api';
const amount = { value: '12.34', currency_id: 'currency-test' };
const operation = {
  operation_id: 'operation-test',
  operation_type: 'deposit',
  transactions: [
    {
      transaction_id: 'transaction-test',
      transaction_type: 'deposit',
      wallet_id: 'wallet-test',
      wallet_owner: 'discard this field',
      flow: 'INCOMING',
      credited_at: '2026-10-01T12:00:00.000Z',
      asset_amount: amount,
    },
  ],
};
const window = { from: '2026-01-01T00:00:00.000Z', to: '2026-10-02T00:00:00.000Z', cursor: null };
const synthetic = { key: () => 'synthetic-key', base: () => 'https://source.example.test' };
describe('read-only provider boundary', () => {
  it('normalizes current API operations, follows opaque cursors and strips unrelated fields', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ data: [operation], has_next_page: true, next_cursor: 'opaque/next?x=1' }),
      );
    const source = cryptoReadSource({ ...synthetic, fetch: request });
    const result = await source.operations(window);
    expect(result.nextCursor).toBe('opaque/next?x=1');
    expect(result.operations[0]?.transactions[0]?.amount.cents).toBe(1234);
    expect(JSON.stringify(result)).not.toContain('wallet_owner');
    const [url, init] = request.mock.calls[0]!;
    expect(new URL(String(url)).pathname).toBe('/v1/operations');
    expect(new URL(String(url)).protocol).toBe('https:');
    expect(init).toMatchObject({
      method: 'GET',
      redirect: 'error',
      headers: { 'X-Api-Key': 'synthetic-key' },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    request.mockResolvedValue(Response.json({ data: [], has_next_page: false }));
    await source.operations({ ...window, cursor: result.nextCursor });
    expect(new URL(String(request.mock.calls[1]![0])).searchParams.get('cursor')).toBe(
      'opaque/next?x=1',
    );
  });
  it('reads native cash and asset balances rather than equivalent market values', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        data: [
          { balance: amount, currency_balance: { value: '999' } },
          { balance: { value: '0.123456789', asset_id: 'asset-test' } },
        ],
      }),
    );
    request.mockResolvedValueOnce(
      Response.json({ data: [{ id: 'currency-test', symbol: 'EUR' }] }),
    );
    request.mockResolvedValueOnce(
      Response.json({
        data: [{ id: 'asset-test', name: 'Synthetic coin', symbol: 'SYN' }],
        has_next_page: false,
      }),
    );
    const rows = await cryptoReadSource({
      ...synthetic,
      fetch: request,
    }).balances();
    expect(rows).toEqual([
      {
        label: 'EUR',
        key: 'currency:currency-test',
        currency: 'EUR',
        amount: { value: '12.34', assetId: null, currencyId: 'currency-test', cents: 1234 },
      },
      {
        label: 'Synthetic coin (SYN)',
        key: 'asset:asset-test',
        currency: null,
        amount: { value: '0.123456789', assetId: 'asset-test', currencyId: null, cents: null },
      },
    ]);
  });
  it('makes no network call without a key and never forwards upstream errors', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('synthetic-private-body'));
    const source = cryptoReadSource({ ...synthetic, key: () => undefined, fetch: request });
    expect(source.configured()).toBe(false);
    await expect(source.operations(window)).rejects.toThrow('source_unconfigured');
    for (const base of [undefined, 'http://source.example.test', 'not a url']) {
      const unsafe = cryptoReadSource({ ...synthetic, base: () => base, fetch: request });
      expect(unsafe.configured()).toBe(false);
      await expect(unsafe.operations(window)).rejects.toThrow('source_unconfigured');
    }
    expect(request).not.toHaveBeenCalled();
    await expect(
      cryptoReadSource({ ...synthetic, fetch: request }).operations(window),
    ).rejects.toThrow(/^source_failed$/);
  });
  it('fails closed for a malformed page envelope', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [], has_next_page: true }));
    await expect(
      cryptoReadSource({ ...synthetic, fetch: request }).operations(window),
    ).rejects.toMatchObject({ category: 'schema' });
  });
  it('quarantines one malformed operation while retaining valid neighbors and cursor', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          operation,
          {
            ...operation,
            operation_id: 'bad-op',
            transactions: [
              { ...operation.transactions[0], asset_amount: { value: 'synthetic-private-body' } },
            ],
          },
          { ...operation, operation_id: 'second-op' },
          { private: 'synthetic-private-body' },
        ],
        has_next_page: true,
        next_cursor: 'next',
      }),
    );
    const result = await cryptoReadSource({
      ...synthetic,
      fetch: request,
    }).operations(window);
    expect(result.operations.map((op) => op.id)).toEqual(['operation-test', 'second-op']);
    expect(result.nextCursor).toBe('next');
    expect(result.invalidOperations?.[0]).toEqual({ id: 'bad-op', reason: 'schema' });
    expect(result.invalidOperations).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain('synthetic-private-body');
    expect(Object.keys(result.invalidOperations![1]!)).toEqual(['id', 'reason']);
  });
  it('tolerates row errors, unrelated currency schemas and duplicate portfolio balances', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            { balance: amount },
            { balance: amount },
            { balance: { value: '3.00', currency_id: 'long-symbol' } },
            { balance: { value: 'bad-private-value', currency_id: 'invalid-balance' } },
            { private: 'discard' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [
            { id: 'currency-test', symbol: 'EUR' },
            { id: 'unused', symbol: { private: 'discard' } },
            { id: 'long-symbol', symbol: 'CASH4' },
            { id: 'invalid-balance', symbol: 'USD' },
          ],
        }),
      );
    const rows = await cryptoReadSource({ ...synthetic, fetch: request }).balances();
    expect(rows.find((r) => r.key === 'currency:currency-test')).toMatchObject({
      issue: 'duplicate',
      currency: 'EUR',
    });
    expect(rows.find((r) => r.key === 'currency:long-symbol')).toMatchObject({
      currency: 'CASH4',
      amount: { cents: 300 },
    });
    expect(rows.find((r) => r.key === 'currency:invalid-balance')).toMatchObject({
      issue: 'schema',
    });
    expect(rows.find((r) => r.key === 'invalid:row:4')).toMatchObject({ issue: 'schema' });
    expect(JSON.stringify(rows)).not.toMatch(/bad-private-value|discard/);
  });
  it('does not request currency metadata for an asset-only portfolio', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ data: [{ balance: { value: '1', asset_id: 'asset-test' } }] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: 'asset-test', name: 'Synthetic coin', symbol: 'SYN' }],
          has_next_page: false,
        }),
      );
    await cryptoReadSource({ ...synthetic, fetch: request }).balances();
    expect(request.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/v1/portfolio',
      '/v1/assets',
    ]);
  });
  it('classifies transport timeout and JSON parse failure without retaining their messages', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException('synthetic-private-body', 'TimeoutError'))
      .mockResolvedValueOnce(new Response('synthetic-private-body'));
    const source = cryptoReadSource({ ...synthetic, fetch: request });
    await expect(source.operations(window)).rejects.toMatchObject({
      message: 'source_failed',
      category: 'timeout',
    });
    await expect(source.operations(window)).rejects.toMatchObject({
      message: 'source_failed',
      category: 'parse',
    });
  });
  it.each([401, 403, 429, 500, 302])('discards provider response %s', async (status) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('synthetic-private-body', { status }));
    await expect(
      cryptoReadSource({ ...synthetic, fetch: request }).operations(window),
    ).rejects.toMatchObject({ message: 'source_failed', category: 'http' });
  });
  it('rejects oversized streamed responses and cancels the body', async () => {
    const cancel = vi.fn();
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(4_000_001));
          },
          cancel,
        }),
      ),
    );
    await expect(
      cryptoReadSource({ ...synthetic, fetch: request }).operations(window),
    ).rejects.toThrow(/^source_failed$/);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
