import { describe, expect, it } from 'vitest';
import {
  digest,
  receiptDirectory,
  receiptMime,
  receiptPath,
  sanitizedFilename,
  stripImageMetadata,
} from './files';

import { PDF, PNG } from './testing';

const pngChunk = (type: string, text: string) => {
  const data = Buffer.from(text),
    chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 'ascii');
  data.copy(chunk, 8);
  return chunk; // Metadata is dropped, so its CRC never reaches an image decoder.
};
describe('receipt signatures and metadata', () => {
  it('trusts bytes, rejects SVG/HTML/empty and unsupported ISO media', () => {
    expect(receiptMime(PNG)).toBe('image/png');
    expect(receiptMime(PDF)).toBe('application/pdf');
    const heic = Buffer.from('000000186674797068656963000000006d69663168656963', 'hex');
    expect(receiptMime(heic)).toBe('image/heic');
    expect(
      receiptMime(Buffer.from('00000018667479706d696631000000006d6966316d736631', 'hex')),
    ).toBe('image/heif');
    for (const data of [
      Buffer.alloc(0),
      Buffer.from('<svg/>'),
      Buffer.from('<html/>'),
      Buffer.from('000000186674797069736f6d0000000069736f6d6d703431', 'hex'),
    ])
      expect(() => receiptMime(data)).toThrow();
  });
  it('removes JPEG APP1 GPS, PNG EXIF/text and WebP EXIF/XMP without recompressing', () => {
    const jpeg = Buffer.from([
      0xff,
      0xd8,
      0xff,
      0xe1,
      0,
      10,
      ...Buffer.from('ExifGPS!'),
      0xff,
      0xda,
      0,
      2,
      1,
      2,
      0xff,
      0xd9,
    ]);
    expect(stripImageMetadata(jpeg, receiptMime(jpeg))).toEqual(
      Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 1, 2, 0xff, 0xd9]),
    );
    const png = Buffer.concat([
      PNG.subarray(0, 33),
      pngChunk('eXIf', 'GPS synthetic'),
      pngChunk('iTXt', 'XMP synthetic'),
      PNG.subarray(33),
    ]);
    expect(stripImageMetadata(png, 'image/png')).toEqual(PNG);
    const webp = Buffer.from(
      '524946462000000057454250565038580a0000000c00000000000000000045584946020000000102',
      'hex',
    );
    const stripped = stripImageMetadata(webp, 'image/webp');
    expect(stripped.toString('ascii')).not.toContain('EXIF');
    expect(stripped[20]).toBe(0);
    expect(stripped.readUInt32LE(4)).toBe(stripped.length - 8);
  });
  it('bounds parser work even for a file full of empty metadata chunks', () => {
    const image = Buffer.concat([
      PNG.subarray(0, 33),
      ...Array.from({ length: 4097 }, () => pngChunk('tEXt', '')),
      PNG.subarray(33),
    ]);
    expect(() => stripImageMetadata(image, 'image/png')).toThrow(/Datenbl/);
  });
  it('refuses truncated image chunks and preserves documented HEIC/PDF bytes', () => {
    expect(() => stripImageMetadata(PNG.subarray(0, 40), 'image/png')).toThrow();
    expect(() =>
      stripImageMetadata(Buffer.from([255, 216, 255, 225, 0, 30]), 'image/jpeg'),
    ).toThrow();
    expect(stripImageMetadata(PDF, 'application/pdf')).toEqual(PDF);
  });
  it('bounds filenames and prevents traversal in storage keys', () => {
    expect(sanitizedFilename('C:\\fakepath\\../../..\\Beleg\r\n".pdf')).toBe('Beleg___.pdf');
    expect(sanitizedFilename('.')).toBe('Beleg');
    expect(sanitizedFilename('x'.repeat(200)).length).toBe(120);
    expect(() =>
      encodeURIComponent(sanitizedFilename('x' + '\u{1f600}'.repeat(100))),
    ).not.toThrow();
    expect(() => receiptPath('receipts', '../other')).toThrow();
    expect(digest(PNG)).toMatch(/^[a-f0-9]{64}$/);
    expect(receiptDirectory('/data/budget.sqlite', {})).toMatch(/[\\/]data[\\/]receipts$/);
  });
});
