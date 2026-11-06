import { sourceInteger } from '@budget/domain';
import { z } from 'zod';
import { SourceReadError } from './errors';

const API_ORIGIN = 'https://api.spritmonitor.de';
const API_PREFIX = '/v1';
const PAGE_SIZE = 100;
// One extra request confirms completion after 100 full data pages (10,000 entries).
const MAX_PAGES = 101;
const MAX_ENTRIES = 10_000;
const MAX_RESPONSE_BYTES = 4_000_000;
const MAX_ID = 2_147_483_647;

const positiveId = z.number().int().positive().max(MAX_ID);
const optionalText = z.string().max(4096).nullish();
const vehicleRow = z.object({
  id: positiveId,
  make: optionalText,
  model: optionalText,
  sign: optionalText,
});
const tankRow = z.object({
  id: positiveId,
  name: optionalText,
  fuelsorttype: z.number().int().nonnegative().nullish(),
  quantityunittype: z.number().int().nonnegative().nullish(),
});
const currencyRow = z.object({
  id: z.number().int().nonnegative().max(MAX_ID),
  name: z.string().trim().min(1).max(20),
});
const fuelingRow = z.object({
  id: positiveId,
  date: z.string().min(1).max(32),
  cost: z.number().finite().nonnegative().nullish(),
  currencyid: z.number().int().nonnegative().max(MAX_ID).nullish(),
  stationname: optionalText,
  location: optionalText,
  note: optionalText,
});

export interface SpritmonitorVehicle {
  id: number;
  make: string | null;
  model: string | null;
  sign: string | null;
}

export interface SpritmonitorTank {
  id: number;
  name: string | null;
  fuelSortId: number | null;
  quantityUnitId: number | null;
}

interface FuelingBase {
  /** Stable provider identity, qualified by vehicle and tank. */
  sourceId: string;
  remoteId: number;
  vehicleId: number;
  tankId: number;
  date: string;
  stationName: string | null;
  location: string | null;
  note: string | null;
}

export type SpritmonitorFueling =
  | (FuelingBase & { status: 'importable'; currency: 'EUR'; amountCents: number })
  | (FuelingBase & {
      status: 'unsupported';
      reason: 'unsupported_currency' | 'unknown_currency' | 'missing_cost' | 'unsupported_amount';
      currency: string | null;
      sourceAmount: string | null;
    });

export interface SpritmonitorClientOptions {
  applicationId?: () => string | undefined;
  bearerToken?: () => string | undefined;
  fetch?: typeof fetch;
}

function isoDate(value: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) throw new SourceReadError('schema');
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  if (!z.iso.date().safeParse(iso).success) throw new SourceReadError('schema');
  return iso;
}

function providerDate(value: string): string {
  if (!z.iso.date().safeParse(value).success) throw new SourceReadError('schema');
  return value.slice(8, 10) + '.' + value.slice(5, 7) + '.' + value.slice(0, 4);
}

function readFailure(error: unknown): SourceReadError {
  if (error instanceof SourceReadError) return error;
  return new SourceReadError(
    error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
      ? 'timeout'
      : 'http',
  );
}

function parseRows<T>(schema: z.ZodType<T>, value: unknown, maximum: number): T[] {
  const result = z.array(schema).max(maximum).safeParse(value);
  if (!result.success) throw new SourceReadError('schema');
  return result.data;
}

function exactTotalCents(cost: number): number | null {
  // Spritmonitor documents `cost` as the paid total. Convert its JSON decimal representation
  // directly to integer cents; never multiply quantity by a unit price or use float rounding.
  return sourceInteger(String(cost), 2);
}

function normalizeFueling(
  row: z.infer<typeof fuelingRow>,
  vehicleId: number,
  tankId: number,
  currencies: ReadonlyMap<number, string>,
): SpritmonitorFueling {
  const sourceId = `spritmonitor:${vehicleId}:${tankId}:${row.id}`;
  const base: FuelingBase = {
    sourceId,
    remoteId: row.id,
    vehicleId,
    tankId,
    date: isoDate(row.date),
    stationName: row.stationname?.trim() || null,
    location: row.location?.trim() || null,
    note: row.note?.trim() || null,
  };
  const currency = row.currencyid == null ? null : (currencies.get(row.currencyid) ?? null);
  const sourceAmount = row.cost == null ? null : String(row.cost);
  if (row.currencyid == null || currency == null)
    return { ...base, status: 'unsupported', reason: 'unknown_currency', currency, sourceAmount };
  if (currency.toUpperCase() !== 'EUR')
    return {
      ...base,
      status: 'unsupported',
      reason: 'unsupported_currency',
      currency,
      sourceAmount,
    };
  if (row.cost == null)
    return { ...base, status: 'unsupported', reason: 'missing_cost', currency, sourceAmount };
  const totalCents = exactTotalCents(row.cost);
  if (totalCents == null || totalCents <= 0)
    return { ...base, status: 'unsupported', reason: 'unsupported_amount', currency, sourceAmount };
  return { ...base, status: 'importable', currency: 'EUR', amountCents: -totalCents };
}

/** Read-only client for the documented Spritmonitor API. Credentials are sent only in headers. */
export function spritmonitorApi(options: SpritmonitorClientOptions = {}) {
  const applicationId = options.applicationId ?? (() => process.env['SPRITMONITOR_APPLICATION_ID']);
  const bearerToken = options.bearerToken ?? (() => process.env['SPRITMONITOR_BEARER_TOKEN']);
  const request = options.fetch ?? fetch;

  const configured = () => Boolean(applicationId()?.trim() && bearerToken()?.trim());

  async function get(path: string, params = new URLSearchParams()): Promise<unknown> {
    const appId = applicationId()?.trim();
    const token = bearerToken()?.trim();
    if (!appId || !token) throw new Error('spritmonitor_unconfigured');
    const url = new URL(API_PREFIX + path, API_ORIGIN);
    url.search = params.toString();
    let response: Response;
    try {
      response = await request(url, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Accept: 'application/json',
          'Application-ID': appId,
          Authorization: 'Bearer ' + token,
        },
      });
    } catch (error) {
      throw readFailure(error);
    }
    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {
        // Ignore untrusted response-body cleanup failures.
      }
      throw new SourceReadError('http');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new SourceReadError('parse');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_RESPONSE_BYTES) throw new SourceReadError('parse');
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw readFailure(error);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
      throw new SourceReadError('parse');
    }
  }

  async function currencies(): Promise<Map<number, string>> {
    const rows = parseRows(currencyRow, await get('/currencies.json'), 500);
    const result = new Map<number, string>();
    for (const row of rows) {
      if (result.has(row.id)) throw new SourceReadError('schema');
      result.set(row.id, row.name);
    }
    return result;
  }

  return {
    configured,
    async vehicles(): Promise<SpritmonitorVehicle[]> {
      return parseRows(vehicleRow, await get('/vehicles.json'), 1000).map((row) => ({
        id: row.id,
        make: row.make?.trim() || null,
        model: row.model?.trim() || null,
        sign: row.sign?.trim() || null,
      }));
    },
    async tanks(vehicleId: number): Promise<SpritmonitorTank[]> {
      if (!Number.isInteger(vehicleId) || vehicleId <= 0 || vehicleId > MAX_ID)
        throw new SourceReadError('schema');
      return parseRows(tankRow, await get(`/vehicle/${vehicleId}/tanks.json`), 100).map((row) => ({
        id: row.id,
        name: row.name?.trim() || null,
        fuelSortId: row.fuelsorttype ?? null,
        quantityUnitId: row.quantityunittype ?? null,
      }));
    },
    async fuelings(
      vehicleId: number,
      tankId: number,
      range?: { from: string; to: string },
    ): Promise<SpritmonitorFueling[]> {
      if (
        !Number.isInteger(vehicleId) ||
        vehicleId <= 0 ||
        vehicleId > MAX_ID ||
        !Number.isInteger(tankId) ||
        tankId <= 0 ||
        tankId > MAX_ID
      )
        throw new SourceReadError('schema');
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: '0' });
      if (range) {
        const from = providerDate(range.from);
        const to = providerDate(range.to);
        if (range.from > range.to) throw new SourceReadError('schema');
        params.set('sdate', from);
        params.set('edate', to);
      }
      const currencyMap = await currencies();
      const rows: z.infer<typeof fuelingRow>[] = [];
      const seenRows = new Map<number, string>();
      for (let page = 0; page < MAX_PAGES; page += 1) {
        params.set('offset', String(page * PAGE_SIZE));
        const batch = parseRows(
          fuelingRow,
          await get(`/vehicle/${vehicleId}/tank/${tankId}/fuelings.json`, params),
          PAGE_SIZE,
        );
        let added = 0;
        for (const row of batch) {
          const serialized = JSON.stringify(row);
          const previous = seenRows.get(row.id);
          if (previous !== undefined) {
            if (previous !== serialized) throw new SourceReadError('schema');
            continue;
          }
          seenRows.set(row.id, serialized);
          rows.push(row);
          if (rows.length > MAX_ENTRIES) throw new SourceReadError('schema');
          added += 1;
        }
        if (batch.length < PAGE_SIZE) {
          const normalized = rows.map((row) =>
            normalizeFueling(row, vehicleId, tankId, currencyMap),
          );
          if (!range) return normalized;
          return normalized.filter((row) => row.date >= range.from && row.date <= range.to);
        }
        if (added === 0) throw new SourceReadError('schema');
      }
      throw new SourceReadError('schema');
    },
  };
}
