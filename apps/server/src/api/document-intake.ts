import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '@budget/db';
import { RECEIPT_LIMIT, sanitizedFilename } from '../receipts/files';
import { classifyDocument } from '../document-intake/classify';
import { findReceiptMatches } from '../document-intake/receipt-matches';
import { ApiError, readQuery } from './http';

const MAX_PASSWORD = 256;
/**
 * Read-only document type detection for the central upload. It stores nothing and starts no
 * pipeline; the client then sends the same file to the existing receipt, statement or payslip
 * endpoint. File content, names and passwords are never logged.
 */
export function documentIntakeRoutes(db: Db) {
  const api = new Hono();
  api.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });
  api.post('/classify', async (c) => {
    let form: FormData;
    try {
      form = await c.req.raw.formData();
    } catch {
      throw new ApiError(400, 'invalid', 'Ungültiger Datei-Upload.');
    }
    const file = form.get('file');
    if (
      [...form.keys()].some((k) => !['file', 'password'].includes(k)) ||
      form.getAll('file').length !== 1 ||
      form.getAll('password').length > 1 ||
      !(file instanceof File) ||
      !file.size
    )
      throw new ApiError(400, 'invalid', 'Bitte genau eine Datei auswählen.');
    if (file.size > RECEIPT_LIMIT)
      return c.json(
        { error: 'receipt_too_large', message: 'Eine Datei darf höchstens 15 MB groß sein.' },
        413,
      );
    const password = z
      .string()
      .max(MAX_PASSWORD)
      .optional()
      .parse(form.get('password') ?? undefined);
    // receiptMime throws a RangeError (mapped to 400) for unsupported types.
    return c.json(
      await classifyDocument(
        db,
        Buffer.from(await file.arrayBuffer()),
        sanitizedFilename(file.name),
        password || undefined,
      ),
    );
  });
  // Read-only lookup behind the editable receipt proposal; the owner changes the values freely.
  api.get('/receipt-matches', (c) => {
    const query = readQuery(
      c,
      z
        .object({
          totalCents: z.coerce.number().int().positive().max(1_000_000_000),
          date: z.iso.date(),
          payee: z.string().max(80).optional(),
        })
        .strict(),
    );
    return c.json({ matches: findReceiptMatches(db, query) });
  });
  return api;
}
