import { Hono } from 'hono';
import { z } from 'zod';
import {
  decidePayslipIntake,
  getPayslipIntake,
  getReceipt,
  payslipIntake,
  runInTransaction,
  type Db,
} from '@budget/db';
import { isPayrollNotice } from '@budget/domain';
import { isNull } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { PayslipIntakeService } from '../payslips/service';
import { RECEIPT_LIMIT, sanitizedFilename } from '../receipts/files';
import { classifyDocument } from '../document-intake/classify';
import { findReceiptMatches } from '../document-intake/receipt-matches';
import { ApiError, readBody } from './http';

const MAX_PASSWORD = 256;
/**
 * Read-only document type detection for the central upload. It stores nothing and starts no
 * pipeline; the client then sends the same file to the existing receipt, statement or payslip
 * endpoint. File content, names and passwords are never logged.
 */
export function documentIntakeRoutes(db: Db, dir: string) {
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
  // Explicit archive catalogue and reviewable legacy cleanup; originals and parses stay intact.
  const noticeRows = () =>
    db
      .select()
      .from(payslipIntake)
      .where(isNull(payslipIntake.deletedAt))
      .all()
      .map((row) => getPayslipIntake(db, row.id))
      .filter((row) => isPayrollNotice(row.parsed));
  const token = (row: ReturnType<typeof getPayslipIntake>) =>
    createHash('sha256')
      .update(JSON.stringify([row.id, row.sha256, row.parsedJson, row.status]))
      .digest('hex');
  api.get('/notices', (c) =>
    c.json({
      items: noticeRows().map((row) => ({
        id: row.id,
        receiptId: row.receiptId,
        filename: getReceipt(db, row.receiptId).originalFilename,
        classification: row.parsed.documentType,
        status: row.status,
        token: token(row),
      })),
    }),
  );
  api.post('/notices/archive', async (c) => {
    const body = await readBody(
      c,
      z
        .object({
          items: z
            .array(
              z
                .object({
                  id: z.string().uuid(),
                  token: z.string().regex(/^[a-f0-9]{64}$/),
                })
                .strict(),
            )
            .min(1)
            .max(100),
        })
        .strict(),
    );
    const groupId = randomUUID();
    return c.json(
      runInTransaction(db, (tx) => {
        const rows = body.items.map((item) => {
          const row = getPayslipIntake(tx, item.id);
          if (row.status !== 'pending' || !isPayrollNotice(row.parsed) || token(row) !== item.token)
            throw new ApiError(
              409,
              'stale_preview',
              'Die Vorschau ist nicht mehr aktuell. Bitte neu laden.',
            );
          return row;
        });
        if (new Set(rows.map((row) => row.id)).size !== rows.length)
          throw new ApiError(400, 'invalid', 'Dokumente bitte nur einmal auswählen.');
        for (const row of rows)
          decidePayslipIntake(
            tx,
            row.id,
            { action: 'reject', bookingId: null },
            { actor: 'owner', groupId },
          );
        return { groupId };
      }),
    );
  });
  api.post('/notices', async (c) => {
    const form = await c.req.raw.formData();
    const file = form.get('file');
    if (
      [...form.keys()].some((key) => !['file', 'password'].includes(key)) ||
      form.getAll('file').length !== 1 ||
      form.getAll('password').length > 1 ||
      !(file instanceof File) ||
      !file.size ||
      file.size > RECEIPT_LIMIT
    )
      throw new ApiError(400, 'invalid', 'Bitte eine PDF-Datei bis 15 MB auswählen.');
    const password = z
      .string()
      .max(MAX_PASSWORD)
      .optional()
      .parse(form.get('password') ?? undefined);
    const bytes = Buffer.from(await file.arrayBuffer());
    const service = new PayslipIntakeService(db, dir);
    const parsed = await service.parse(bytes, sanitizedFilename(file.name), password);
    if (!isPayrollNotice(parsed))
      throw new ApiError(409, 'not_notice', 'Keine eindeutige Bonus-/Pensionsmitteilung erkannt.');
    const result = await service.ingest(bytes, file.name, 'manual', undefined, { password });
    const row = getPayslipIntake(db, result.id);
    if (!isPayrollNotice(row.parsed))
      throw new ApiError(
        409,
        'not_notice',
        'Die gespeicherte Klassifikation muss zuerst geprüft werden.',
      );
    const archived =
      row.status === 'pending'
        ? decidePayslipIntake(db, row.id, { action: 'reject', bookingId: null }, { actor: 'owner' })
        : null;
    return c.json(
      { ...result, groupId: archived?.groupId ?? result.groupId, receiptId: row.receiptId },
      201,
    );
  });
  // Read-only lookup behind the editable receipt proposal. POST keeps the amount, date and
  // payee out of URLs and logs; nothing is written.
  api.post('/receipt-matches', async (c) => {
    const body = await readBody(
      c,
      z
        .object({
          totalCents: z
            .number()
            .int()
            .min(-1_000_000_000)
            .max(1_000_000_000)
            .refine((n) => n !== 0),
          currency: z
            .string()
            .regex(/^[A-Z]{3}$/)
            .default('EUR'),
          date: z.iso.date(),
          payee: z.string().max(80).optional(),
        })
        .strict(),
    );
    return c.json({ matches: findReceiptMatches(db, body) });
  });
  return api;
}
