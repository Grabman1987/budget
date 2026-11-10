import { createHash } from 'node:crypto';
import type * as Crypto from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { createTestDatabase, migrateDatabase, openDatabase, type OpenedDatabase } from '@budget/db';
import {
  FIXTURE_DAY,
  openApiReadFixture,
  seedApiReadFixture,
} from '../../../../scripts/perf/api-read-fixture';
import { createLedgerApi } from './index';
import baseline from './read-performance-956.responses.json';

// Pin the restart epoch at its INPUT, never strip/normalize fields from an API answer.
vi.mock('node:crypto', async (original) => ({
  ...(await original<typeof Crypto>()),
  randomUUID: () => '00000000-0000-4000-8000-000000000956',
}));

let opened: OpenedDatabase;
let directory: string;
const api = (db = opened.db) =>
  createLedgerApi({
    db,
    today: () => FIXTURE_DAY,
    bankSync: null,
    stepUp: async (_c, next) => next(),
  });

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'budget-read-956-'));
  const file = join(directory, 'synthetic.sqlite');
  const seed = openDatabase(file);
  migrateDatabase(seed.db);
  seedApiReadFixture(seed.db);
  seed.close();
  // Match the production read connection, not the fixture insertion counter.
  opened = openDatabase(file);
  // Migrating and seeding the synthetic ledger exceeds the 10 s default hook timeout on
  // loaded Windows runners (#906); the timed assertions live in the tests, not here.
}, 60_000);
afterAll(() => {
  opened.close();
  rmSync(directory, { recursive: true, force: true });
});
afterEach(() => {
  expect(opened.sqlite.prepare('select total_changes() n').get()).toEqual({ n: 0 });
});

// These are the literal response byte digests captured from the stock main API,
// not expectations computed by the optimized financial/read implementation.
it.each(baseline.responses)(
  'preserves all stock response bytes for $path',
  async ({ path, bytes, sha256 }) => {
    const response = await api().request(path);
    expect(response.status).toBe(200);
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.length).toBe(bytes);
    expect(createHash('sha256').update(body).digest('hex')).toBe(sha256);
  },
);

it('returns exactly the stock VPI reference projection without loading household ledger rows', async () => {
  const prepare = vi.spyOn(opened.sqlite, 'prepare');
  try {
    const response = await api().request('/inflation-basket/reference');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(baseline.referenceBody);
    expect(
      prepare.mock.calls.some(([sql]) => /\b(booking|booking_split|trade|holding)\b/.test(sql)),
    ).toBe(false);
  } finally {
    prepare.mockRestore();
  }
});

it('keeps an absent public reference explicitly null', async () => {
  const empty = createTestDatabase();
  try {
    const response = await api(empty.db).request('/inflation-basket/reference');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"reference":null}');
  } finally {
    empty.close();
  }
});

it('refuses an unmarked database without changing its bytes or journal mode', () => {
  const file = join(directory, 'unmarked.sqlite');
  const input = new Database(file);
  input.exec('create table app_setting (id text, value text); create table audit_log (id text)');
  expect(input.pragma('journal_mode', { simple: true })).toBe('delete');
  input.close();
  const before = readFileSync(file);
  expect(() => openApiReadFixture(file)).toThrow('Refusing an unrecognized/non-synthetic database');
  expect(readFileSync(file)).toEqual(before);
  const check = new Database(file, { readonly: true, fileMustExist: true });
  try {
    expect(check.pragma('journal_mode', { simple: true })).toBe('delete');
  } finally {
    check.close();
  }
});

it('opens even a recognized synthetic measurement database read-only', () => {
  const input = openApiReadFixture(join(directory, 'synthetic.sqlite'));
  try {
    expect(input.sqlite.readonly).toBe(true);
  } finally {
    input.close();
  }
});
