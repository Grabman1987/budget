import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { acquireMaintenanceLock, lockPathFor } from './lock';

const dir = mkdtempSync(join(tmpdir(), 'budget-lock-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const path = join(dir, '.maintenance.lock');

it('is exclusive, released explicitly, and has no lock for in-memory databases', async () => {
  expect(lockPathFor(':memory:')).toBeUndefined();
  expect(lockPathFor(join(dir, 'budget.sqlite'))).toBe(path);
  const first = await acquireMaintenanceLock(path);
  expect(first).toBeDefined();
  expect(await acquireMaintenanceLock(path)).toBeUndefined();
  await first!();
  expect(existsSync(path)).toBe(false);
  const again = await acquireMaintenanceLock(path);
  expect(again).toBeDefined();
  await again!();
  const none = await acquireMaintenanceLock(undefined);
  expect(await none!()).toBeUndefined();
});

it('takes over a lock whose process is gone or which is older than any job can run', async () => {
  writeFileSync(path, `2147483646 ${Date.now()}`);
  const dead = await acquireMaintenanceLock(path);
  expect(dead).toBeDefined();
  await dead!();
  writeFileSync(path, `${process.pid} ${Date.now() - 4 * 3_600_000}`);
  const old = await acquireMaintenanceLock(path);
  expect(old).toBeDefined();
  await old!();
  writeFileSync(path, 'garbage');
  const broken = await acquireMaintenanceLock(path);
  expect(broken).toBeDefined();
  await broken!();
  writeFileSync(path, `${process.pid} ${Date.now()}`);
  expect(await acquireMaintenanceLock(path)).toBeUndefined();
  rmSync(path);
});
