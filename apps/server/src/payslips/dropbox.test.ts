import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTestDatabase, readInbox, readPayslipScan, type OpenedDatabase } from '@budget/db';
import { DropboxPayslipSource, dropboxContentHash, eligiblePayslipPath } from './dropbox';
import { PayslipScanner, nextPayslipScan } from './scanner';
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
      errorCode: 'scan_failed',
      nextRunAt: '2026-10-03T03:15:00.000Z',
    });
    expect(JSON.stringify(readInbox(opened.db, '2026-10-03'))).not.toContain(
      'synthetic-secret-response',
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
