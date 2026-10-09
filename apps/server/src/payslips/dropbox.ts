import { createHash } from 'node:crypto';
import { z } from 'zod';
import { RECEIPT_LIMIT } from '../receipts/files';

export const dropboxConfigured = (env = process.env) =>
  Boolean(
    env['DROPBOX_PAYSLIP_ROOT'] &&
    (env['DROPBOX_TOKEN'] ||
      (env['DROPBOX_REFRESH_TOKEN'] && env['DROPBOX_APP_KEY'] && env['DROPBOX_APP_SECRET'])),
  );
/** Optional write-back of manual uploads; needs `files.content.write` and an explicit flag. */
export const dropboxWriteEnabled = (env = process.env) =>
  dropboxConfigured(env) && env['DROPBOX_PAYSLIP_WRITE'] === '1';
const entry = z.object({
  '.tag': z.string(),
  name: z.string(),
  path_lower: z.string().optional(),
  id: z.string().optional(),
  rev: z.string().optional(),
  content_hash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  size: z.number().int().nonnegative().optional(),
});
const page = z.object({
  entries: z.array(entry).max(2000),
  cursor: z.string().max(20000),
  has_more: z.boolean(),
});
export type DropboxEntry = z.infer<typeof entry>;
/** Provider error reasons that may be kept; anything else in an error body is discarded. */
export const DROPBOX_REASONS = [
  'missing_scope',
  'expired_access_token',
  'invalid_access_token',
  'invalid_grant',
  'path/not_found',
  'path/malformed_path',
  'too_many_requests',
] as const;
export type DropboxReason = (typeof DROPBOX_REASONS)[number];
export class DropboxError extends Error {
  constructor(
    readonly code: 'provider' | 'cursor_reset' | 'size' | 'integrity' | 'not_found',
    /** HTTP status of the failed response, when there was one. */
    readonly status?: number,
    readonly reason?: DropboxReason,
  ) {
    super(code);
  }
}
/** Allowlisted reason from a bounded error body (`.tag` / `error_summary` values only). */
function dropboxReason(body: string, status: number): DropboxReason | undefined {
  if (status === 429) return 'too_many_requests';
  // Both the `.tag` form (`"missing_scope"`) and the `error_summary` form (`"path/not_found/.."`).
  for (const reason of DROPBOX_REASONS)
    if (
      new RegExp(
        String.raw`"(?:\.tag|error_summary)"\s*:\s*"(?:path/)?${reason.replace('path/', '')}(?:[/."]|$)`,
      ).test(body)
    )
      return reason;
  return undefined;
}
/** Dropbox hashes SHA-256 hashes of 4 MiB blocks, then hashes their concatenation. */
export function dropboxContentHash(bytes: Buffer) {
  const hashes: Buffer[] = [];
  for (let i = 0; i < bytes.length; i += 4 * 1024 * 1024)
    hashes.push(
      createHash('sha256')
        .update(bytes.subarray(i, i + 4 * 1024 * 1024))
        .digest(),
    );
  return createHash('sha256').update(Buffer.concat(hashes)).digest('hex');
}
/** Target year: parsed Abrechnungsmonat, else filename YYYYMM, else the current year. */
export function dropboxTargetYear(
  parsed: { draft: { month: string } | null },
  filename: string,
  now = new Date(),
) {
  const fromDraft = parsed.draft?.month.match(/^(20\d{2})-(?:0[1-9]|1[0-2])$/);
  if (fromDraft) return fromDraft[1]!;
  const fromName = filename.match(/(?:^|\D)(20\d{2})(?:0[1-9]|1[0-2])(?:\D|$)/);
  return fromName ? fromName[1]! : String(now.getUTCFullYear());
}
/** `<root>/<YYYY>/<original name>`; the name is already sanitized to a single path segment. */
export function dropboxTargetPath(root: string, year: string, filename: string) {
  const name = filename.replace(/[\\/]/g, '_');
  return `${root.replace(/\/$/, '')}/${year}/${/\.pdf$/i.test(name) ? name : name + '.pdf'}`;
}
export function eligiblePayslipPath(root: string, path: string) {
  const base = root.replace(/\/$/, '').toLowerCase(),
    full = path.toLowerCase();
  if (!full.startsWith(base + '/')) return false;
  const parts = full.slice(base.length + 1).split('/');
  return /\.pdf$/i.test(parts.at(-1) ?? '') && (parts.length === 1 || /^\d{4}$/.test(parts[0]!));
}
/** Year of the first path segment below the root when it is a four-digit folder; else null. */
export function payslipFolderYear(root: string, path: string) {
  const base = root.replace(/\/$/, '').toLowerCase(),
    parts = path
      .toLowerCase()
      .slice(base.length + 1)
      .split('/');
  return parts.length > 1 && /^\d{4}$/.test(parts[0]!) ? Number(parts[0]) : null;
}
async function boundedBody(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new DropboxError('provider');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) throw new DropboxError('size');
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}
export class DropboxPayslipSource {
  private cachedToken: { value: string; until: number } | undefined;
  constructor(
    private readonly env = process.env,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  get root() {
    return this.env['DROPBOX_PAYSLIP_ROOT']!.replace(/\/$/, '');
  }
  private async request(url: string, init: RequestInit, limit: number) {
    try {
      const response = await this.fetcher(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        // Read only a bounded error to classify it; never retain or expose provider text.
        const body = await boundedBody(response, 32768)
          .then((b) => b.toString())
          .catch(() => '');
        if (
          response.status === 409 &&
          url.endsWith('/list_folder/continue') &&
          /"(?:\.tag|error_summary)"\s*:\s*"reset/.test(body)
        )
          throw new DropboxError('cursor_reset', response.status);
        if (
          response.status === 409 &&
          url.endsWith('/get_metadata') &&
          /"(?:\.tag|error_summary)"\s*:\s*"(?:path\/)?not_found/.test(body)
        )
          throw new DropboxError('not_found', response.status);
        throw new DropboxError('provider', response.status, dropboxReason(body, response.status));
      }
      return await boundedBody(response, limit);
    } catch (error) {
      if (error instanceof DropboxError) throw error;
      throw new DropboxError('provider');
    }
  }
  private async token() {
    if (this.env['DROPBOX_TOKEN']) return this.env['DROPBOX_TOKEN'];
    if (this.cachedToken && this.cachedToken.until > Date.now()) return this.cachedToken.value;
    const bytes = await this.request(
      'https://api.dropboxapi.com/oauth2/token',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.env['DROPBOX_REFRESH_TOKEN']!,
          client_id: this.env['DROPBOX_APP_KEY']!,
          client_secret: this.env['DROPBOX_APP_SECRET']!,
        }).toString(),
      },
      32768,
    );
    const result = z
      .object({ access_token: z.string().min(1), expires_in: z.number().positive().optional() })
      .parse(JSON.parse(bytes.toString()));
    this.cachedToken = {
      value: result.access_token,
      until: Date.now() + Math.max(0, (result.expires_in ?? 3600) - 60) * 1000,
    };
    return result.access_token;
  }
  async list(cursor: string | null) {
    const token = await this.token();
    const bytes = await this.request(
      'https://api.dropboxapi.com/2/files/' + (cursor ? 'list_folder/continue' : 'list_folder'),
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(
          cursor
            ? { cursor }
            : { path: this.root, recursive: true, include_deleted: true, limit: 1000 },
        ),
      },
      2 * 1024 * 1024,
    );
    return page.parse(JSON.parse(bytes.toString()));
  }
  async download(file: DropboxEntry) {
    if (!file.id || !file.rev || !file.content_hash || file.size === undefined)
      throw new DropboxError('provider');
    if (file.size > RECEIPT_LIMIT) throw new DropboxError('size');
    const token = await this.token();
    const bytes = await this.request(
      'https://content.dropboxapi.com/2/files/download',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({ path: 'rev:' + file.rev }),
        },
      },
      RECEIPT_LIMIT,
    );
    if (bytes.length !== file.size || dropboxContentHash(bytes) !== file.content_hash)
      throw new DropboxError('integrity');
    return bytes;
  }
  /**
   * Store the original bytes unchanged at `path`. Never overwrites: an identical file already
   * there counts as stored; a different file with the same name makes Dropbox rename the new one.
   */
  async upload(path: string, bytes: Buffer): Promise<'saved' | 'exists'> {
    if (bytes.length > RECEIPT_LIMIT) throw new DropboxError('size');
    const token = await this.token();
    try {
      const meta = await this.request(
        'https://api.dropboxapi.com/2/files/get_metadata',
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ path }),
        },
        64 * 1024,
      );
      const existing = z
        .object({ content_hash: z.string().optional() })
        .safeParse(JSON.parse(meta.toString()));
      if (existing.success && existing.data.content_hash === dropboxContentHash(bytes))
        return 'exists';
    } catch (error) {
      if (!(error instanceof DropboxError && error.code === 'not_found')) throw error;
    }
    await this.request(
      'https://content.dropboxapi.com/2/files/upload',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({
            path,
            mode: 'add',
            autorename: true,
            mute: true,
            strict_conflict: false,
          }),
        },
        body: new Uint8Array(bytes),
      },
      64 * 1024,
    );
    return 'saved';
  }
}
