import {
  addReceipt,
  getReceipt,
  linkReceipt,
  listReceipts,
  removeReceipt,
  unlinkReceipt,
  type Db,
} from '@budget/db';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  receiptMime,
  RECEIPT_LIMIT,
  sanitizedFilename,
  storeReceipt,
  stripImageMetadata,
  verifyReceiptFile,
} from '../receipts/files';
import { ACTOR, ApiError, readBody, readQuery } from './http';

const id = z.string().uuid();
export function receiptRoutes(db: Db, dir: string) {
  const api = new Hono();
  api.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });
  api.get('/', (c) => {
    const { bookingId } = readQuery(
      c,
      z.object({ bookingId: z.string().min(1).max(128).optional() }).strict(),
    );
    return c.json({ receipts: listReceipts(db, bookingId) });
  });
  api.post('/', async (c) => {
    let form: FormData;
    try {
      form = await c.req.raw.formData();
    } catch {
      throw new ApiError(400, 'invalid', 'Ungültiger Datei-Upload.');
    }
    if (
      [...form.keys()].some((k) => !['file', 'bookingId'].includes(k)) ||
      form.getAll('file').length !== 1 ||
      form.getAll('bookingId').length > 1
    )
      throw new ApiError(400, 'invalid', 'Bitte genau einen Beleg auswählen.');
    const file = form.get('file');
    if (!(file instanceof File) || !file.size)
      throw new ApiError(400, 'invalid', 'Bitte einen Beleg auswählen.');
    if (file.size > RECEIPT_LIMIT)
      return c.json(
        { error: 'receipt_too_large', message: 'Ein Beleg darf höchstens 15 MB groß sein.' },
        413,
      );
    const bookingId = z
      .string()
      .min(1)
      .max(128)
      .optional()
      .parse(form.get('bookingId') ?? undefined);
    if (bookingId) listReceipts(db, bookingId); // Refuse unknown/deleted bookings before storing bytes.
    const raw = Buffer.from(await file.arrayBuffer()),
      mime = receiptMime(raw);
    const bytes = stripImageMetadata(raw, mime);
    const sha256 = await storeReceipt(dir, bytes);
    return c.json(
      addReceipt(
        db,
        { sha256, mime, sizeBytes: bytes.length, originalFilename: sanitizedFilename(file.name) },
        bookingId,
        { actor: ACTOR },
      ),
      201,
    );
  });
  api.post('/:id/links', async (c) => {
    const body = await readBody(c, z.object({ bookingId: z.string().min(1).max(128) }).strict());
    return c.json(linkReceipt(db, id.parse(c.req.param('id')), body.bookingId, { actor: ACTOR }));
  });
  api.delete('/:id/links/:bookingId', (c) =>
    c.json(
      unlinkReceipt(db, id.parse(c.req.param('id')), c.req.param('bookingId'), { actor: ACTOR }),
    ),
  );
  api.delete('/:id', (c) =>
    c.json(removeReceipt(db, id.parse(c.req.param('id')), { actor: ACTOR })),
  );
  api.get('/:id/:mode', async (c) => {
    const mode = z.enum(['download', 'preview']).parse(c.req.param('mode'));
    const row = getReceipt(db, id.parse(c.req.param('id')));
    const preview = mode === 'preview';
    if (preview && !['image/jpeg', 'image/png', 'image/webp'].includes(row.mime))
      throw new ApiError(404, 'not_found', 'Keine Bildvorschau verfügbar.');
    let path: string;
    try {
      path = await verifyReceiptFile(dir, row.sha256!, row.sizeBytes);
    } catch {
      throw new ApiError(
        404,
        'receipt_unavailable',
        'Belegdatei fehlt oder ist beschädigt. Bitte Sicherung prüfen.',
      );
    }
    // The download is always opaque, and its name cannot inject headers or a filesystem path.
    c.header('Content-Type', preview ? row.mime : 'application/octet-stream');
    c.header(
      'Content-Disposition',
      `${preview ? 'inline' : 'attachment'}; filename="Beleg"; filename*=UTF-8''${encodeURIComponent(sanitizedFilename(row.originalFilename ?? 'Beleg')).replace(/'/g, '%27')}`,
    );
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Content-Length', String(row.sizeBytes));
    return c.body(Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>);
  });
  return api;
}
