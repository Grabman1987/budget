import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createTestDatabase,
  findPayslipIntake,
  readInbox,
  readPayslipScan,
  type OpenedDatabase,
} from '@budget/db';
import { DropboxPayslipSource, dropboxContentHash, eligiblePayslipPath } from './dropbox';
import { PayslipScanner, nextPayslipScan } from './scanner';
import { isScanFailure } from './scan-error';
import { PayslipIntakeService } from './service';
import { syntheticPayslipPdf } from './testing';

let opened: OpenedDatabase, dir: string;
beforeEach(async () => {
  opened = createTestDatabase();
  dir = await mkdtemp(join(tmpdir(), 'budget-scan-'));
});
afterEach(async () => {
  opened.close();
  await rm(dir, { recursive: true, force: true });
});
const env = { DROPBOX_TOKEN: 'synthetic-read-token', DROPBOX_PAYSLIP_ROOT: '/synthetic' };
const intake = () => new PayslipIntakeService(opened.db, dir, 'synthetic-pdf-password');
const file = (bytes: Buffer, path = '/synthetic/2099/synthetic.pdf') => ({
  '.tag': 'file',
  name: 'synthetic.pdf',
  path_lower: path,
  id: 'id:synthetic',
  rev: 'synthetic-rev',
  content_hash: dropboxContentHash(bytes),
  size: bytes.length,
});
describe('read-only Dropbox payroll source', () => {
  it('accepts root PDFs and all four-digit years, excludes other trees and non-PDFs', () => {
    for (const path of [
      '/synthetic/file.pdf',
      '/synthetic/2026/file.pdf',
      '/synthetic/2027/file.pdf',
      '/synthetic/2099/nested/file.PDF',
    ])
      expect(eligiblePayslipPath('/synthetic', path)).toBe(true);
    for (const path of [
      '/synthetic/notes/file.pdf',
      '/synthetic-other/2026/file.pdf',
      '/synthetic/2099/file.txt',
    ])
      expect(eligiblePayslipPath('/synthetic', path)).toBe(false);
  });
  it('scans recursively, processes cursor pages and skips previously seen content on incremental scans', async () => {
    const bytes = await syntheticPayslipPdf(),
      bodies: unknown[] = [];
    let listings = 0,
      downloads = 0;
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toMatch(/\/files\/(list_folder(?:\/continue)?|download)$/);
      if (String(url).endsWith('/download')) {
        downloads++;
        return new Response(new Uint8Array(bytes));
      }
      bodies.push(JSON.parse(String(init?.body)));
      listings++;
      return Response.json({
        entries: [
          file(
            bytes,
            listings === 1 ? '/synthetic/synthetic.pdf' : '/synthetic/2099/synthetic.pdf',
          ),
        ],
        cursor: 'synthetic-cursor-' + listings,
        has_more: listings === 1,
      });
    });
    const scanner = new PayslipScanner(opened.db, new DropboxPayslipSource(env, fetcher), intake());
    await scanner.tick(new Date('2026-10-03T02:30:00Z'));
    expect(bodies).toEqual([
      { path: '/synthetic', recursive: true, include_deleted: true, limit: 1000 },
      { cursor: 'synthetic-cursor-1' },
    ]);
    expect(downloads).toBe(1);
    expect(readInbox(opened.db, '2026-10-03').count).toBe(1);
    expect(readPayslipScan(opened.db)).toMatchObject({
      filesFound: 2,
      cursor: 'synthetic-cursor-2',
      errors: 0,
      nextRunAt: '2026-10-04T02:30:00.000Z',
    });
    await scanner.tick(new Date('2026-10-04T02:30:00Z'));
    expect(bodies.at(-1)).toEqual({ cursor: 'synthetic-cursor-2' });
    expect(downloads).toBe(1);
  });
  it('keeps the previous page cursor on failed download and sanitizes upstream errors', async () => {
    const bytes = await syntheticPayslipPdf();
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith('/download')
        ? new Response('synthetic-secret-response', { status: 401 })
        : Response.json({ entries: [file(bytes)], cursor: 'must-not-advance', has_more: false }),
    );
    await new PayslipScanner(opened.db, new DropboxPayslipSource(env, fetcher), intake()).tick(
      new Date('2026-10-03T03:00:00Z'),
    );
    expect(readPayslipScan(opened.db)).toMatchObject({
      cursor: null,
      errors: 1,
      errorCode: 'dropbox_auth',
      nextRunAt: '2026-10-03T03:15:00.000Z',
    });
    expect(JSON.stringify(readInbox(opened.db, '2026-10-03'))).not.toContain(
      'synthetic-secret-response',
    );
  });
  it('downloads the pinned revision and classifies a missing scope without leaking the response', async () => {
    const bytes = await syntheticPayslipPdf();
    const args: unknown[] = [];
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith('/download')) {
        args.push(JSON.parse(new Headers(init?.headers).get('Dropbox-API-Arg')!));
        return new Response(
          '{"error_summary":"missing_scope/..","error":{".tag":"missing_scope","required_scope":"synthetic-secret-scope"}}',
          { status: 403 },
        );
      }
      return Response.json({ entries: [file(bytes)], cursor: 'must-not-advance', has_more: false });
    });
    await new PayslipScanner(opened.db, new DropboxPayslipSource(env, fetcher), intake()).tick(
      new Date('2026-10-03T03:00:00Z'),
    );
    expect(args).toEqual([{ path: 'rev:synthetic-rev' }]);
    const scan = readPayslipScan(opened.db);
    expect(scan).toMatchObject({ cursor: null, errors: 1, errorCode: 'dropbox_scope' });
    expect(isScanFailure(scan?.errorCode)).toBe(true);
    const inbox = JSON.stringify(readInbox(opened.db, '2026-10-03'));
    expect(inbox).toContain('(dropbox_scope)');
    expect(inbox).not.toContain('synthetic-secret-scope');
    expect(inbox).not.toContain('synthetic.pdf');
  });
  it('classifies rate limits and a missing file by status and allowlisted reason only', async () => {
    const bytes = await syntheticPayslipPdf();
    const run = async (status: number, body: string) => {
      const db = createTestDatabase();
      try {
        const fetcher = vi.fn<typeof fetch>(async (url) =>
          String(url).endsWith('/download')
            ? new Response(body, { status })
            : Response.json({ entries: [file(bytes)], cursor: 'c', has_more: false }),
        );
        await new PayslipScanner(
          db.db,
          new DropboxPayslipSource(env, fetcher),
          new PayslipIntakeService(db.db, dir),
        ).tick(new Date('2026-10-03T03:00:00Z'));
        return readPayslipScan(db.db);
      } finally {
        db.close();
      }
    };
    expect(await run(429, 'synthetic-too-many')).toMatchObject({ errorCode: 'dropbox_rate' });
    // A vanished file will never download: skip it, advance and report a document warning.
    expect(await run(409, '{"error_summary":"path/not_found/.."}')).toMatchObject({
      errorCode: 'document_warning',
      cursor: 'c',
      errors: 1,
    });
    expect(await run(500, 'synthetic-server-error')).toMatchObject({
      errorCode: 'dropbox_download',
      cursor: null,
    });
  });
  it('skips bytes that are not a PDF, advances the cursor and still stores the next file', async () => {
    const pdf = await syntheticPayslipPdf();
    const junk = Buffer.from('synthetic-not-a-pdf');
    const bad = {
      ...file(junk, '/synthetic/2099/synthetic-bad-name.pdf'),
      name: 'synthetic-bad-name.pdf',
      rev: 'bad-rev',
    };
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith('/download')) {
        const arg = new Headers(init?.headers).get('Dropbox-API-Arg')!;
        return new Response(new Uint8Array(arg.includes('bad-rev') ? junk : pdf));
      }
      return Response.json({
        entries: [bad, file(pdf)],
        cursor: 'after-bad-file',
        has_more: false,
      });
    });
    await new PayslipScanner(opened.db, new DropboxPayslipSource(env, fetcher), intake()).tick(
      new Date('2026-10-03T03:00:00Z'),
    );
    expect(findPayslipIntake(opened.db, undefined, dropboxContentHash(pdf))).toBeTruthy();
    expect(findPayslipIntake(opened.db, undefined, dropboxContentHash(junk))).toBeUndefined();
    const scan = readPayslipScan(opened.db);
    expect(scan).toMatchObject({
      cursor: 'after-bad-file',
      filesFound: 2,
      errors: 1,
      errorCode: 'document_warning',
    });
    expect(isScanFailure(scan?.errorCode)).toBe(false);
    const inbox = JSON.stringify(readInbox(opened.db, '2026-10-03'));
    expect(inbox).toContain('(pdf_format)');
    expect(inbox).not.toContain('synthetic-bad-name');
    expect(inbox).not.toContain('synthetic-not-a-pdf');
  });
  it('keeps the cursor after a storage failure but still tries the files behind it', async () => {
    const pdf = await syntheticPayslipPdf();
    const other = await syntheticPayslipPdf(['Abrechnungsmonat: 08/2026']);
    const ingest = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('synthetic-path-detail'), { code: 'EACCES' }))
      .mockResolvedValueOnce({ id: undefined });
    const fetcher = vi.fn<typeof fetch>(async (url, init) =>
      String(url).endsWith('/download')
        ? new Response(
            new Uint8Array(
              new Headers(init?.headers).get('Dropbox-API-Arg')!.includes('second') ? other : pdf,
            ),
          )
        : Response.json({
            entries: [file(pdf), { ...file(other), rev: 'second-rev' }],
            cursor: 'must-not-advance',
            has_more: false,
          }),
    );
    await new PayslipScanner(opened.db, new DropboxPayslipSource(env, fetcher), {
      ingest,
    } as unknown as PayslipIntakeService).tick(new Date('2026-10-03T03:00:00Z'));
    expect(ingest).toHaveBeenCalledTimes(2);
    expect(readPayslipScan(opened.db)).toMatchObject({
      cursor: null,
      errors: 1,
      errorCode: 'storage',
      nextRunAt: '2026-10-03T03:15:00.000Z',
    });
    expect(JSON.stringify(readInbox(opened.db, '2026-10-03'))).not.toContain(
      'synthetic-path-detail',
    );
  });
  it('obtains offline access with refresh credentials, and verifies downloaded content hash', async () => {
    const bytes = await syntheticPayslipPdf();
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith('/token')) {
        const body = new URLSearchParams(String(init?.body));
        expect(body.get('grant_type')).toBe('refresh_token');
        expect(body.get('refresh_token')).toBe('synthetic-refresh');
        return Response.json({ access_token: 'synthetic-access' });
      }
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic-access');
      return new Response(new Uint8Array(bytes));
    });
    const source = new DropboxPayslipSource(
      {
        DROPBOX_PAYSLIP_ROOT: '/synthetic',
        DROPBOX_REFRESH_TOKEN: 'synthetic-refresh',
        DROPBOX_APP_KEY: 'synthetic-app',
        DROPBOX_APP_SECRET: 'synthetic-secret',
      },
      fetcher,
    );
    expect(await source.download(file(bytes))).toEqual(bytes);
    await expect(source.download({ ...file(bytes), content_hash: '0'.repeat(64) })).rejects.toThrow(
      'integrity',
    );
  });
  it('schedules a single nightly run and catches up overdue scans', () => {
    expect(nextPayslipScan(new Date('2026-10-03T02:29:00Z'))).toBe('2026-10-03T02:30:00.000Z');
    expect(nextPayslipScan(new Date('2026-10-03T02:30:00Z'))).toBe('2026-10-04T02:30:00.000Z');
  });
  it('recovers an expired cursor and skips oversized files without blocking progress', async () => {
    const bytes = await syntheticPayslipPdf();
    let calls = 0;
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith('/download')) return new Response(new Uint8Array(bytes));
      calls++;
      if (calls === 1)
        return Response.json({ entries: [], cursor: 'expired-synthetic-cursor', has_more: false });
      if (calls === 2) {
        expect(JSON.parse(String(init?.body))).toEqual({ cursor: 'expired-synthetic-cursor' });
        return Response.json({ error: { '.tag': 'reset' } }, { status: 409 });
      }
      expect(JSON.parse(String(init?.body))).toMatchObject({ recursive: true, path: '/synthetic' });
      return Response.json({
        entries: [{ ...file(bytes), size: 16 * 1024 * 1024 }],
        cursor: 'rescan-cursor',
        has_more: false,
      });
    });
    const scanner = new PayslipScanner(opened.db, new DropboxPayslipSource(env, fetcher), intake());
    await scanner.tick(new Date('2026-10-03T03:00:00Z'));
    await scanner.tick(new Date('2026-10-04T03:00:00Z'));
    expect(readPayslipScan(opened.db)).toMatchObject({
      cursor: 'rescan-cursor',
      errors: 1,
      errorCode: 'document_warning',
    });
    expect(readInbox(opened.db, '2026-10-04').count).toBe(1);
  });
});
