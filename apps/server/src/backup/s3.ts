import { createHash, createHmac } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

/**
 * Minimal S3 client (PUT, list, DELETE) with AWS Signature Version 4, enough for the encrypted
 * backup. Path-style URLs (`<endpoint>/<bucket>/<key>`), which Tigris and every S3-compatible
 * store accept. No SDK: a few dozen lines are easier to audit than a large dependency tree.
 */
export interface S3Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface SignInput {
  method: string;
  url: URL;
  /** Extra headers to sign (lower-case names); `host` is added. */
  headers: Record<string, string>;
  payloadHash: string;
  date: Date;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
}

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) =>
  createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding as SigV4 wants it (`encodeURIComponent` leaves `!'()*` alone). */
const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** `YYYYMMDDTHHMMSSZ` */
export const amzDate = (date: Date) => date.toISOString().replace(/[-:]|\.\d{3}/g, '');

/** The `Authorization` header value for a request. */
export function signV4(input: SignInput): string {
  const stamp = amzDate(input.date);
  const day = stamp.slice(0, 8);
  const headers: Record<string, string> = { host: input.url.host };
  for (const [name, value] of Object.entries(input.headers)) headers[name.toLowerCase()] = value;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${String(headers[n]).trim()}\n`).join('');
  const signedHeaders = names.join(';');
  const query = [...input.url.searchParams.entries()]
    .map(([k, v]) => [encode(k), encode(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const path = input.url.pathname
    .split('/')
    .map((segment) => encode(decodeURIComponent(segment)))
    .join('/');
  const canonicalRequest = [
    input.method,
    path || '/',
    query,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join('\n');
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256(canonicalRequest)].join('\n');
  const key = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), input.service),
    'aws4_request',
  );
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

const ERROR_CODES = new Set([
  'AccessDenied',
  'NoSuchBucket',
  'InvalidAccessKeyId',
  'SignatureDoesNotMatch',
  'RequestTimeTooSkewed',
  'RequestTimeout',
  'SlowDown',
  'InternalError',
  'ServiceUnavailable',
]);
export class S3Error extends Error {
  constructor(readonly code: string) {
    super(
      ERROR_CODES.has(code) || ['Timeout', 'NetworkError', 'InvalidResponse'].includes(code)
        ? `Objektspeicher: ${code}. Bitte die Sicherungskonfiguration und Verbindung prüfen.`
        : 'Objektspeicher: Anfrage fehlgeschlagen. Bitte die Sicherungskonfiguration und Verbindung prüfen.',
    );
  }
}

/** Never forward arbitrary provider, driver or child-process exception text. */
export const safeBackupMessage = (error: unknown): string =>
  error instanceof S3Error
    ? new S3Error(error.code).message
    : 'Sicherung fehlgeschlagen. Bitte die Sicherungskonfiguration prüfen.';

async function boundedText(response: Response, limit: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) return Buffer.concat(chunks).toString('utf8');
      bytes += part.value.byteLength;
      if (bytes > limit) throw new S3Error('InvalidResponse');
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export class S3Client {
  constructor(
    private readonly config: S3Config,
    private readonly clock: () => Date = () => new Date(),
    private readonly timeoutMs = 30_000,
  ) {}

  private url(key = '', query: Record<string, string> = {}): URL {
    const base = this.config.endpoint.replace(/\/+$/, '');
    const url = new URL(
      `${base}/${encode(this.config.bucket)}/${key.split('/').map(encode).join('/')}`,
    );
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return url;
  }

  private async send(
    method: string,
    url: URL,
    body?: Buffer,
    file?: { path: string; hash: string; size: number },
  ): Promise<string> {
    const payloadHash = file?.hash ?? sha256(body ?? '');
    const date = this.clock();
    const headers: Record<string, string> = {
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate(date),
    };
    if (file) headers['content-length'] = String(file.size);
    const authorization = signV4({
      method,
      url,
      headers,
      payloadHash,
      date,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: this.config.region,
      service: 's3',
    });
    const controller = new AbortController();
    // Streamed archives grow with the receipts; allow about 1 s per MiB on top of the base timeout.
    const timeoutMs = file
      ? this.timeoutMs + Math.ceil(file.size / 1_048_576) * 1000
      : this.timeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: { ...headers, authorization },
        signal: controller.signal,
        redirect: 'error',
        ...(file
          ? { body: createReadStream(file.path), duplex: 'half' }
          : body
            ? { body: new Uint8Array(body) }
            : {}),
      });
      if (!response.ok) {
        const text = await boundedText(response, 4096);
        const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1] ?? '';
        throw new S3Error(ERROR_CODES.has(code) ? code : 'UnknownError');
      }
      if (method === 'GET') return await boundedText(response, 1024 * 1024);
      await response.body?.cancel();
      return '';
    } catch (error) {
      if (controller.signal.aborted) throw new S3Error('Timeout');
      throw error instanceof S3Error ? error : new S3Error('NetworkError');
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  async put(key: string, body: Buffer): Promise<void> {
    await this.send('PUT', this.url(key), body);
  }

  /** Hash then stream ciphertext; archive size must not determine the server's RAM use. */
  async putFile(key: string, path: string): Promise<void> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    await this.send('PUT', this.url(key), undefined, {
      path,
      hash: hash.digest('hex'),
      size: (await stat(path)).size,
    });
  }

  async delete(key: string): Promise<void> {
    await this.send('DELETE', this.url(key));
  }

  /** All keys below `prefix` (ListObjectsV2, follows continuation tokens). */
  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const query: Record<string, string> = { 'list-type': '2', prefix };
      if (token) query['continuation-token'] = token;
      const xml = await this.send('GET', this.url('', query));
      if (!xml.includes('<ListBucketResult') || !xml.includes('</ListBucketResult>'))
        throw new S3Error('InvalidResponse');
      for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g))
        keys.push(unescapeXml(match[1] as string));
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
        ? /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1]
        : undefined;
    } while (token);
    return keys;
  }
}

const unescapeXml = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
