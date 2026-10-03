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
import {
  forgetPayslipPassword,
  payslipPasswordBox,
  payslipPasswordSource,
  rememberPayslipPassword,
} from '../payslips/password';
import { dropboxConfigured, dropboxWriteEnabled } from '../payslips/dropbox';
import { RECEIPT_LIMIT } from '../receipts/files';
import { ACTOR, ApiError, readBody } from './http';

const MAX_PASSWORD = 256;
export function payslipIntakeRoutes(
  db: Db,
  dir: string,
  service = new PayslipIntakeService(db, dir),
) {
  const api = new Hono();
  api.get('/status', (c) => {
    const scan = readPayslipScan(db);
    const passwordSource = payslipPasswordSource(db);
    return c.json({
      passwordSet: passwordSource !== null,
      passwordSource,
      passwordRememberAvailable: Boolean(payslipPasswordBox()),
      dropboxConnected:
        dropboxConfigured() &&
        scan?.root === process.env['DROPBOX_PAYSLIP_ROOT']?.replace(/\/$/, '') &&
        Boolean(scan?.cursor) &&
        scan?.errorCode !== 'scan_failed',
      dropboxConfigured: dropboxConfigured(),
      dropboxWrite: dropboxWriteEnabled(),
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
    const password = form.get('password'),
      remember = form.get('remember');
    if (
      [...form.keys()].some((key) => !['file', 'password', 'remember'].includes(key)) ||
      form.getAll('password').length > 1 ||
      form.getAll('remember').length > 1 ||
      (password !== null && (typeof password !== 'string' || password.length > MAX_PASSWORD)) ||
      (remember !== null && remember !== '1' && remember !== 'true') ||
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
      await service.ingest(Buffer.from(await file.arrayBuffer()), file.name, 'manual', undefined, {
        ...(password ? { password: password as string } : {}),
        remember: remember !== null,
      }),
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
    const options = await readBody(
      c,
      z.strictObject({
        password: z.string().min(1).max(MAX_PASSWORD).optional(),
        remember: z.boolean().optional(),
      }),
    );
    return c.json(await service.retry(z.string().uuid().parse(c.req.param('id')), options));
  });
  /** Replace the remembered password; it is checked on the next upload that needs it. */
  api.put('/password', async (c) => {
    const { password } = await readBody(
      c,
      z.strictObject({ password: z.string().min(1).max(MAX_PASSWORD) }),
    );
    if (!rememberPayslipPassword(db, password))
      throw new ApiError(
        409,
        'remember_unavailable',
        'Das Passwort kann nicht gespeichert werden: BUDGET_PEPPER fehlt am Server.',
      );
    return c.json({ passwordSource: payslipPasswordSource(db) });
  });
  api.delete('/password', (c) => {
    forgetPayslipPassword(db);
    return c.json({ passwordSource: payslipPasswordSource(db) });
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
