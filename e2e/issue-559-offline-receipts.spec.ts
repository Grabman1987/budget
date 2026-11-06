import { expect, type Page, type BrowserContextOptions, type TestInfo } from '@playwright/test';
import { buildSync } from 'esbuild';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test as ledgerTest } from './isolated-ledger';
import { PNG } from '../apps/server/src/receipts/testing';
import type * as Proof from './fixtures/offline-receipt-559';

function profileOptions(info: TestInfo): BrowserContextOptions {
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = info.project.use;
  return {
    serviceWorkers: 'block',
    ...(viewport === undefined ? {} : { viewport }),
    ...(deviceScaleFactor === undefined ? {} : { deviceScaleFactor }),
    ...(isMobile === undefined ? {} : { isMobile }),
    ...(hasTouch === undefined ? {} : { hasTouch }),
    ...(userAgent === undefined ? {} : { userAgent }),
  };
}
const test = ledgerTest.extend<{ receiptProfile: string }>({
  receiptProfile: async ({ browserName }, use) => {
    const profile = mkdtempSync(join(tmpdir(), `budget-synthetic-receipt-${browserName}-`));
    try {
      await use(profile);
    } finally {
      rmSync(profile, { recursive: true, force: true });
    }
  },
  // Real persistent profiles exercise native disk Blob storage. This WebKit build rejects even
  // a standalone Blob put in its ephemeral contexts; unsupported/private storage must fail closed.
  context: async ({ playwright, browserName, isolatedLedger, receiptProfile }, use, info) => {
    const context = await playwright[browserName].launchPersistentContext(
      receiptProfile,
      profileOptions(info),
    );
    await context.addCookies(JSON.parse(readFileSync(isolatedLedger.storageState, 'utf8')).cookies);
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
});

declare global {
  interface Window {
    queue559: typeof Proof;
    pending559: Promise<unknown>;
    release559: () => void;
    opened559: boolean;
    sent559: number;
    writes559: number;
    attempts559: ReceiptAttempt[];
    committed559: boolean;
    status559: number;
    reply559: { groupId: string };
    clearing559: Promise<void>;
    wipeOpen559: boolean;
    releaseWipe559: () => void;
  }
}
interface ReceiptAttempt {
  key: string;
  marker: string;
  name: string;
  target: string;
  bytes: number[];
  status: number;
}

/** Keep native multipart streaming intact: WebKit interception omits file bytes in route.fetch. */
async function receiptFaults(page: Page, completed: number) {
  await page.evaluate((completed) => {
    const native = window.fetch.bind(window);
    let count = completed;
    window.attempts559 = [];
    window.fetch = async (input, init) => {
      if (input !== '/api/receipts' || init?.method !== 'POST') return native(input, init);
      const form = init.body as FormData;
      const file = form.get('file') as File;
      const attempt = {
        key: new Headers(init.headers).get('Idempotency-Key')!,
        marker: String(form.get('uploadIntent')),
        name: file.name,
        target: String(form.get('bookingId')),
        bytes: [...new Uint8Array(await file.arrayBuffer())],
        status: 0,
      };
      window.attempts559.push(attempt);
      count++;
      if (count <= 2) {
        attempt.status = count === 1 ? 503 : 401;
        return Response.json(
          { error: count === 1 ? 'synthetic_unavailable' : 'unauthorized' },
          { status: attempt.status },
        );
      }
      const response = await native(input, init);
      attempt.status = response.status;
      if (count === 3) throw new DOMException('Synthetic committed timeout', 'TimeoutError');
      if (count === 4 || count === 5)
        return new Response(count === 4 ? '{' : '{}', {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      return response;
    };
  }, completed);
}
test.use({ ledgerToday: '2026-11-05' });
test.setTimeout(90_000);
const SHA = '3fd24bcfdb17a6027c5f3ed896d17a020d6ff9d9e4d06362461a9b44b6ac1b52';
const bundle = buildSync({
  entryPoints: ['e2e/fixtures/offline-receipt-559.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'queue559',
  platform: 'browser',
  write: false,
}).outputFiles[0]!.text;

async function load(page: Page, origin: string) {
  await page.route('**/__receipt-proof-559', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Synthetic queue proof</title>',
    }),
  );
  await page.goto(`${origin}/__receipt-proof-559`);
  await page.addScriptTag({ content: bundle });
}
async function restart(page: Page) {
  await page.reload();
  await page.addScriptTag({ content: bundle });
}
async function files(page: Page) {
  return page.evaluate(async () =>
    Promise.all(
      (await window.queue559.listReceiptIntents()).map(async (row) => ({
        id: row.id,
        filename: row.filename,
        bookingId: row.bookingId,
        uncertain: row.uncertain,
        reason: row.reason,
        type: row.file.type,
        bytes: [...new Uint8Array(await row.file.arrayBuffer())],
      })),
    ),
  );
}
async function enqueue(page: Page, bookingId?: string, name = 'synthetic-offline.png') {
  return page.evaluate(
    async ({ bytes, bookingId, name }) => {
      const file = new File([Uint8Array.from(bytes)], name, { type: '' });
      return (await window.queue559.enqueueReceipt(file, bookingId)).id;
    },
    { bytes: [...PNG], bookingId, name },
  );
}
const TABLES = [
  'account',
  'booking',
  'booking_split',
  'payee',
  'category',
  'expected_payment',
  'expected_payment_version',
  'booking_delivery',
  'receipt',
  'booking_receipt',
  'receipt_delivery',
  'audit_log',
];
function state(path: string) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    return Object.fromEntries(
      TABLES.map((table) => [table, db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()]),
    );
  } finally {
    db.close();
  }
}

test('native booking timeout and independent file retries commit one booking/receipt, preserve bytes and Undo', async ({
  page,
  request,
  context,
  baseURL,
  isolatedLedger,
}) => {
  const origin = baseURL!;
  const accountReply = await request.post('/api/accounts', {
    headers: { origin },
    data: {
      name: 'Synthetic queued cash',
      type: 'cash',
      openingDate: '2026-11-01',
      openingBalanceCents: 100000,
    },
  });
  expect(accountReply.status()).toBe(201);
  const accountId = (await accountReply.json()).account.id as string;
  await load(page, origin);
  const bookingKeys: string[] = [];
  let bookingReply: { id: string; groupId: string };
  await page.route('**/api/bookings', async (route) => {
    bookingKeys.push(route.request().headers()['idempotency-key']!);
    const reply = await route.fetch();
    expect(reply.status()).toBe(201);
    bookingReply = await reply.json();
    if (bookingKeys.length === 1) await route.abort('timedout');
    else await route.fulfill({ response: reply });
  });
  await context.setOffline(true);
  await page.evaluate(async (accountId) => {
    const input = {
      type: 'booking' as const,
      accountId,
      date: '2026-11-05',
      amountCents: -1375,
      payeeName: 'Synthetic queue vendor',
      memo: 'Synthetic file retry proof',
      splits: [{ amountCents: -1375, categoryId: null }],
    };
    await window.queue559.submitCapture(input, window.queue559.emptyDraft(accountId, input.date));
  }, accountId);
  await context.setOffline(false);
  await page.evaluate(() => window.queue559.sendQueue(() => {}));
  const committed = state(isolatedLedger.databasePath);
  expect(
    (committed['booking'] as { memo: string; amount_cents: number }[])
      .filter((row) => row.memo === 'Synthetic file retry proof')
      .map((row) => row.amount_cents),
  ).toEqual([-1375]);
  expect(
    (committed['payee'] as { name: string }[]).filter(
      (row) => row.name === 'Synthetic queue vendor',
    ),
  ).toHaveLength(1);
  await restart(page);
  await page.evaluate(() => window.queue559.sendQueue(() => {}));
  expect(bookingKeys).toHaveLength(2);
  expect(new Set(bookingKeys).size).toBe(1);
  expect(state(isolatedLedger.databasePath)).toEqual(committed);
  const balance = async () => {
    const response = await request.get('/api/accounts');
    return (await response.json()).accounts.find((a: { id: string }) => a.id === accountId)
      .balanceCents;
  };
  expect(await balance()).toBe(98625); // 1000.00 EUR - 13.75 EUR; literal independent oracle.
  const bookingId = bookingReply!.id;
  const attempts: ReceiptAttempt[] = [];
  await context.setOffline(true);
  const intent = await enqueue(page, bookingId);
  await restart(page);
  expect(await files(page)).toEqual([
    {
      id: intent,
      filename: 'synthetic-offline.png',
      bookingId,
      uncertain: false,
      reason: undefined,
      type: '',
      bytes: [...PNG],
    },
  ]);
  await context.setOffline(false);
  await receiptFaults(page, 0);
  await page.evaluate(() => window.queue559.sendReceiptQueue()); // 503: saved booking survives.
  expect(state(isolatedLedger.databasePath)).toEqual(committed);
  expect((await files(page))[0]).toMatchObject({
    id: intent,
    reason: 'server_unavailable',
    uncertain: true,
  });
  await page.evaluate(() => window.queue559.sendReceiptQueue()); // 401: retain file for reauthentication.
  expect((await files(page))[0]).toMatchObject({ id: intent, reason: 'login_required' });
  attempts.push(...(await page.evaluate(() => window.attempts559)));
  await restart(page);
  await receiptFaults(page, 2);
  await page.evaluate(() => window.queue559.sendReceiptQueue()); // Server commits, response times out.
  const physical = state(isolatedLedger.databasePath);
  const physicalReply = JSON.parse(
    (physical['receipt_delivery'] as { response_json: string }[])[0]!.response_json,
  ) as { groupId: string };
  expect(physical['receipt']).toHaveLength(1);
  expect(physical['booking_receipt']).toHaveLength(1);
  expect(physical['receipt_delivery']).toHaveLength(1);
  expect(physical['booking_delivery']).toHaveLength(1);
  expect((await files(page))[0]).toMatchObject({
    id: intent,
    bytes: [...PNG],
    bookingId,
    uncertain: true,
  });
  for (let retry = 0; retry < 2; retry++) {
    // Neither truncated JSON nor an incomplete reply acknowledges the persisted file.
    await page.evaluate(() => window.queue559.sendReceiptQueue());
    expect(await files(page)).toHaveLength(1);
    expect(state(isolatedLedger.databasePath)).toEqual(physical);
  }
  await page.evaluate(() => {
    const remove = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (...args) {
      if (this.name === 'files') {
        IDBObjectStore.prototype.delete = remove;
        throw new DOMException('Synthetic cleanup failure', 'QuotaExceededError');
      }
      return remove.apply(this, args);
    };
  });
  await page.evaluate(() => window.queue559.sendReceiptQueue());
  expect(await files(page)).toHaveLength(1);
  expect(state(isolatedLedger.databasePath)).toEqual(physical);
  attempts.push(...(await page.evaluate(() => window.attempts559)));
  await restart(page);
  await receiptFaults(page, 6);
  await page.evaluate(() => window.queue559.sendReceiptQueue());
  attempts.push(...(await page.evaluate(() => window.attempts559)));
  expect(await files(page)).toEqual([]);
  expect(attempts).toHaveLength(7);
  expect(attempts.map((a) => a.status)).toEqual([503, 401, 201, 201, 201, 201, 201]);
  expect(
    attempts.every(
      (a) =>
        a.key === intent &&
        a.marker === intent &&
        a.target === bookingId &&
        a.name === 'synthetic-offline.png' &&
        JSON.stringify(a.bytes) === JSON.stringify([...PNG]),
    ),
  ).toBe(true);
  expect(state(isolatedLedger.databasePath)).toEqual(physical);
  const dir = join(dirname(isolatedLedger.databasePath), 'receipts');
  expect(readdirSync(dir)).toEqual([SHA]);
  expect(readFileSync(join(dir, SHA))).toEqual(PNG);
  const undo = async (groupId: string) => {
    const response = await request.post('/api/undo', { headers: { origin }, data: { groupId } });
    expect(response.status()).toBe(200);
    return (await response.json()).groupId as string;
  };
  const receiptUndo = await undo(physicalReply!.groupId);
  expect(await balance()).toBe(98625);
  const bookingUndo = await undo(bookingReply!.groupId);
  expect(await balance()).toBe(100000);
  await undo(bookingUndo);
  await undo(receiptUndo);
  expect(await balance()).toBe(98625);
  expect(
    (state(isolatedLedger.databasePath)['receipt'] as { deleted_at: string | null }[])[0]!
      .deleted_at,
  ).toBeNull();
  expect(
    (state(isolatedLedger.databasePath)['booking_receipt'] as { deleted_at: string | null }[])[0]!
      .deleted_at,
  ).toBeNull();
  expect(readFileSync(join(dir, SHA))).toEqual(PNG);
});

test('a late booking transaction failure leaves no booking/payee/delivery/audit residue before retry', async ({
  page,
  request,
  baseURL,
  isolatedLedger,
}) => {
  const origin = baseURL!;
  const accountResponse = await request.post('/api/accounts', {
    headers: { origin },
    data: {
      name: 'Synthetic rollback cash',
      type: 'cash',
      openingDate: '2026-11-01',
      openingBalanceCents: 100000,
    },
  });
  const accountId = (await accountResponse.json()).account.id as string;
  await load(page, origin);
  const before = state(isolatedLedger.databasePath);
  const db = new Database(isolatedLedger.databasePath);
  try {
    db.exec(
      "CREATE TRIGGER synthetic_559 BEFORE INSERT ON booking_delivery BEGIN SELECT RAISE(ABORT, 'synthetic late failure'); END",
    );
    await page.evaluate(async (accountId) => {
      const input = {
        type: 'booking' as const,
        accountId,
        date: '2026-11-05',
        amountCents: -1375,
        payeeName: 'Synthetic rollback vendor',
        repeat: 'monthly' as const,
        splits: [{ amountCents: -1375, categoryId: null }],
      };
      await window.queue559.submitCapture(input, window.queue559.emptyDraft(accountId, input.date));
    }, accountId);
    expect(state(isolatedLedger.databasePath)).toEqual(before);
    expect(await page.evaluate(() => window.queue559.listQueue())).toHaveLength(1);
    db.exec('DROP TRIGGER synthetic_559');
    await page.evaluate(() => window.queue559.sendQueue(() => {}));
    expect(await page.evaluate(() => window.queue559.listQueue())).toEqual([]);
    const after = state(isolatedLedger.databasePath);
    expect(after['booking_delivery']).toHaveLength(1);
    expect(after['expected_payment_version']).toMatchObject([
      { amount_cents: 1375, valid_from: '2026-12-05', currency: 'EUR', deleted_at: null },
    ]);
    const delivery = after['booking_delivery'] as { response_json: string }[];
    const { groupId } = JSON.parse(delivery[0]!.response_json) as { groupId: string };
    const reversed = await request.post('/api/undo', { headers: { origin }, data: { groupId } });
    expect(reversed.status()).toBe(200);
    expect(
      db
        .prepare(
          "SELECT count(*) AS n FROM payee WHERE name='Synthetic rollback vendor' AND deleted_at IS NULL",
        )
        .get(),
    ).toEqual({ n: 0 });
    expect(db.prepare('SELECT count(*) AS n FROM booking_delivery').get()).toEqual({ n: 1 });
    expect(
      db.prepare('SELECT count(*) AS n FROM expected_payment WHERE deleted_at IS NULL').get(),
    ).toEqual({ n: 0 });
    expect(
      db
        .prepare('SELECT count(*) AS n FROM expected_payment_version WHERE deleted_at IS NULL')
        .get(),
    ).toEqual({ n: 0 });
  } finally {
    db.close();
  }
});

test('native cross-tab sign-out fences an enqueue paused before database open and keeps fresh files/text separate', async ({
  page,
  context,
  baseURL,
}) => {
  const origin = baseURL!;
  await load(page, origin);
  await enqueue(page, undefined, 'before-signout.png');
  await context.setOffline(true);
  await page.evaluate(() =>
    window.queue559.submitCapture(
      {
        type: 'booking',
        accountId: 'synthetic-unsent-account',
        date: '2026-11-05',
        amountCents: -250,
        splits: [{ amountCents: -250, categoryId: null }],
      },
      window.queue559.emptyDraft('synthetic-unsent-account', '2026-11-05'),
    ),
  );
  const text = await page.evaluate(() => window.queue559.listQueue());
  expect(text).toHaveLength(1);
  await context.setOffline(false);
  await page.evaluate(() => {
    const native = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args: Parameters<IDBFactory['open']>) => {
      indexedDB.open = native;
      const actual = native(...args);
      const delayed = {} as IDBOpenDBRequest;
      for (const key of ['result', 'error', 'transaction'] as const)
        Object.defineProperty(delayed, key, { get: () => actual[key] });
      actual.onupgradeneeded = (event) => delayed.onupgradeneeded?.call(delayed, event);
      actual.onerror = (event) => delayed.onerror?.call(delayed, event);
      actual.onblocked = (event) => delayed.onblocked?.call(delayed, event);
      actual.onsuccess = (event) => {
        window.opened559 = true;
        window.release559 = () => delayed.onsuccess?.call(delayed, event);
      };
      return delayed;
    };
    window.pending559 = window.queue559
      .enqueueReceipt(new File(['old-synthetic'], 'late-old.png'))
      .then(
        () => 'unexpected-save',
        (error: { code: string }) => error.code,
      );
  });
  await expect.poll(() => page.evaluate(() => window.opened559)).toBe(true);
  const other = await context.newPage();
  await load(other, origin);
  await other.evaluate(() => window.queue559.clearDeviceFinancialData());
  expect(await other.evaluate(() => window.queue559.rawFiles())).toEqual([]);
  await enqueue(other, undefined, 'fresh-after-signout.png');
  await page.evaluate(() => window.release559());
  expect(await page.evaluate(() => window.pending559)).toBe('cleared');
  expect((await other.evaluate(() => window.queue559.rawFiles())).map((r) => r.filename)).toEqual([
    'fresh-after-signout.png',
  ]);
  expect(await other.evaluate(() => window.queue559.listQueue())).toEqual(text);
  await other.close();
});

test('a committed upload callback after sign-out cannot resurrect raw files or report a stale success', async ({
  page,
  context,
  request,
  baseURL,
  isolatedLedger,
}) => {
  const origin = baseURL!;
  await load(page, origin);
  await enqueue(page);
  await page.evaluate(() => {
    const native = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await native(input, init);
      if (input === '/api/receipts' && init?.method === 'POST') {
        window.status559 = response.status;
        window.reply559 = await response.clone().json();
        window.committed559 = true;
        await new Promise<void>((resolve) => (window.release559 = resolve));
      }
      return response;
    };
    window.sent559 = window.writes559 = 0;
    window.queue559.onApiWrite(() => window.writes559++);
    window.pending559 = window.queue559.sendReceiptQueue(() => window.sent559++);
  });
  await expect.poll(() => page.evaluate(() => window.committed559)).toBe(true);
  expect(await page.evaluate(() => window.status559)).toBe(201);
  const groupId = await page.evaluate(() => window.reply559.groupId);
  const other = await context.newPage();
  try {
    await load(other, origin);
    await other.evaluate(() => window.queue559.clearDeviceFinancialData());
    await enqueue(other, undefined, 'fresh-during-old-response.png');
  } finally {
    await page.evaluate(() => window.release559());
  }
  await page.evaluate(() => window.pending559);
  expect(await page.evaluate(() => [window.sent559, window.writes559])).toEqual([0, 0]);
  expect(
    (await other.evaluate(() => window.queue559.rawFiles())).map((row) => row.filename),
  ).toEqual(['fresh-during-old-response.png']);
  const undone = await request.post('/api/undo', { headers: { origin }, data: { groupId } });
  expect(undone.status()).toBe(200);
  expect(
    (state(isolatedLedger.databasePath)['receipt'] as { deleted_at: string | null }[])[0]!
      .deleted_at,
  ).not.toBeNull();
  expect(readFileSync(join(dirname(isolatedLedger.databasePath), 'receipts', SHA))).toEqual(PNG);
  await other.close();
});

test('native file storage gives deliberate selections distinct identities and fails closed on quota or blocked storage', async ({
  page,
  baseURL,
}) => {
  await load(page, baseURL!);
  const first = await enqueue(page);
  const second = await enqueue(page);
  expect(second).not.toBe(first);
  expect((await files(page)).map((row) => row.bytes)).toEqual([[...PNG], [...PNG]]);
  await page.evaluate(() => window.queue559.clearDeviceFinancialData());
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'files') {
        IDBObjectStore.prototype.add = add;
        throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  });
  expect(
    await page.evaluate(() =>
      window.queue559.enqueueReceipt(new File(['synthetic'], 'quota.png')).then(
        () => 'unexpected-save',
        () => 'not-saved',
      ),
    ),
  ).toBe('not-saved');
  expect(await page.evaluate(() => window.queue559.rawFiles())).toEqual([]);
  expect(
    await page.evaluate(async () => {
      const get = Storage.prototype.getItem;
      Storage.prototype.getItem = () => {
        throw new DOMException('Synthetic blocked storage', 'SecurityError');
      };
      try {
        return await window.queue559.enqueueReceipt(new File(['synthetic'], 'blocked.png')).then(
          () => 'unexpected-save',
          () => 'not-saved',
        );
      } finally {
        Storage.prototype.getItem = get;
      }
    }),
  ).toBe('not-saved');
  expect(await page.evaluate(() => window.queue559.rawFiles())).toEqual([]);
  const local = await page.evaluate(() => ({ ...localStorage }));
  expect(Object.keys(local).filter((key) => key.startsWith('budget-receipt'))).toEqual([
    'budget-receipt-wipe-epoch',
  ]);
});

test('a complete browser restart retains native receipt bytes and a later sign-out removes them from disk', async ({
  page,
  context,
  playwright,
  browserName,
  receiptProfile,
  baseURL,
}, info) => {
  await load(page, baseURL!);
  const id = await enqueue(page, undefined, 'survives-native-restart.png');
  await context.close();
  const reopened = await playwright[browserName].launchPersistentContext(
    receiptProfile,
    profileOptions(info),
  );
  try {
    const restored = await reopened.newPage();
    await load(restored, baseURL!);
    expect(await files(restored)).toEqual([
      {
        id,
        filename: 'survives-native-restart.png',
        bookingId: undefined,
        uncertain: false,
        reason: undefined,
        type: '',
        bytes: [...PNG],
      },
    ]);
    await restored.evaluate(() => window.queue559.clearDeviceFinancialData());
    expect(await restored.evaluate(() => window.queue559.rawFiles())).toEqual([]);
  } finally {
    await reopened.close();
  }
});

test('repeated unavailable uploads retain readable native receipt bytes across reloads', async ({
  page,
  baseURL,
}) => {
  await load(page, baseURL!);
  const id = await enqueue(page);
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.evaluate(() => {
      window.fetch = async () => Response.json({ error: 'synthetic_unavailable' }, { status: 503 });
    });
    await page.evaluate(() => window.queue559.sendReceiptQueue());
    expect(await files(page)).toEqual([
      {
        id,
        filename: 'synthetic-offline.png',
        bookingId: undefined,
        uncertain: true,
        reason: 'server_unavailable',
        type: '',
        bytes: [...PNG],
      },
    ]);
    await restart(page);
  }
});

for (const initiator of ['same-tab', 'other-tab'] as const) {
  test(`a failed storage rotation and blocked clear revoke a held reply in ${initiator}`, async ({
    page,
    context,
    request,
    baseURL,
  }) => {
    const origin = baseURL!;
    await load(page, origin);
    await enqueue(page);
    await page.evaluate(() => {
      const native = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const response = await native(input, init);
        if (input === '/api/receipts' && init?.method === 'POST') {
          window.status559 = response.status;
          window.reply559 = await response.clone().json();
          window.committed559 = true;
          await new Promise<void>((resolve) => (window.release559 = resolve));
        }
        return response;
      };
      window.sent559 = window.writes559 = 0;
      window.queue559.onApiWrite(() => window.writes559++);
      window.pending559 = window.queue559.sendReceiptQueue(() => window.sent559++);
    });
    await expect.poll(() => page.evaluate(() => window.committed559)).toBe(true);
    expect(await page.evaluate(() => window.status559)).toBe(201);
    const groupId = await page.evaluate(() => window.reply559.groupId);
    const clearing = initiator === 'same-tab' ? page : await context.newPage();
    if (clearing !== page) await load(clearing, origin);
    await clearing.evaluate(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        throw new DOMException('Synthetic rotation failure', 'QuotaExceededError');
      };
      const native = indexedDB.open.bind(indexedDB);
      indexedDB.open = (...args: Parameters<IDBFactory['open']>) => {
        const actual = native(...args);
        if (args[0] !== 'budget-receipt-intents') return actual;
        indexedDB.open = native;
        const delayed = {} as IDBOpenDBRequest;
        for (const key of ['result', 'error', 'transaction'] as const)
          Object.defineProperty(delayed, key, { get: () => actual[key] });
        actual.onerror = (event) => delayed.onerror?.call(delayed, event);
        actual.onblocked = (event) => delayed.onblocked?.call(delayed, event);
        actual.onsuccess = (event) => {
          window.wipeOpen559 = true;
          window.releaseWipe559 = () => {
            Storage.prototype.setItem = set;
            delayed.onsuccess?.call(delayed, event);
          };
        };
        return delayed;
      };
      window.clearing559 = window.queue559.clearDeviceFinancialData();
    });
    await expect.poll(() => clearing.evaluate(() => window.wipeOpen559)).toBe(true);
    // Logical revocation is immediate locally, propagated asynchronously to a peer. Its still
    // writable storage and unchanged epoch cannot authorize the reply after propagation.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          try {
            await window.queue559.listReceiptIntents();
            return 'not-revoked';
          } catch (error) {
            return (error as { code: string }).code;
          }
        }),
      )
      .toBe('cleared');
    expect(await page.evaluate(() => localStorage.getItem('budget-receipt-wipe-epoch'))).toBeNull();
    await page.evaluate(() => window.release559());
    await page.evaluate(() => window.pending559);
    expect(await page.evaluate(() => [window.sent559, window.writes559])).toEqual([0, 0]);
    expect(await page.evaluate(() => window.queue559.rawFiles())).toHaveLength(1);
    await clearing.evaluate(() => window.releaseWipe559());
    await clearing.evaluate(() => window.clearing559);
    expect(await page.evaluate(() => window.queue559.rawFiles())).toEqual([]);
    // A successful new rotation permits fresh captures; a delayed old revocation cannot revoke it.
    await clearing.evaluate(() => window.queue559.clearDeviceFinancialData());
    await enqueue(page, undefined, 'fresh-after-failed-clear.png');
    await page.evaluate(async () => {
      const receiver = new BroadcastChannel('budget-receipt-revocations');
      const sender = new BroadcastChannel('budget-receipt-revocations');
      try {
        const received = new Promise<void>((resolve) => (receiver.onmessage = () => resolve()));
        sender.postMessage({ epochs: ['initial'] });
        await received;
      } finally {
        receiver.close();
        sender.close();
      }
    });
    expect((await files(page)).map((row) => row.filename)).toEqual([
      'fresh-after-failed-clear.png',
    ]);
    const reversed = await request.post('/api/undo', { headers: { origin }, data: { groupId } });
    expect(reversed.status()).toBe(200);
    if (clearing !== page) await clearing.close();
  });
}

for (const pause of ['open', 'lock'] as const) {
  test(`an older failed clear paused before ${pause} cannot erase a newer generation's fresh file`, async ({
    page,
    context,
    baseURL,
  }) => {
    await load(page, baseURL!);
    await enqueue(page, undefined, 'before-overlap.png');
    const newer = await context.newPage();
    await load(newer, baseURL!);
    await page.evaluate((pause) => {
      if (pause === 'open') {
        const native = indexedDB.open.bind(indexedDB);
        indexedDB.open = (...args: Parameters<IDBFactory['open']>) => {
          indexedDB.open = native;
          const actual = native(...args);
          const delayed = {} as IDBOpenDBRequest;
          for (const key of ['result', 'error', 'transaction'] as const)
            Object.defineProperty(delayed, key, { get: () => actual[key] });
          actual.onerror = (event) => delayed.onerror?.call(delayed, event);
          actual.onblocked = (event) => delayed.onblocked?.call(delayed, event);
          actual.onsuccess = (event) => {
            window.opened559 = true;
            window.release559 = () => delayed.onsuccess?.call(delayed, event);
          };
          return delayed;
        };
      } else {
        const native = navigator.locks.request.bind(navigator.locks);
        navigator.locks.request = ((...args: Parameters<LockManager['request']>) => {
          navigator.locks.request = native;
          window.opened559 = true;
          return new Promise<void>((resolve) => (window.release559 = resolve)).then(() =>
            native(...args),
          );
        }) as LockManager['request'];
      }
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        throw new DOMException('Synthetic rotation failure', 'QuotaExceededError');
      };
      window.pending559 = window.queue559.clearReceiptIntents().then(
        () => 'unexpected-success',
        (error: { code: string }) => error.code,
      );
      Storage.prototype.setItem = set;
    }, pause);
    await expect.poll(() => page.evaluate(() => window.opened559)).toBe(true);
    await newer.evaluate(() => {
      window.committed559 = false;
      window.clearing559 = window.queue559.clearReceiptIntents().then(() => {
        window.committed559 = true;
      });
    });
    const freshEpoch = await newer.evaluate(() =>
      localStorage.getItem('budget-receipt-wipe-epoch'),
    );
    expect(freshEpoch).toMatch(/^[a-f\d-]{36}$/);
    if (pause === 'lock') {
      // The stale clear has not acquired its lock; the newer clear can finish and capture first.
      await newer.evaluate(() => window.clearing559);
      await enqueue(newer, undefined, 'after-overlap.png');
    } else {
      // Physical clears serialize while the older database open is held. The new epoch cannot
      // capture until its own database fence is committed, even after the sign-out time bound.
      expect(await newer.evaluate(() => window.committed559)).toBe(false);
      expect(
        await newer.evaluate(() =>
          window.queue559.enqueueReceipt(new File(['not-durable'], 'too-early.png')).then(
            () => 'unexpected-save',
            (error: { code: string }) => error.code,
          ),
        ),
      ).toBe('cleared');
    }
    await page.evaluate(() => window.release559());
    expect(await page.evaluate(() => window.pending559)).toBe('unavailable');
    await newer.evaluate(() => window.clearing559);
    if (pause === 'open') await enqueue(newer, undefined, 'after-overlap.png');
    expect((await files(newer)).map((row) => [row.filename, row.bytes])).toEqual([
      ['after-overlap.png', [...PNG]],
    ]);
    expect(await newer.evaluate(() => localStorage.getItem('budget-receipt-wipe-epoch'))).toBe(
      freshEpoch,
    );
    await newer.close();
  });
}

test('without Web Locks new raw-file capture and delivery fail closed while clearing remains possible', async ({
  page,
  baseURL,
}) => {
  await load(page, baseURL!);
  await enqueue(page);
  expect(
    await page.evaluate(async () => {
      const locks = navigator.locks;
      Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
      try {
        const outcomes: string[] = [];
        for (const action of [
          () => window.queue559.enqueueReceipt(new File(['synthetic'], 'unsupported.png')),
          () => window.queue559.sendReceiptQueue(),
        ]) {
          try {
            await action();
            outcomes.push('unexpected-success');
          } catch (error) {
            outcomes.push((error as { code: string }).code);
          }
        }
        await window.queue559.clearReceiptIntents();
        return outcomes;
      } finally {
        Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
      }
    }),
  ).toEqual(['unavailable', 'unavailable']);
  expect(await page.evaluate(() => window.queue559.rawFiles())).toEqual([]);
});
