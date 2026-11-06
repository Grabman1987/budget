import { describe, expect, it, vi } from 'vitest';
import { spritmonitorApi } from './spritmonitor-api';

const credentials = {
  applicationId: () => 'synthetic-application-id',
  bearerToken: () => 'synthetic-bearer-token',
};
const currencyList = [
  { id: 0, name: 'EUR' },
  { id: 1, name: 'USD' },
];
const fueling = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  date: '02.11.2026',
  cost: 73.08,
  currencyid: 0,
  quantity: 42.5,
  stationname: 'Synthetic station',
  location: 'Synthetic town',
  note: 'Synthetic fueling note',
  ...overrides,
});

describe('Spritmonitor read-only API client', () => {
  it('reads vehicles and tanks from the fixed origin with header credentials only', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json([
          {
            id: 42,
            make: 'Synthetic make',
            model: 'Synthetic model',
            sign: 'SYNTHETIC-PLATE',
            private: 'discard this field',
          },
        ]),
      )
      .mockResolvedValueOnce(
        Response.json([
          {
            id: 7,
            name: 'Synthetic tank',
            fuelsorttype: 3,
            quantityunittype: 1,
            private: 'discard this field',
          },
        ]),
      );
    const client = spritmonitorApi({ ...credentials, fetch: request });
    expect(client.configured()).toBe(true);
    const vehicles = await client.vehicles();
    expect(vehicles).toEqual([
      { id: 42, make: 'Synthetic make', model: 'Synthetic model', sign: 'SYNTHETIC-PLATE' },
    ]);
    expect(await client.tanks(42)).toEqual([
      { id: 7, name: 'Synthetic tank', fuelSortId: 3, quantityUnitId: 1 },
    ]);
    for (const [url, init] of request.mock.calls) {
      expect(new URL(String(url)).origin).toBe('https://api.spritmonitor.de');
      expect(init).toMatchObject({
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'Application-ID': 'synthetic-application-id',
          Authorization: 'Bearer synthetic-bearer-token',
        },
      });
      expect(String(url)).not.toContain('synthetic-bearer-token');
      expect(new URL(String(url)).pathname).not.toContain('fueling/');
    }
    expect(JSON.stringify(vehicles)).not.toContain('discard this field');
  });

  it('uses Spritmonitor total cost as exact cents, signs it as an expense, and normalizes the date', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(currencyList))
      .mockResolvedValueOnce(Response.json([fueling()]));
    const rows = await spritmonitorApi({ ...credentials, fetch: request }).fuelings(42, 7);
    expect(rows).toEqual([
      {
        sourceId: 'spritmonitor:42:7:1',
        remoteId: 1,
        vehicleId: 42,
        tankId: 7,
        date: '2026-11-02',
        stationName: 'Synthetic station',
        location: 'Synthetic town',
        note: 'Synthetic fueling note',
        status: 'importable',
        currency: 'EUR',
        amountCents: -7308,
      },
    ]);
    const fuelingUrl = new URL(String(request.mock.calls[1]![0]));
    expect(fuelingUrl.pathname).toBe('/v1/vehicle/42/tank/7/fuelings.json');
    expect(fuelingUrl.searchParams.get('limit')).toBe('100');
    expect(fuelingUrl.searchParams.get('offset')).toBe('0');
  });

  it('paginates in bounded pages and applies the documented tank date range', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      fueling({ id: index + 1, cost: 1.25 }),
    );
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(currencyList))
      .mockResolvedValueOnce(Response.json(firstPage))
      .mockResolvedValueOnce(Response.json([fueling({ id: 101, cost: 2.5 })]));
    const rows = await spritmonitorApi({ ...credentials, fetch: request }).fuelings(42, 7, {
      from: '2026-10-01',
      to: '2026-11-02',
    });
    expect(rows).toHaveLength(101);
    expect(rows[100]).toMatchObject({ remoteId: 101, amountCents: -250 });
    const pages = request.mock.calls.slice(1).map(([url]) => new URL(String(url)));
    expect(pages.map((url) => url.searchParams.get('offset'))).toEqual(['0', '100']);
    expect(pages.every((url) => url.searchParams.get('sdate') === '01.10.2026')).toBe(true);
    expect(pages.every((url) => url.searchParams.get('edate') === '02.11.2026')).toBe(true);
  });

  it('filters out-of-range history when the provider ignores the requested date bounds', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(currencyList))
      .mockResolvedValueOnce(
        Response.json([
          fueling({ id: 1, date: '30.09.2026' }),
          fueling({ id: 2, date: '01.10.2026' }),
          fueling({ id: 3, date: '02.11.2026' }),
          fueling({ id: 4, date: '03.11.2026' }),
        ]),
      );
    const rows = await spritmonitorApi({ ...credentials, fetch: request }).fuelings(42, 7, {
      from: '2026-10-01',
      to: '2026-11-02',
    });
    expect(rows.map((row) => row.remoteId)).toEqual([2, 3]);
  });

  it('keeps non-EUR, unknown-currency, missing-cost and sub-cent records explicit and non-importable', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(currencyList))
      .mockResolvedValueOnce(
        Response.json([
          fueling({ id: 1, currencyid: 1, cost: 50 }),
          fueling({ id: 2, currencyid: 99, cost: 50 }),
          fueling({ id: 3, cost: null }),
          fueling({ id: 4, cost: 1.234 }),
        ]),
      );
    const rows = await spritmonitorApi({ ...credentials, fetch: request }).fuelings(42, 7);
    expect(
      rows.map((row) => row.status === 'unsupported' && [row.remoteId, row.reason, row.currency]),
    ).toEqual([
      [1, 'unsupported_currency', 'USD'],
      [2, 'unknown_currency', null],
      [3, 'missing_cost', 'EUR'],
      [4, 'unsupported_amount', 'EUR'],
    ]);
    expect(rows.every((row) => row.status === 'unsupported' && !('amountCents' in row))).toBe(true);
  });

  it('rejects invalid IDs and date ranges before making requests', async () => {
    const request = vi.fn<typeof fetch>();
    const client = spritmonitorApi({ ...credentials, fetch: request });
    await expect(client.tanks(0)).rejects.toMatchObject({ category: 'schema' });
    await expect(
      client.fuelings(42, 7, { from: '2026-02-30', to: '2026-03-01' }),
    ).rejects.toMatchObject({
      category: 'schema',
    });
    await expect(
      client.fuelings(42, 7, { from: '2026-11-02', to: '2026-11-01' }),
    ).rejects.toMatchObject({
      category: 'schema',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('fails closed for missing credentials and never exposes upstream errors', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('synthetic-private-body'));
    const unconfigured = spritmonitorApi({ fetch: request });
    expect(unconfigured.configured()).toBe(false);
    await expect(unconfigured.vehicles()).rejects.toThrow('spritmonitor_unconfigured');
    expect(request).not.toHaveBeenCalled();

    const failed = spritmonitorApi({ ...credentials, fetch: request });
    const error = await failed.vehicles().catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      category: 'http',
      message: 'source_failed',
    });
    expect(request.mock.calls[0]?.[0]).toBeInstanceOf(URL);
    expect(String(error)).not.toContain('synthetic-private-body');
  });

  it('rejects malformed dates, response shapes and a repeated full page', async () => {
    const badDate = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(currencyList))
      .mockResolvedValueOnce(Response.json([fueling({ date: '31.02.2026' })]));
    await expect(
      spritmonitorApi({ ...credentials, fetch: badDate }).fuelings(42, 7),
    ).rejects.toMatchObject({
      category: 'schema',
    });

    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: 'private' }));
    await expect(
      spritmonitorApi({ ...credentials, fetch: malformed }).vehicles(),
    ).rejects.toMatchObject({
      category: 'schema',
      message: 'source_failed',
    });

    const repeatedPage = Array.from({ length: 100 }, (_, index) => fueling({ id: index + 1 }));
    const repeating = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(currencyList))
      .mockResolvedValueOnce(Response.json(repeatedPage))
      .mockResolvedValueOnce(Response.json(repeatedPage));
    await expect(
      spritmonitorApi({ ...credentials, fetch: repeating }).fuelings(42, 7),
    ).rejects.toMatchObject({ category: 'schema', message: 'source_failed' });
    expect(repeating).toHaveBeenCalledTimes(3);
  });

  it('fails closed when a repeated provider ID has different data across pages', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => fueling({ id: index + 1 }));
    const changedDuplicatePage = [
      fueling({ id: 1, cost: 99.99 }),
      ...Array.from({ length: 99 }, (_, index) => fueling({ id: index + 101 })),
    ];
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(currencyList))
      .mockResolvedValueOnce(Response.json(firstPage))
      .mockResolvedValueOnce(Response.json(changedDuplicatePage));
    await expect(
      spritmonitorApi({ ...credentials, fetch: request }).fuelings(42, 7),
    ).rejects.toMatchObject({ category: 'schema', message: 'source_failed' });
  });

  it('deduplicates identical provider rows repeated on a short final page', async () => {
    const repeated = fueling({ id: 1 });
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(currencyList))
      .mockResolvedValueOnce(Response.json([repeated]))
      .mockResolvedValueOnce(Response.json([repeated]));
    const rows = await spritmonitorApi({ ...credentials, fetch: request }).fuelings(42, 7);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ remoteId: 1, amountCents: -7308 });
  });
});
