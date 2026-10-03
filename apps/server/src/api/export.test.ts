/* eslint-disable @typescript-eslint/no-explicit-any -- CSV and ZIP are inspected as serialized data. */
import {
  createBooking,
  createTestDatabase,
  createTransfer,
  holdingValuationExportAsOf,
  schema,
  type Db,
} from '@budget/db';
import { existsSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import yauzl from 'yauzl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sqliteOf } from '@budget/db';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-03-31';
const webDir = mkdtempSync(join(tmpdir(), 'budget-export-api-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');

let authenticated = true;
let freshStepUp = true;
const auth: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (c, next) =>
    authenticated ? next() : c.json({ error: 'unauthorized' }, 401),
  requireStepUp: async (c, next) =>
    freshStepUp ? next() : c.json({ error: 'step_up_required' }, 403),
  routes: new Hono(),
};

let db: Db;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = createTestDatabase().db;
  authenticated = true;
  freshStepUp = true;
  app = createApp({ webDir, auth, ledger: { db, today: () => TODAY } });
});

const insertAccount = (values: Record<string, unknown>) =>
  db
    .insert(schema.account)
    .values({
      id: 'cash',
      name: 'Synthetic cash',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      currency: 'EUR',
      ...values,
    } as any)
    .run();

async function readZip(bytes: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error ?? new Error('ZIP could not be opened'));
      const files = new Map<string, Buffer>();
      zip.on('error', reject);
      zip.on('entry', (entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream)
            return reject(streamError ?? new Error('ZIP entry unavailable'));
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => {
            files.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => resolve(files));
      zip.readEntry();
    });
  });
}

function parseCsv(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] as string;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ';') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  return rows;
}

describe('GET /api/export/csv.zip', () => {
  it('requires a session and fresh step-up at the mounted API boundary', async () => {
    authenticated = false;
    const unauthenticated = await app.request('/api/export/csv.zip');
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get('content-type')).not.toContain('application/zip');

    authenticated = true;
    freshStepUp = false;
    const stale = await app.request('/api/export/csv.zip');
    expect(stale.status).toBe(403);
    expect(await stale.json()).toMatchObject({ error: 'step_up_required' });
    expect(stale.headers.get('content-type')).not.toContain('application/zip');
  });

  it('streams a complete ZIP with all CSV tables, safe text and exact source amounts', async () => {
    insertAccount({ id: 'cash', name: 'A; "cash"', openingBalanceCents: 25_000 });
    insertAccount({ id: 'usd-invest', name: 'USD investment account', currency: 'USD' });
    insertAccount({
      id: 'closed',
      name: 'Closed account',
      closedAt: '2026-02-01',
      openingBalanceCents: -90_000,
      role: 'debt',
      type: 'loan',
      onBudget: false,
      currency: 'EUR',
    });
    insertAccount({ id: 'gone', name: 'Deleted account', deletedAt: '2026-02-01' });
    db.insert(schema.categoryGroup).values({ id: 'group', name: 'Synthetic group' }).run();
    db.insert(schema.category)
      .values({ id: 'cat', name: 'Synthetic class', groupId: 'group', class: 'need' })
      .run();
    db.insert(schema.payee).values({ id: 'payee', name: 'Synthetic payee' }).run();
    db.insert(schema.institution)
      .values({ id: 'bank', name: 'Synthetic institution', kind: 'bank' })
      .run();
    db.insert(schema.assetClass)
      .values({ id: 'class', name: 'Synthetic class', sortOrder: 1 })
      .run();
    db.insert(schema.assetClassTarget)
      .values({
        id: 'target',
        assetClassId: 'class',
        validFrom: '2026-01-01',
        targetShareBp: 10000,
        bandBp: 1000,
      })
      .run();
    db.insert(schema.security)
      .values({
        id: 'sec',
        name: 'Synthetic ETF',
        kind: 'etf',
        currency: 'EUR',
        symbol: 'SYN',
        isin: 'SYNTHETIC',
        assetClassId: 'class',
        institutionId: 'bank',
      })
      .run();
    db.insert(schema.security)
      .values({ id: 'fxsec', name: 'Missing FX ETF', kind: 'etf', currency: 'USD', symbol: 'MISS' })
      .run();
    db.insert(schema.security)
      .values({ id: 'no-price', name: 'Missing price ETF', kind: 'etf', symbol: 'NO-PRICE' })
      .run();
    db.insert(schema.security)
      .values({ id: 'deadsec', name: 'Deleted ETF', kind: 'etf', deletedAt: '2026-02-01' })
      .run();
    db.insert(schema.savingsPlan)
      .values({
        id: 'plan',
        securityId: 'sec',
        accountId: 'cash',
        amountCents: 2500,
        dayOfMonth: 15,
        validFrom: '2026-01-01',
        note: 'synthetic plan',
      })
      .run();
    db.insert(schema.fxRate)
      .values({ date: '2026-03-30', currency: 'CAD', rateMicro: 740_000, source: 'ecb' })
      .run();
    db.insert(schema.price)
      .values([
        {
          securityId: 'sec',
          date: '2026-03-30',
          priceMicro: 1_250_000,
          currency: 'EUR',
          source: 'manual',
        },
        {
          securityId: 'fxsec',
          date: '2026-03-30',
          priceMicro: 2_000_000,
          currency: 'JPY',
          source: 'import',
        },
        {
          securityId: 'deadsec',
          date: '2026-03-30',
          priceMicro: 100_000,
          currency: 'EUR',
          source: 'manual',
        },
      ])
      .run();
    db.insert(schema.trade)
      .values({
        id: 'trade-live',
        accountId: 'cash',
        securityId: 'sec',
        date: '2026-03-10',
        kind: 'buy',
        unitsE8: 200_000_000,
        amountCents: 2500,
        feeCents: 10,
        taxCents: 12,
        note: 'synthetic trade',
      })
      .run();
    const expectedPositionValue = holdingValuationExportAsOf(db, TODAY).values.find(
      (row) => row.securityId === 'sec',
    )?.valueCents;
    db.insert(schema.trade)
      .values([
        {
          id: 'trade-missing-fx',
          accountId: 'usd-invest',
          securityId: 'fxsec',
          date: '2026-03-11',
          kind: 'buy',
          unitsE8: 100_000_000,
          amountCents: 2000,
          note: 'missing rate',
        },
        {
          id: 'trade-dead-security',
          accountId: 'cash',
          securityId: 'deadsec',
          date: '2026-03-12',
          kind: 'buy',
          unitsE8: 100_000_000,
          amountCents: 1000,
        },
        {
          id: 'trade-deleted',
          accountId: 'cash',
          securityId: 'sec',
          date: '2026-03-13',
          kind: 'buy',
          unitsE8: 100_000_000,
          amountCents: 1000,
          deletedAt: '2026-03-14',
        },
        {
          id: 'trade-no-price',
          accountId: 'cash',
          securityId: 'no-price',
          date: '2026-03-14',
          kind: 'buy',
          unitsE8: 100_000_000,
          amountCents: 2000,
        },
      ])
      .run();
    db.insert(schema.valuation)
      .values({
        id: 'valuation',
        accountId: 'closed',
        date: '2026-03-20',
        valueCents: -12_345,
        source: 'statement',
        note: 'synthetic valuation',
      })
      .run();
    db.insert(schema.booking)
      .values({
        id: 'split-booking',
        accountId: 'cash',
        date: '2026-03-20',
        amountCents: -5000,
        currency: 'EUR',
        originalAmountCents: -5500,
        originalCurrency: 'USD',
        fxRateMicro: 1_000_000,
        fxFeeCents: 500,
        memo: '=SUM(1;2)\r\nGrüße "quoted"',
        status: 'confirmed',
      })
      .run();
    db.insert(schema.bookingSplit)
      .values([
        {
          id: 'split-1',
          bookingId: 'split-booking',
          categoryId: 'cat',
          amountCents: -1500,
          memo: '=SUM(1;2)\r\nGrüße "quoted"',
        },
        {
          id: 'split-2',
          bookingId: 'split-booking',
          categoryId: 'cat',
          amountCents: -3500,
          memo: 'second',
        },
      ])
      .run();
    db.insert(schema.booking)
      .values([
        {
          id: 'tab-formula',
          accountId: 'cash',
          date: '2026-03-27',
          amountCents: 0,
          memo: '\t=1+1',
        },
        {
          id: 'cr-formula',
          accountId: 'cash',
          date: '2026-03-28',
          amountCents: 0,
          memo: '\r@SUM(1)',
        },
        {
          id: 'space-formula',
          accountId: 'cash',
          date: '2026-03-29',
          amountCents: 0,
          memo: '  =1+1',
        },
      ])
      .run();
    db.insert(schema.booking)
      .values({
        id: 'deleted-booking',
        accountId: 'cash',
        date: '2026-03-21',
        amountCents: 99999,
        deletedAt: '2026-03-22',
      })
      .run();
    db.insert(schema.booking)
      .values({
        id: 'booking-deleted-account',
        accountId: 'gone',
        date: '2026-03-21',
        amountCents: 99999,
      })
      .run();
    insertAccount({
      id: 'reserve',
      name: 'Reserve account',
      onBudget: false,
      role: 'reserve',
      type: 'savings',
    });
    insertAccount({
      id: 'reserve-two',
      name: 'Second reserve account',
      onBudget: false,
      role: 'reserve',
      type: 'savings',
    });
    const realTransfer = createTransfer(
      db,
      { fromAccountId: 'cash', toAccountId: 'closed', date: '2026-03-25', amountCents: 500 },
      { actor: 'export-test' },
    );
    const transferSplitBookingId = createBooking(
      db,
      {
        accountId: 'cash',
        date: '2026-03-26',
        amountCents: -1000,
        splits: [
          { categoryId: 'cat', amountCents: -200, memo: 'normal' },
          {
            categoryId: 'cat',
            amountCents: -300,
            memo: 'move one',
            transferAccountId: 'closed',
          },
          {
            categoryId: 'cat',
            amountCents: -500,
            memo: 'move two',
            transferAccountId: 'reserve',
          },
        ],
      },
      { actor: 'export-test' },
    );

    const response = await app.request('/api/export/csv.zip');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="budget-export-2026-03-31.zip"',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    // The archive must remain on the single DB snapshot captured before the stream was returned.
    db.insert(schema.booking)
      .values({
        id: 'arrived-during-export',
        accountId: 'cash',
        date: '2026-03-30',
        amountCents: 70_000,
      })
      .run();
    db.insert(schema.price)
      .values({
        securityId: 'sec',
        date: TODAY,
        priceMicro: 9_999_999,
        currency: 'EUR',
        source: 'manual',
      })
      .run();
    const files = await readZip(Buffer.from(await response.arrayBuffer()));
    expect([...files.keys()].sort()).toEqual([
      'accounts.csv',
      'asset_class_targets.csv',
      'asset_classes.csv',
      'bookings.csv',
      'fx_rates.csv',
      'holdings.csv',
      'positions.csv',
      'prices.csv',
      'savings_plans.csv',
      'securities.csv',
      'trades.csv',
      'valuations.csv',
    ]);
    for (const [name, bytes] of files) {
      expect(bytes.subarray(0, 3).toString('hex')).toBe('efbbbf');
      const rows = parseCsv(bytes.toString('utf8'));
      expect(new Set(rows[0]).size, `${name} has unique column names`).toBe(rows[0]?.length);
      expect(
        rows.every((row) => row.length === rows[0]?.length),
        name,
      ).toBe(true);
    }

    const accounts = parseCsv((files.get('accounts.csv') as Buffer).toString('utf8'));
    expect(accounts.some((row) => row[0] === 'closed')).toBe(true);
    expect(accounts.find((row) => row[0] === 'closed')?.[9]).toBe('-89200');
    expect(accounts.find((row) => row[0] === 'cash')?.[9]).toBe('18500');
    expect(accounts.some((row) => row[0] === 'gone')).toBe(false);
    const bookings = parseCsv((files.get('bookings.csv') as Buffer).toString('utf8'));
    const bookingHeader = bookings[0] as string[];
    const splitRows = bookings.filter((row) => row[0] === 'split-booking');
    expect(splitRows.map((row) => Number(row[7])).reduce((a, b) => a + b, 0)).toBe(-5000);
    expect(splitRows.map((row) => row[6])).toEqual(['-5000', '-5000']);
    expect(splitRows[0]?.[9]).toBe('-5500');
    expect(splitRows[0]?.[10]).toBe('USD');
    expect(splitRows[0]?.[17]).toBe('\'=SUM(1;2)\r\nGrüße "quoted"');
    expect(splitRows[0]?.[17]).toContain('"quoted"');
    expect(splitRows[0]?.[bookingHeader.indexOf('fx_rate_micro')]).toBe('1000000');
    expect(splitRows[0]?.[bookingHeader.indexOf('fx_fee_cents')]).toBe('500');
    const normalTransferOut = bookings.find((row) => row[0] === realTransfer.fromBookingId);
    const normalTransferIn = bookings.find((row) => row[0] === realTransfer.toBookingId);
    expect(normalTransferOut?.[15]).toBe(realTransfer.transferId);
    expect(normalTransferOut?.[16]).toBe('closed');
    expect(normalTransferIn?.[15]).toBe(realTransfer.transferId);
    expect(normalTransferIn?.[16]).toBe('cash');
    const movedRows = bookings.filter((row) => row[0] === transferSplitBookingId);
    expect(movedRows.find((row) => row[17] === 'normal')?.[15]).toBe('');
    const moveOne = movedRows.find((row) => row[17] === 'move one');
    const moveTwo = movedRows.find((row) => row[17] === 'move two');
    expect(moveOne?.[15]).not.toBe('');
    expect(moveOne?.[16]).toBe('closed');
    expect(moveTwo?.[15]).not.toBe('');
    expect(moveTwo?.[16]).toBe('reserve');
    expect(moveOne?.[15]).not.toBe(moveTwo?.[15]);
    expect(bookings.find((row) => row[15] === moveOne?.[15] && row[2] === 'closed')?.[16]).toBe(
      'cash',
    );
    expect(bookings.find((row) => row[15] === moveTwo?.[15] && row[2] === 'reserve')?.[16]).toBe(
      'cash',
    );
    expect(bookings.find((row) => row[0] === 'tab-formula')?.[17]).toBe("'\t=1+1");
    expect(bookings.find((row) => row[0] === 'cr-formula')?.[17]).toBe("'\r@SUM(1)");
    expect(bookings.find((row) => row[0] === 'space-formula')?.[17]).toBe("'  =1+1");
    expect(bookings.some((row) => row[0]?.startsWith('deleted'))).toBe(false);
    expect(bookings.some((row) => row[1] === 'gone')).toBe(false);

    const positions = parseCsv((files.get('positions.csv') as Buffer).toString('utf8'));
    const livePosition = positions.find((row) => row[1] === 'sec');
    expect(Number(livePosition?.[11])).toBe(expectedPositionValue);
    expect(livePosition?.[11]).toBe('250');
    expect(livePosition?.[12]).toBe('2510');
    expect(livePosition?.[13]).toBe('-2260');
    const missingFx = positions.find((row) => row[1] === 'fxsec');
    expect(missingFx?.[10]).toBe('JPY');
    expect(missingFx?.[15]).toBe('missing_fx');
    expect(missingFx?.[16]).toBe('JPY|USD');
    const missingPrice = positions.find((row) => row[1] === 'no-price');
    expect(missingPrice?.[8]).toBe('');
    expect(missingPrice?.[9]).toBe('');
    expect(missingPrice?.[10]).toBe('');
    expect(missingPrice?.[11]).toBe('');
    expect(missingPrice?.[12]).toBe('2000');
    expect(missingPrice?.[13]).toBe('');
    expect(missingPrice?.[15]).toBe('missing_price');
    expect(positions.some((row) => row[1] === 'deadsec')).toBe(false);
    const trades = parseCsv((files.get('trades.csv') as Buffer).toString('utf8'));
    expect(trades.find((row) => row[0] === 'trade-live')?.[8]).toBe('12');
    expect(
      trades.some((row) => row[0] === 'trade-deleted' || row[0] === 'trade-dead-security'),
    ).toBe(false);
    const prices = parseCsv((files.get('prices.csv') as Buffer).toString('utf8'));
    expect(prices.some((row) => row[0] === 'deadsec')).toBe(false);
    expect(prices.some((row) => row[0] === 'sec' && row[1] === TODAY)).toBe(false);
    expect(
      parseCsv((files.get('fx_rates.csv') as Buffer).toString('utf8')).some(
        (row) => row[1] === 'CAD',
      ),
    ).toBe(true);
    expect(
      parseCsv((files.get('savings_plans.csv') as Buffer).toString('utf8')).some(
        (row) => row[0] === 'plan',
      ),
    ).toBe(true);
  });

  it('returns header-only CSVs for an empty database', async () => {
    const response = await app.request('/api/export/csv.zip');
    const files = await readZip(Buffer.from(await response.arrayBuffer()));
    expect(files.size).toBe(12);
    expect(parseCsv((files.get('accounts.csv') as Buffer).toString('utf8'))).toHaveLength(1);
    expect(parseCsv((files.get('prices.csv') as Buffer).toString('utf8'))).toHaveLength(1);
  });

  it('holds admission for a slow client across sessions/app instances and releases on cancellation', async () => {
    const snapshots = () =>
      readdirSync(tmpdir())
        .filter(
          (name) =>
            name.startsWith('budget-export-') &&
            existsSync(join(tmpdir(), name, 'snapshot.sqlite')),
        )
        .sort();
    const before = snapshots();
    const otherApp = createApp({ webDir, auth, ledger: { db, today: () => TODAY } });
    const response = await app.request('/api/export/csv.zip');
    try {
      const refused = await otherApp.request('/api/export/csv.zip');
      expect(refused.status).toBe(429);
      expect(snapshots().filter((name) => !before.includes(name))).toHaveLength(1);
      expect(await refused.json()).toEqual({
        error: 'export_busy',
        message: 'Ein Export läuft bereits. Bitte warte, bis er abgeschlossen ist.',
      });
    } finally {
      await response.body?.cancel();
    }
    expect(snapshots()).toEqual(before);
    const retry = await otherApp.request('/api/export/csv.zip');
    expect(retry.status).toBe(200);
    await retry.arrayBuffer();
  });

  it('enforces the process cap across owners before allocating snapshots', async () => {
    const second = createTestDatabase();
    const third = createTestDatabase();
    const requestFor = (database: Db) =>
      createApp({ webDir, auth, ledger: { db: database, today: () => TODAY } }).request(
        '/api/export/csv.zip',
      );
    const firstResponse = await requestFor(db);
    const secondResponse = await requestFor(second.db);
    try {
      expect((await requestFor(third.db)).status).toBe(429);
    } finally {
      await firstResponse.body?.cancel();
      await secondResponse.body?.cancel();
    }
    const retry = await requestFor(third.db);
    expect(retry.status).toBe(200);
    await retry.arrayBuffer();
    second.close();
    third.close();
  });

  it('releases admission and removes temp files when snapshot creation fails', async () => {
    const folders = () =>
      readdirSync(tmpdir())
        .filter((name) => name.startsWith('budget-export-'))
        .sort();
    const before = folders();
    const spy = vi
      .spyOn(sqliteOf(db), 'backup')
      .mockRejectedValueOnce(new Error('Synthetic backup failure'));
    try {
      expect((await app.request('/api/export/csv.zip')).status).toBe(500);
      expect(folders()).toEqual(before);
      const retry = await app.request('/api/export/csv.zip');
      expect(retry.status).toBe(200);
      await retry.arrayBuffer();
    } finally {
      spy.mockRestore();
    }
  });

  it('releases admission on request abort before the response is consumed', async () => {
    const controller = new AbortController();
    const response = await app.request('/api/export/csv.zip', { signal: controller.signal });
    controller.abort();
    await response.body?.cancel().catch(() => undefined);
    const retry = await app.request('/api/export/csv.zip');
    expect(retry.status).toBe(200);
    await retry.arrayBuffer();
  });

  it('closes the ZIP snapshot and removes its temporary database when the client aborts', async () => {
    insertAccount({});
    db.insert(schema.security)
      .values({ id: 'large-prices', name: 'Synthetic history', kind: 'other' })
      .run();
    const history = Array.from({ length: 7000 }, (_, index) => ({
      securityId: 'large-prices',
      date: new Date(Date.UTC(2000, 0, 1 + index)).toISOString().slice(0, 10),
      priceMicro: 1_000_000 + ((index * 1_739_117) % 99_000_000),
      currency: 'EUR',
      source: 'manual' as const,
    }));
    for (let start = 0; start < history.length; start += 150) {
      db.insert(schema.price)
        .values(history.slice(start, start + 150))
        .run();
    }
    const snapshots = () =>
      readdirSync(tmpdir())
        .filter((name) => existsSync(join(tmpdir(), name, 'snapshot.sqlite')))
        .sort();
    const before = snapshots();
    const response = await app.request('/api/export/csv.zip');
    const during = snapshots().filter((name) => !before.includes(name));
    const reader = response.body?.getReader();
    try {
      expect(during).toHaveLength(1);
      const dir = join(tmpdir(), during[0] as string);
      expect(existsSync(join(dir, 'snapshot.sqlite'))).toBe(true);
      if (process.platform !== 'win32') {
        expect(statSync(dir).mode & 0o777).toBe(0o700);
        expect(statSync(join(dir, 'snapshot.sqlite')).mode & 0o777).toBe(0o600);
      }
      expect(reader).toBeDefined();
      let bytes = Buffer.alloc(0);
      let reachedPrices = false;
      while (!reachedPrices) {
        const part = await reader?.read();
        expect(part?.done).toBe(false);
        bytes = Buffer.concat([bytes, Buffer.from(part?.value ?? [])]);
        reachedPrices = bytes.includes(Buffer.from('prices.csv'));
      }
    } finally {
      await reader?.cancel().catch(() => undefined);
    }
    const after = snapshots();
    expect(after).toEqual(before);
  });

  it('rejects a late CSV source failure and removes the snapshot instead of completing a partial ZIP', async () => {
    const snapshots = () =>
      readdirSync(tmpdir())
        .filter((name) => existsSync(join(tmpdir(), name, 'snapshot.sqlite')))
        .sort();
    const before = snapshots();
    const originalFrom = Readable.from.bind(Readable);
    let sourceFinalized = false;
    let injected = false;
    const spy = vi.spyOn(Readable, 'from').mockImplementation((iterable, ...args) => {
      const isAsyncGenerator =
        typeof iterable === 'object' &&
        iterable !== null &&
        Object.prototype.toString.call(iterable) === '[object AsyncGenerator]';
      if (!injected && isAsyncGenerator) {
        injected = true;
        return originalFrom(
          (async function* () {
            try {
              yield 'partial csv row';
              throw new Error('synthetic CSV source failure');
            } finally {
              await new Promise((resolve) => setTimeout(resolve, 20));
              sourceFinalized = true;
            }
          })(),
          ...args,
        );
      }
      return originalFrom(iterable, ...args);
    });
    try {
      const response = await app.request('/api/export/csv.zip');
      await expect(response.arrayBuffer()).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
    expect(injected).toBe(true);
    expect(sourceFinalized).toBe(true);
    expect(snapshots()).toEqual(before);
  });
});
