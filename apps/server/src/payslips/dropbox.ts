import { createHash } from 'node:crypto';
import { z } from 'zod';
import { RECEIPT_LIMIT } from '../receipts/files';

export const dropboxConfigured = (env = process.env) =>
  Boolean(
    env['DROPBOX_PAYSLIP_ROOT'] &&
    (env['DROPBOX_TOKEN'] ||
      (env['DROPBOX_REFRESH_TOKEN'] && env['DROPBOX_APP_KEY'] && env['DROPBOX_APP_SECRET'])),
  );
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
export class DropboxError extends Error {
  constructor(readonly code: 'provider' | 'cursor_reset' | 'size' | 'integrity') {
    super(code);
  }
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
export function eligiblePayslipPath(root: string, path: string) {
  const base = root.replace(/\/$/, '').toLowerCase(),
    full = path.toLowerCase();
  if (!full.startsWith(base + '/')) return false;
  const parts = full.slice(base.length + 1).split('/');
  return /\.pdf$/i.test(parts.at(-1) ?? '') && (parts.length === 1 || /^\d{4}$/.test(parts[0]!));
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
        // Read only a bounded error to detect cursor reset; never retain or expose provider text.
        if (response.status === 409 && url.endsWith('/list_folder/continue')) {
          const b = await boundedBody(response, 32768);
          if (/"(?:\.tag|error_summary)"\s*:\s*"reset/.test(b.toString()))
            throw new DropboxError('cursor_reset');
        }
        await response.body?.cancel();
        throw new DropboxError('provider');
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
          'Dropbox-API-Arg': JSON.stringify({ path: file.id, rev: file.rev }),
        },
      },
      RECEIPT_LIMIT,
    );
    if (bytes.length !== file.size || dropboxContentHash(bytes) !== file.content_hash)
      throw new DropboxError('integrity');
    return bytes;
  }
}
