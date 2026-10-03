import {
  account,
  listEntities,
  decidePayslipIntake,
  getPayslipIntake,
  getPayslipSourceConfig,
  payslipMatches,
  readPayslipScan,
  setPayslipSourceConfig,
  type Db,
} from '@budget/db';
import { payslipSourceConfig } from '@budget/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { PayslipIntakeService } from '../payslips/service';
import { dropboxConfigured } from '../payslips/dropbox';
import { RECEIPT_LIMIT } from '../receipts/files';
import { ACTOR, ApiError, readBody } from './http';

export function payslipIntakeRoutes(
  db: Db,
  dir: string,
  service = new PayslipIntakeService(db, dir),
) {
  const api = new Hono();
  api.get('/status', (c) => {
    const scan = readPayslipScan(db);
    return c.json({
      passwordSet: Boolean(process.env['PAYSLIP_PDF_PASSWORD']),
      dropboxConnected:
        dropboxConfigured() &&
        scan?.root === process.env['DROPBOX_PAYSLIP_ROOT']?.replace(/\/$/, '') &&
        Boolean(scan?.cursor) &&
        scan?.errorCode !== 'scan_failed',
      dropboxConfigured: dropboxConfigured(),
      lastScanAt: scan?.lastScanAt ?? null,
      filesFound: scan?.filesFound ?? 0,
      errors: scan?.errors ?? 0,
      errorCode: scan?.errorCode ?? null,
      accounts: listEntities(db, account)
        .filter((a) => a.currency === 'EUR')
        .map((a) => ({ id: a.id, name: a.name })),
      config: getPayslipSourceConfig(db),
    });
  });
  api.put('/config', async (c) =>
    c.json(setPayslipSourceConfig(db, await readBody(c, payslipSourceConfig), { actor: ACTOR })),
  );
  api.post('/upload', async (c) => {
    let form: FormData;
    try {
      form = await c.req.raw.formData();
    } catch {
      throw new ApiError(400, 'invalid', 'Ungültiger PDF-Upload.');
    }
    const file = form.get('file');
    if (
      [...form.keys()].some((key) => key !== 'file') ||
      form.getAll('file').length !== 1 ||
      !(file instanceof File) ||
      !file.size
    )
      throw new ApiError(400, 'invalid', 'Bitte genau eine PDF-Datei wählen.');
    if (file.size > RECEIPT_LIMIT)
      return c.json(
        { error: 'payslip_too_large', message: 'Eine PDF darf höchstens 15 MB groß sein.' },
        413,
      );
    return c.json(
      await service.ingest(Buffer.from(await file.arrayBuffer()), file.name, 'manual'),
      201,
    );
  });
  api.get('/:id', (c) => {
    const row = getPayslipIntake(db, z.string().uuid().parse(c.req.param('id')));
    return c.json({
      id: row.id,
      status: row.status,
      receiptId: row.receiptId,
      parsed: row.parsed,
      matches: payslipMatches(db, row.parsed),
    });
  });
  api.post('/:id/retry', async (c) => {
    await readBody(c, z.strictObject({}));
    return c.json(await service.retry(z.string().uuid().parse(c.req.param('id'))));
  });
  api.post('/:id/decision', async (c) =>
    c.json(
      decidePayslipIntake(
        db,
        z.string().uuid().parse(c.req.param('id')),
        await readBody(
          c,
          z.strictObject({
            action: z.enum(['confirm', 'reject']),
            bookingId: z.string().min(1).max(64).nullable(),
          }),
        ),
        { actor: ACTOR },
      ),
    ),
  );
  return api;
}
