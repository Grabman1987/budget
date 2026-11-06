import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { sha256Hex } from '../auth/crypto';
import { createAuth } from '../auth/routes';
import { AuthStore } from '../auth/store';
import { S3Client } from '../backup/s3';
import { backupConfigFromEnv } from '../backup/backup';
import { admitExport } from './export-admission';

vi.mock('../backup/backup', () => ({
  backupConfigFromEnv: vi.fn(() => ({ prefix: 'encrypted/', s3: {} })),
}));

let database: OpenedDatabase;
let app: ReturnType<typeof createApp>;
let files: string[];
const now = new Date('2026-11-06T12:00:00Z');
const ciphertext = Buffer.from('age-encryption.org/v1\n-> synthetic encrypted fixture');
beforeEach(() => {
  database = createTestDatabase();
  files = [];
  const store = new AuthStore(database.db);
  const passkeyId = store.insertPasskey({
    credentialId: 'synthetic-credential',
    publicKey: Buffer.from('synthetic-public-key').toString('base64url'),
    counter: 0,
    deviceName: 'Synthetic device',
    createdAt: now.toISOString(),
  });
  for (const [token, recovery, fresh] of [
    ['fresh', false, true],
    ['stale', false, false],
    ['recovery', true, true],
  ] as const)
    store.createSession({
      id: sha256Hex(token),
      passkeyId: recovery ? null : passkeyId,
      now,
      expiresAt: new Date('2026-11-07T12:00:00Z'),
      stepUp: fresh,
      viaRecovery: recovery,
    });
  const auth = createAuth({
    store,
    clock: () => now,
    config: {
      rpID: 'localhost',
      rpName: 'Budget',
      origin: 'http://localhost:3000',
      cookieSecure: false,
      setupToken: undefined,
      trustProxy: false,
      sessionDays: 30,
      sessionMaxDays: 90,
      stepUpMinutes: 5,
      pepper: Buffer.from('synthetic-pepper-0123456789abcdef'),
    },
  });
  app = createApp({
    webDir: join(tmpdir(), 'synthetic-backup-web'),
    auth,
    ledger: { db: database.db },
  });
  vi.spyOn(S3Client.prototype, 'list').mockResolvedValue([
    'encrypted/budget-2026-11-04.tar.age',
    'encrypted/budget-2026-11-05.tar.age',
    'encrypted/budget-2026-11-06.sqlite',
    'encrypted/budget-2026-11-06.tar.age.partial',
    'other/budget-2026-11-06.tar.age',
  ]);
  vi.spyOn(S3Client.prototype, 'getEncryptedFile').mockImplementation(async (_key, path) => {
    files.push(path);
    await writeFile(path, ciphertext);
    return ciphertext.length;
  });
});
afterEach(async () => {
  for (const file of files) await expect(access(file)).rejects.toThrow();
  database.close();
  vi.restoreAllMocks();
});
const get = (token?: string, signal?: AbortSignal) =>
  app.request('/api/export/backup.age', {
    headers: token ? { cookie: `budget_session=${token}` } : {},
    ...(signal ? { signal } : {}),
  });

it.each([
  [undefined, 401, 'unauthorized'],
  ['stale', 403, 'step_up_required'],
  ['recovery', 403, 'passkey_required'],
] as const)('refuses %s before accessing storage', async (token, status, error) => {
  const response = await get(token);
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ error });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(S3Client.prototype.list).not.toHaveBeenCalled();
  expect(S3Client.prototype.getEncryptedFile).not.toHaveBeenCalled();
});

it('streams the latest completed ciphertext with safe headers and no financial writes', async () => {
  const before = database.db.select().from(schema.auditLog).all();
  const response = await get('fresh');
  expect(response.status).toBe(200);
  expect(response.headers.get('content-disposition')).toBe(
    'attachment; filename="budget-2026-11-05.tar.age"',
  );
  expect(response.headers.get('content-type')).toBe('application/octet-stream');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(Buffer.from(await response.arrayBuffer())).toEqual(ciphertext);
  expect(database.db.select().from(schema.auditLog).all()).toEqual(before);
  expect(S3Client.prototype.getEncryptedFile).toHaveBeenCalledWith(
    'encrypted/budget-2026-11-05.tar.age',
    expect.any(String),
    expect.any(AbortSignal),
  );
});

it('reports an absent or incomplete artifact without serving another format', async () => {
  vi.mocked(S3Client.prototype.list).mockResolvedValue([
    'encrypted/budget-2026-11-06.tar.age.partial',
  ]);
  const response = await get('fresh');
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: 'backup_missing' });
  expect(S3Client.prototype.getEncryptedFile).not.toHaveBeenCalled();
});

it('fails closed when encrypted backup storage is not configured', async () => {
  vi.mocked(backupConfigFromEnv).mockReturnValueOnce(undefined);
  const response = await get('fresh');
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'backup_unavailable' });
  expect(S3Client.prototype.list).not.toHaveBeenCalled();
  expect(S3Client.prototype.getEncryptedFile).not.toHaveBeenCalled();
});

it('redacts storage/integrity failures, removes partial files and allows retry', async () => {
  vi.mocked(S3Client.prototype.getEncryptedFile).mockImplementationOnce(async (_key, path) => {
    files.push(path);
    await writeFile(path, 'synthetic partial');
    throw new Error('synthetic credential and storage path must not escape');
  });
  const response = await get('fresh');
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'backup_unavailable' });
  expect(response.headers.has('content-disposition')).toBe(false);
  const retry = await get('fresh');
  expect(retry.status).toBe(200);
  await retry.arrayBuffer();
});

it('shares admission with CSV exports and releases it after response cancellation', async () => {
  const release = admitExport(database.db)!;
  expect((await get('fresh')).status).toBe(429);
  expect(S3Client.prototype.list).not.toHaveBeenCalled();
  release();
  const response = await get('fresh');
  await response.body!.cancel();
  const next = await get('fresh');
  expect(next.status).toBe(200);
  await next.arrayBuffer();
});

it('rejects HEAD before storage or admission because it cannot consume a download stream', async () => {
  const response = await app.request('/api/export/backup.age', {
    method: 'HEAD',
    headers: { cookie: 'budget_session=fresh' },
  });
  expect(response.status).toBe(405);
  expect(response.headers.get('allow')).toBe('GET');
  expect(S3Client.prototype.list).not.toHaveBeenCalled();
  expect(S3Client.prototype.getEncryptedFile).not.toHaveBeenCalled();
  const next = await get('fresh');
  expect(next.status).toBe(200);
  await next.arrayBuffer();
});

it('cleans up and releases admission when the HTTP client disconnects', async () => {
  vi.mocked(S3Client.prototype.getEncryptedFile).mockImplementationOnce(async (_key, path) => {
    files.push(path);
    await writeFile(path, Buffer.alloc(256 * 1024));
    return 256 * 1024;
  });
  const controller = new AbortController();
  const response = await get('fresh', controller.signal);
  controller.abort();
  await expect(response.arrayBuffer()).rejects.toThrow();
  const retry = await get('fresh');
  expect(retry.status).toBe(200);
  await retry.arrayBuffer();
});
