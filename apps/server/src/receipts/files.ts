import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export const RECEIPT_LIMIT = 15 * 1024 * 1024;
export const RECEIPT_BODY_LIMIT = RECEIPT_LIMIT + 64 * 1024;
export const HASH = /^[a-f0-9]{64}$/;
export const receiptDirectory = (databasePath: string, env = process.env) =>
  resolve(env['RECEIPTS_DIR'] ?? join(dirname(databasePath), 'receipts'));
export const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export function sanitizedFilename(name: string) {
  return (
    [
      ...name
        .split(/[\\/]/)
        .at(-1)!
        .normalize('NFC')
        .replace(/[\p{Cc}\p{Cf}<>:"|?*]/gu, '_')
        .replace(/^\.+/, '')
        .trim(),
    ]
      .slice(0, 120)
      .join('') || 'Beleg'
  );
}

/** Only signatures determine the stored MIME; SVG, HTML and generic ISO media are rejected. */
export function receiptMime(b: Buffer): string {
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length >= 33 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    b.toString('ascii', 12, 16) === 'IHDR'
  )
    return 'image/png';
  if (
    b.length >= 20 &&
    b.toString('ascii', 0, 4) === 'RIFF' &&
    b.toString('ascii', 8, 12) === 'WEBP' &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(b.toString('ascii', 12, 16))
  )
    return 'image/webp';
  if (/^%PDF-1\.[0-7]|^%PDF-2\.0/.test(b.toString('ascii', 0, 8))) return 'application/pdf';
  if (b.length >= 24 && b.toString('ascii', 4, 8) === 'ftyp') {
    const end = b.readUInt32BE(0);
    if (end >= 24 && end <= b.length && end <= 4096 && (end - 16) % 4 === 0) {
      const brands = [b.toString('ascii', 8, 12)];
      for (let p = 16; p < end; p += 4) brands.push(b.toString('ascii', p, p + 4));
      if (brands.some((v) => ['avif', 'avis'].includes(v)))
        throw new RangeError('AVIF wird noch nicht unterst\u00fctzt.');
      if (brands.some((v) => ['heic', 'heix', 'hevc', 'hevx'].includes(v))) return 'image/heic';
      if (brands.some((v) => ['mif1', 'msf1'].includes(v))) return 'image/heif';
    }
  }
  throw new RangeError('Erlaubt sind JPEG, PNG, WebP, HEIC/HEIF und PDF.');
}

/** Remove metadata containers (including EXIF GPS) without decoding/recompressing image pixels. */
export function stripImageMetadata(b: Buffer, mime: string): Buffer {
  const out: Buffer[] = [];
  let chunks = 0;
  const guard = () => {
    if (++chunks > 4096) throw new RangeError('Bild hat zu viele Datenbl\u00f6cke.');
  };
  if (mime === 'image/jpeg') {
    out.push(b.subarray(0, 2));
    let p = 2;
    while (p < b.length) {
      guard();
      const start = p;
      if (b[p++] !== 0xff) throw new RangeError('Ungültiges JPEG.');
      while (b[p] === 0xff) p++;
      const marker = b[p++];
      if (marker === 0xda || marker === 0xd9) {
        out.push(b.subarray(start));
        return Buffer.concat(out);
      }
      if (marker === undefined || p + 2 > b.length) break;
      const size = b.readUInt16BE(p);
      if (size < 2 || p + size > b.length) break;
      // APP1 (EXIF/XMP), APP13 (IPTC), comments; retain colour profiles and image data.
      if (![0xe1, 0xed, 0xfe].includes(marker)) out.push(b.subarray(start, p + size));
      p += size;
    }
    throw new RangeError('Ungültiges JPEG.');
  }
  if (mime === 'image/png') {
    out.push(b.subarray(0, 8));
    let p = 8;
    while (p + 12 <= b.length) {
      guard();
      const size = b.readUInt32BE(p),
        type = b.toString('ascii', p + 4, p + 8),
        end = p + 12 + size;
      if (end > b.length) break;
      if (!['eXIf', 'tEXt', 'zTXt', 'iTXt'].includes(type)) out.push(b.subarray(p, end));
      p = end;
      if (type === 'IEND' && p === b.length) return Buffer.concat(out);
    }
    throw new RangeError('Ungültiges PNG.');
  }
  if (mime === 'image/webp') {
    if (b.readUInt32LE(4) + 8 !== b.length) throw new RangeError('Ungültiges WebP.');
    out.push(Buffer.from(b.subarray(0, 12)));
    let p = 12;
    while (p + 8 <= b.length) {
      guard();
      const type = b.toString('ascii', p, p + 4),
        size = b.readUInt32LE(p + 4),
        end = p + 8 + size + (size % 2);
      if (end > b.length) break;
      if (!['EXIF', 'XMP '].includes(type)) {
        const chunk = Buffer.from(b.subarray(p, end));
        if (type === 'VP8X') {
          if (size < 10) break;
          chunk[8] = chunk[8]! & ~0x0c;
        }
        out.push(chunk);
      }
      p = end;
    }
    if (p !== b.length) throw new RangeError('Ungültiges WebP.');
    const result = Buffer.concat(out);
    result.writeUInt32LE(result.length - 8, 4);
    return result;
  }
  return b; // HEIF and PDF metadata need a parser/decoder; documented, never rendered inline.
}

export function receiptPath(dir: string, hash: string) {
  if (!HASH.test(hash)) throw new RangeError('Invalid receipt hash');
  return join(dir, hash);
}

/** Publish complete immutable files before committing metadata; concurrent duplicates share bytes. */
export async function storeReceipt(dir: string, bytes: Buffer) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const hash = digest(bytes),
    target = receiptPath(dir, hash),
    temp = join(dir, `.upload-${randomUUID()}`);
  await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
  try {
    try {
      await link(temp, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (digest(await readFile(target)) !== hash)
        throw new Error('Receipt storage integrity failure');
    }
  } finally {
    await rm(temp, { force: true });
  }
  return hash;
}

export async function verifyReceiptFile(dir: string, hash: string, size: number) {
  const path = receiptPath(dir, hash);
  if ((await stat(path)).size !== size || size > RECEIPT_LIMIT)
    throw new Error('Receipt storage integrity failure');
  const checksum = createHash('sha256');
  for await (const chunk of createReadStream(path)) checksum.update(chunk as Buffer);
  if (checksum.digest('hex') !== hash) throw new Error('Receipt storage integrity failure');
  return path;
}
