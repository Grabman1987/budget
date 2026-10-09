import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  accounts,
  createTestDatabase,
  findPayslipIntake,
  getPayslipIntake,
  readInbox,
  savePayslip,
  type OpenedDatabase,
} from '@budget/db';
import { DropboxPayslipSource, dropboxContentHash } from './dropbox';
import { PayslipScanner } from './scanner';
import { PayslipIntakeService } from './service';
import { syntheticPayslipPdf, syntheticWageRows } from './testing';

// Synthetic data only. The records start is derived from the earliest account: 2023-10.
let opened: OpenedDatabase, dir: string;
beforeEach(async () => {
  opened = createTestDatabase();
  dir = await mkdtemp(join(tmpdir(), 'budget-scope-'));
});
afterEach(async () => {
  opened.close();
  await rm(dir, { recursive: true, force: true });
});
const env = { DROPBOX_TOKEN: 'synthetic-read-token', DROPBOX_PAYSLIP_ROOT: '/synthetic' };
const intake = () => new PayslipIntakeService(opened.db, dir, 'synthetic-pdf-password');
const openAccount = () =>
  accounts.create(
    opened.db,
    {
      id: 'synthetic-account',
      name: 'Synthetisches Konto',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2023-10-01',
      openingBalanceCents: 0,
    },
    { actor: 'test' },
  );
const month = (value: string) =>
  syntheticPayslipPdf(syntheticWageRows.map((r) => r.replace('09/2026', value)));
type Item = { path: string; bytes: Buffer };
const hash = (i: Item) => dropboxContentHash(i.bytes);
const status = (i: Item) => findPayslipIntake(opened.db, undefined, hash(i))?.status;
const NOW = new Date('2026-10-09T02:30:00Z');

/** One listing with all items; records which paths were downloaded. */
function source(items: Item[]) {
  const downloaded: string[] = [];
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith('/download')) {
      const rev = JSON.parse(new Headers(init?.headers).get('Dropbox-API-Arg')!).path.slice(4);
      const hit = items.find((i) => hash(i) === rev)!;
      downloaded.push(hit.path);
      return new Response(new Uint8Array(hit.bytes));
    }
    return Response.json({
      entries: items.map((i) => ({
        '.tag': 'file',
        name: 'synthetic.pdf',
        path_lower: i.path,
        id: 'id:' + hash(i).slice(0, 8),
        rev: hash(i),
        content_hash: hash(i),
        size: i.bytes.length,
      })),
      cursor: 'synthetic-cursor',
      has_more: false,
    });
  });
  return {
    downloaded,
    scanner: () => new PayslipScanner(opened.db, new DropboxPayslipSource(env, fetcher), intake()),
  };
}
const openTasks = () =>
  readInbox(opened.db, '2026-10-09').entries.flatMap((e) =>
    e.type === 'stored' && e.refType === 'payslip-intake' ? [e] : [],
  );

describe('payslip scan scope', () => {
  it('does not stage or download year folders before the records start, but takes new years', async () => {
    openAccount();
    const old = { path: '/synthetic/2019/old.pdf', bytes: await month('03/2019') };
    const fresh = { path: '/synthetic/2027/new.pdf', bytes: await month('01/2027') };
    const { downloaded, scanner } = source([old, fresh]);
    const s = scanner();
    await s.tick(NOW);
    expect(downloaded).toEqual([fresh.path]);
    expect(status(old)).toBeUndefined();
    expect(status(fresh)).toBe('pending');
    expect(s.lastRun.skippedBeforeStart).toBe(1);
  });

  it('uses the read period inside the start year folder', async () => {
    openAccount();
    const before = { path: '/synthetic/2023/before.pdf', bytes: await month('08/2023') };
    const after = { path: '/synthetic/2023/after.pdf', bytes: await month('11/2023') };
    const s = source([before, after]).scanner();
    await s.tick(NOW);
    expect(status(before)).toBeUndefined();
    expect(status(after)).toBe('pending');
    expect(s.lastRun.skippedBeforeStart).toBe(1);
  });

  it('marks a month that is already recorded as done instead of pending', async () => {
    openAccount();
    const first = await intake().ingest(await month('09/2026'), 'manual.pdf', 'manual');
    savePayslip(
      opened.db,
      { ...getPayslipIntake(opened.db, first.id).parsed.draft!, receiptId: null },
      { actor: 'test' },
    );
    const dup = { path: '/synthetic/2026/dup.pdf', bytes: await month('09/2026') };
    const s = source([dup]).scanner();
    await s.tick(NOW);
    expect(status(dup)).toBe('rejected');
    expect(s.lastRun.alreadyRecorded).toBe(1);
    // The owner's manual upload stays reviewable; only the scanned duplicate is closed.
    expect(openTasks().map((e) => e.refId)).toEqual([first.id]);
    const closed = findPayslipIntake(opened.db, undefined, hash(dup))!;
    expect(closed.deletedAt).toBeNull();
  });

  it('tidies pending intakes that were created before the scope rules', async () => {
    // No account yet: nothing is filtered, everything becomes pending (the old behaviour).
    const old = {
      path: '/synthetic/2019/old.pdf',
      bytes: await syntheticPayslipPdf(['Fremdes Layout']),
    };
    const early = { path: '/synthetic/2023/early.pdf', bytes: await month('02/2023') };
    const booked = { path: '/synthetic/2026/booked.pdf', bytes: await month('09/2026') };
    const keep = { path: '/synthetic/2027/keep.pdf', bytes: await month('01/2027') };
    const items = [old, early, booked, keep];
    for (const i of items) await intake().ingest(i.bytes, 'x.pdf', 'dropbox', hash(i));
    expect(items.map(status)).toEqual(['pending', 'pending', 'pending', 'pending']);

    openAccount();
    const bookedRow = findPayslipIntake(opened.db, undefined, hash(booked))!;
    savePayslip(
      opened.db,
      { ...getPayslipIntake(opened.db, bookedRow.id).parsed.draft!, receiptId: null },
      { actor: 'test' },
    );
    const { downloaded, scanner } = source(items);
    const s = scanner();
    await s.tick(NOW);
    expect(downloaded).toEqual([]);
    expect(items.map(status)).toEqual(['rejected', 'rejected', 'rejected', 'pending']);
    expect(s.lastRun).toEqual({ skippedBeforeStart: 2, alreadyRecorded: 1 });
    // Only the open one is left in the inbox; nothing was deleted.
    expect(openTasks().map((e) => e.refId)).toEqual([
      findPayslipIntake(opened.db, undefined, hash(keep))!.id,
    ]);
    // The next run is gated by the nightly schedule and changes nothing.
    await s.tick(new Date('2026-10-09T03:00:00Z'));
    expect(items.map(status)).toEqual(['rejected', 'rejected', 'rejected', 'pending']);
  });
});
