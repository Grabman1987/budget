import {
  addReceipt,
  getReceipt,
  linkReceipt,
  listReceipts,
  removeReceipt,
  receiptDelivery,
  runInTransaction,
  type Executor,
  unlinkReceipt,
  type Db,
} from '@budget/db';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  digest,
  receiptMime,
  RECEIPT_LIMIT,
  sanitizedFilename,
  storeReceipt,
  stripImageMetadata,
  verifyReceiptFile,
} from '../receipts/files';
import { ACTOR, ApiError, readBody, readQuery } from './http';
import { PdfPreviewError, receiptPdfPreview, type PdfPreviewCode } from '../receipts/pdf-preview';

const previewMessages: Record<PdfPreviewCode, string> = {
  password: 'Das PDF benötigt ein anderes Passwort.',
  page: 'Diese PDF-Seite ist nicht vorhanden.',
  limit: 'Die PDF-Vorschau überschreitet ein Verarbeitungslimit. Das Original bleibt verfügbar.',
  busy: 'Eine PDF-Vorschau wird gerade erstellt. Bitte erneut versuchen.',
  unavailable: 'Für dieses PDF ist keine Vorschau verfügbar. Das Original bleibt verfügbar.',
  source_changed: 'Der Beleg ist nicht mehr unverändert verfügbar. Bitte neu öffnen.',
  aborted: 'Die PDF-Vorschau wurde abgebrochen.',
};

const id = z.string().uuid();
type UploadReply = ReturnType<typeof addReceipt>;
function previousUpload(db: Executor, key: string, requestHash: string): UploadReply | undefined {
  const previous = db.select().from(receiptDelivery).where(eq(receiptDelivery.key, key)).get();
  if (!previous) return undefined;
  if (previous.requestHash !== requestHash)
    throw new ApiError(
      409,
      'idempotency_conflict',
      'Dieser Beleg wurde bereits mit anderen Feldern gesendet.',
    );
  return JSON.parse(previous.responseJson) as UploadReply;
}
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
    const key = c.req.header('Idempotency-Key');
    if (key !== undefined && !/^[a-zA-Z0-9-]{16,80}$/.test(key))
      throw new ApiError(400, 'invalid', 'Ungültiger Sendeschlüssel.');
    let form: FormData;
    try {
      form = await c.req.raw.formData();
    } catch {
      throw new ApiError(400, 'invalid', 'Ungültiger Datei-Upload.');
    }
    if (
      [...form.keys()].some((k) => !['file', 'bookingId', 'uploadIntent'].includes(k)) ||
      form.getAll('file').length !== 1 ||
      form.getAll('bookingId').length > 1 ||
      form.getAll('uploadIntent').length > 1
    )
      throw new ApiError(400, 'invalid', 'Bitte genau einen Beleg auswählen.');
    // New offline clients send both: older servers reject the unknown field instead of
    // silently ignoring a retry key after application rollback.
    const intent = form.get('uploadIntent');
    if (intent !== null && (typeof intent !== 'string' || !key || intent !== key))
      throw new ApiError(400, 'invalid', 'Ungültiger Sendeschlüssel.');
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
    const raw = Buffer.from(await file.arrayBuffer()),
      mime = receiptMime(raw);
    const originalFilename = sanitizedFilename(file.name);
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify([
          'receipt-upload-v1',
          digest(raw),
          mime,
          originalFilename,
          bookingId ?? null,
        ]),
      )
      .digest('hex');
    if (key) {
      const previous = previousUpload(db, key, requestHash);
      if (previous) return c.json(previous, 201);
    }
    // A cached reply remains an acknowledgement, even if its original action was undone.
    if (bookingId) listReceipts(db, bookingId); // Refuse unknown/deleted bookings before storing bytes.
    const bytes = stripImageMetadata(raw, mime);
    const sha256 = await storeReceipt(dir, bytes);
    const data = { sha256, mime, sizeBytes: bytes.length, originalFilename };
    if (!key) return c.json(addReceipt(db, data, bookingId, { actor: ACTOR }), 201);
    const response = runInTransaction(db, (tx) => {
      // Publishing immutable bytes awaits I/O: another upload may have committed meanwhile.
      const previous = previousUpload(tx, key, requestHash);
      if (previous) return previous;
      const result = addReceipt(tx, data, bookingId, { actor: ACTOR });
      tx.insert(receiptDelivery)
        .values({ key, requestHash, responseJson: JSON.stringify(result) })
        .run();
      return result;
    });
    return c.json(response, 201);
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
  // Read-only POST keeps transient passwords out of URLs; ordinary auth/origin/body guards apply.
  api.post('/:id/pdf-preview', async (c) => {
    const receiptId = id.parse(c.req.param('id'));
    const input = await readBody(
      c,
      z
        .object({
          page: z.number().int().min(1).max(30),
          preset: z.enum(['fit', 'detail']).default('fit'),
          password: z.string().max(1024).optional(),
        })
        .strict(),
    );
    try {
      const preview = await receiptPdfPreview(
        db,
        dir,
        receiptId,
        {
          page: input.page,
          preset: input.preset,
          ...(input.password !== undefined ? { password: input.password } : {}),
        },
        c.req.raw.signal,
      );
      c.header('Content-Type', 'image/png');
      c.header('X-Content-Type-Options', 'nosniff');
      c.header('Content-Length', String(preview.png.length));
      c.header('X-PDF-Page', String(preview.page));
      c.header('X-PDF-Pages', String(preview.pages));
      c.header('X-PDF-Width', String(preview.width));
      c.header('X-PDF-Height', String(preview.height));
      return c.body(new Uint8Array(preview.png));
    } catch (error) {
      if (!(error instanceof PdfPreviewError)) throw error;
      const status =
        error.code === 'busy' || error.code === 'unavailable'
          ? 503
          : error.code === 'source_changed'
            ? 409
            : error.code === 'aborted'
              ? 400
              : 422;
      return c.json(
        { error: `pdf_preview_${error.code}`, message: previewMessages[error.code] },
        status,
      );
    }
  });
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
