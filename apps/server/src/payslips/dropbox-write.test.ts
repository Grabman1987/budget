import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDatabase, readInbox, schema, type OpenedDatabase } from '@budget/db';
import {
  DropboxPayslipSource,
  dropboxContentHash,
  dropboxConfigured,
  dropboxTargetPath,
  dropboxTargetYear,
  dropboxWriteEnabled,
} from './dropbox';
import { PayslipScanner } from './scanner';
import { PayslipIntakeService } from './service';
import { syntheticPayslipPdf } from './testing';

let opened: OpenedDatabase, dir: string;
beforeEach(async () => {
  opened = createTestDatabase();
  dir = await mkdtemp(join(tmpdir(), 'budget-write-'));
});
afterEach(async () => {
  opened.close();
  await rm(dir, { recursive: true, force: true });
});
const env = { DROPBOX_TOKEN: 'synthetic-write-token', DROPBOX_PAYSLIP_ROOT: '/synthetic' };
const notFound = () =>
  Response.json({ error_summary: 'path/not_found/..', error: { '.tag': 'path' } }, { status: 409 });
type Call = { url: string; init?: RequestInit };
/** Synthetic Dropbox: metadata answers via `existing`, uploads via `upload`. */
function fakeDropbox(
  options: {
    existing?: () => Response;
    upload?: () => Response;
  } = {},
) {
  const calls: Call[] = [];
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    calls.push({ url: String(url), ...(init ? { init } : {}) });
    if (String(url).endsWith('/get_metadata')) return (options.existing ?? notFound)();
    if (String(url).endsWith('/files/upload'))
      return (options.upload ?? (() => Response.json({ name: 'synthetic.pdf' })))();
    throw new Error('unexpected request ' + String(url));
  });
  return { calls, fetcher, uploads: () => calls.filter((c) => c.url.endsWith('/files/upload')) };
}
const writer = (fetcher: typeof fetch) => new DropboxPayslipSource(env, fetcher);
const service = (dropbox?: DropboxPayslipSource) =>
  new PayslipIntakeService(
    opened.db,
    dir,
    'synthetic-pdf-password',
    dropbox,
    () => new Date('2031-05-05T10:00:00Z'),
  );
const apiArg = (call: Call) =>
  JSON.parse(new Headers(call.init?.headers).get('Dropbox-API-Arg')!) as Record<string, unknown>;

describe('Dropbox write-back flag', () => {
  it('requires configuration and the explicit flag', () => {
    expect(dropboxConfigured(env)).toBe(true);
    expect(dropboxWriteEnabled(env)).toBe(false);
    expect(dropboxWriteEnabled({ ...env, DROPBOX_PAYSLIP_WRITE: '0' })).toBe(false);
    expect(dropboxWriteEnabled({ ...env, DROPBOX_PAYSLIP_WRITE: '1' })).toBe(true);
    expect(dropboxWriteEnabled({ DROPBOX_PAYSLIP_WRITE: '1' })).toBe(false);
  });
});
describe('target path', () => {
  it('uses the parsed Abrechnungsmonat year, then filename YYYYMM, then the current year', () => {
    const now = new Date('2031-05-05T10:00:00Z');
    expect(dropboxTargetYear({ draft: { month: '2026-09' } }, 'x-202701.pdf', now)).toBe('2026');
    expect(dropboxTargetYear({ draft: null }, 'x-202701.pdf', now)).toBe('2027');
    expect(dropboxTargetYear({ draft: null }, 'x-209913.pdf', now)).toBe('2031');
    expect(dropboxTargetYear({ draft: null }, 'plain.pdf', now)).toBe('2031');
    expect(dropboxTargetPath('/synthetic/', '2026', 'a.pdf')).toBe('/synthetic/2026/a.pdf');
    expect(dropboxTargetPath('/synthetic', '2026', 'a/b\\c')).toBe('/synthetic/2026/a_b_c.pdf');
  });
});
describe('manual upload copy to Dropbox', { timeout: 60_000 }, () => {
  it('stores the original encrypted bytes unchanged at <root>/<year>/<name>', async () => {
    const bytes = await syntheticPayslipPdf(),
      dropbox = fakeDropbox();
    const result = await service(writer(dropbox.fetcher)).ingest(
      bytes,
      'original name.pdf',
      'manual',
    );
    expect(result).toMatchObject({ duplicate: false, dropboxCopy: 'saved' });
    const [upload] = dropbox.uploads();
    expect(upload).toBeDefined();
    expect(apiArg(upload!)).toMatchObject({
      path: '/synthetic/2026/original name.pdf',
      mode: 'add',
      autorename: true,
      mute: true,
    });
    expect(new Headers(upload!.init?.headers).get('authorization')).toBe(
      'Bearer synthetic-write-token',
    );
    expect(Buffer.from(upload!.init?.body as Uint8Array).equals(bytes)).toBe(true);
    expect(bytes.includes(Buffer.from('/Encrypt'))).toBe(true);
  });
  it('falls back to the filename year when the content has no Abrechnungsmonat', async () => {
    const bytes = await syntheticPayslipPdf(['LGV Lohnart', 'Auszahlung 1,00']),
      dropbox = fakeDropbox();
    await service(writer(dropbox.fetcher)).ingest(bytes, 'synthetic-202701.pdf', 'manual');
    expect(apiArg(dropbox.uploads()[0]!)['path']).toBe('/synthetic/2027/synthetic-202701.pdf');
  });
  it('skips the upload when identical content is already at the target', async () => {
    const bytes = await syntheticPayslipPdf(),
      dropbox = fakeDropbox({
        existing: () => Response.json({ name: 'a.pdf', content_hash: dropboxContentHash(bytes) }),
      });
    const result = await service(writer(dropbox.fetcher)).ingest(bytes, 'a.pdf', 'manual');
    expect(result.dropboxCopy).toBe('saved');
    expect(dropbox.uploads()).toHaveLength(0);
  });
  it('uploads again (Dropbox autorenames) when a different file has the same name', async () => {
    const bytes = await syntheticPayslipPdf(),
      dropbox = fakeDropbox({
        existing: () => Response.json({ name: 'a.pdf', content_hash: '0'.repeat(64) }),
      });
    await service(writer(dropbox.fetcher)).ingest(bytes, 'a.pdf', 'manual');
    expect(dropbox.uploads()).toHaveLength(1);
  });
  it('does not fail the upload when Dropbox fails, and leaves a visible, sanitized warning', async () => {
    const bytes = await syntheticPayslipPdf(),
      dropbox = fakeDropbox({
        upload: () => new Response('synthetic-secret-response', { status: 403 }),
      });
    const result = await service(writer(dropbox.fetcher)).ingest(bytes, 'a.pdf', 'manual');
    expect(result).toMatchObject({ duplicate: false, dropboxCopy: 'failed' });
    expect(opened.db.select().from(schema.payslipIntake).all()).toHaveLength(1);
    const inbox = JSON.stringify(readInbox(opened.db, '2026-10-03'));
    expect(inbox).toContain('Dropbox-Ablage fehlgeschlagen');
    expect(inbox).not.toContain('synthetic-secret-response');
    const down = vi.fn<typeof fetch>(async () => {
      throw new Error('synthetic network failure');
    });
    const second = await syntheticPayslipPdf(['Abrechnungsmonat: 08/2026', 'Auszahlung 1,00']);
    expect((await service(writer(down)).ingest(second, 'b.pdf', 'manual')).dropboxCopy).toBe(
      'failed',
    );
  });
  it('does nothing when write-back is off and for duplicates', async () => {
    const bytes = await syntheticPayslipPdf(),
      dropbox = fakeDropbox();
    expect((await service(undefined).ingest(bytes, 'a.pdf', 'manual')).dropboxCopy).toBe('off');
    const again = await service(writer(dropbox.fetcher)).ingest(bytes, 'a.pdf', 'manual');
    expect(again).toMatchObject({ duplicate: true, dropboxCopy: 'off' });
    expect(dropbox.calls).toHaveLength(0);
  });
  it('never writes back files that were fetched from Dropbox', async () => {
    const bytes = await syntheticPayslipPdf(),
      dropbox = fakeDropbox();
    const result = await service(writer(dropbox.fetcher)).ingest(bytes, 'a.pdf', 'dropbox');
    expect(result.dropboxCopy).toBe('off');
    expect(dropbox.calls).toHaveLength(0);
  });
  it('lets the nightly scan skip the uploaded copy through SHA-256 deduplication', async () => {
    const bytes = await syntheticPayslipPdf(),
      dropbox = fakeDropbox();
    const intake = service(writer(dropbox.fetcher));
    await intake.ingest(bytes, 'a.pdf', 'manual');
    expect(dropbox.uploads()).toHaveLength(1);
    let downloads = 0;
    const scanFetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith('/download')) {
        downloads++;
        return new Response(new Uint8Array(bytes));
      }
      return Response.json({
        entries: [
          {
            '.tag': 'file',
            name: 'a.pdf',
            path_lower: '/synthetic/2026/a.pdf',
            id: 'id:synthetic',
            rev: 'synthetic-rev',
            content_hash: dropboxContentHash(bytes),
            size: bytes.length,
          },
        ],
        cursor: 'synthetic-cursor',
        has_more: false,
      });
    });
    await new PayslipScanner(opened.db, new DropboxPayslipSource(env, scanFetcher), intake).tick(
      new Date('2026-10-04T03:00:00Z'),
    );
    expect(downloads).toBeLessThanOrEqual(1);
    expect(opened.db.select().from(schema.payslipIntake).all()).toHaveLength(1);
    expect(readInbox(opened.db, '2026-10-04').count).toBe(1);
    expect(dropbox.uploads()).toHaveLength(1); // the fetched copy is never re-uploaded
  });
});
