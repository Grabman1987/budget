import {
  account,
  listEntities,
  decidePayslipIntake,
  getPayslipIntake,
  readPayslipPayoutAssociation,
  getPayslipSourceConfig,
  payslipMatches,
  upcoming,
  listPayees,
  INCOME_TYPES,
  readPayslipScan,
  setPayslipSourceConfig,
  type Db,
} from '@budget/db';
import { payslipSourceConfig, proposedPayslipPayoutDate, wageTypes } from '@budget/domain';
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
import { isScanFailure } from '../payslips/scan-error';
import { RECEIPT_LIMIT } from '../receipts/files';
import { lastDayOfMonth } from '@budget/domain';
import { ACTOR, ApiError, readBody } from './http';
import { day } from './schemas';

const MAX_PASSWORD = 256;
function intakeView(
  db: Db,
  row: ReturnType<typeof getPayslipIntake>,
  query: {
    accountId?: string | undefined;
    payoutDate?: string | undefined;
    expectedOccurrenceId?: string | undefined;
  } = {},
) {
  const accounts = listEntities(db, account).filter((a) => a.currency === 'EUR' && !a.closedAt);
  const suggested = query.accountId ?? getPayslipSourceConfig(db).salaryAccountId;
  const payoutAccountId = accounts.some((a) => a.id === suggested) ? suggested : null;
  const incomeTypeId =
    row.parsed.draft?.kind === 'special' ? INCOME_TYPES.special.id : INCOME_TYPES.salary.id;
  const expectedPayouts =
    row.parsed.draft && payoutAccountId
      ? upcoming(db, `${row.parsed.draft.month}-01`, lastDayOfMonth(row.parsed.draft.month), {
          kind: 'inflow',
        })
          .filter(
            (o) =>
              o.status === 'expected' &&
              !o.bookingId &&
              o.currency === 'EUR' &&
              o.accountId === payoutAccountId &&
              o.incomeTypeId === incomeTypeId,
          )
          .map(
            ({
              occurrenceId,
              paymentId,
              name,
              dueDate,
              amountCents,
              currency,
              accountId,
              payeeId,
              payeeName,
            }) => ({
              occurrenceId,
              paymentId,
              name,
              dueDate,
              amountCents,
              currency,
              accountId,
              payeeId,
              payeeName,
            }),
          )
      : [];
  const selectedExpectedPayout =
    expectedPayouts.find((o) => o.occurrenceId === query.expectedOccurrenceId) ??
    (!query.expectedOccurrenceId && expectedPayouts.length === 1 ? expectedPayouts[0] : undefined);
  const proposedPayoutDate =
    query.payoutDate ??
    proposedPayslipPayoutDate(row.parsed) ??
    selectedExpectedPayout?.dueDate ??
    null;
  return {
    id: row.id,
    status: row.status,
    receiptId: row.receiptId,
    payout: readPayslipPayoutAssociation(db, row.id),
    parsed: row.parsed,
    matches: payslipMatches(db, row.parsed, payoutAccountId, proposedPayoutDate, {
      intake: row,
      expectedOccurrenceId: selectedExpectedPayout?.occurrenceId ?? null,
    }),
    payoutAccountId,
    proposedPayoutDate,
    expectedPayouts,
    selectedExpectedOccurrenceId: selectedExpectedPayout?.occurrenceId ?? null,
    proposedPayeeId: selectedExpectedPayout?.payeeId ?? null,
    payees: listPayees(db)
      .filter((partner) => !partner.systemKind)
      .map(({ id, name }) => ({ id, name })),
    accounts: accounts.map(({ id, name, type, onBudget, sortOrder, closedAt }) => ({
      id,
      name,
      type,
      onBudget,
      sortOrder,
      closedAt,
    })),
  };
}
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
        !isScanFailure(scan?.errorCode),
      dropboxConfigured: dropboxConfigured(),
      dropboxWrite: dropboxWriteEnabled(),
      lastScanAt: scan?.lastScanAt ?? null,
      filesFound: scan?.filesFound ?? 0,
      errors: scan?.errors ?? 0,
      errorCode: scan?.errorCode ?? null,
      accounts: listEntities(db, account)
        .filter((a) => a.currency === 'EUR')
        .map(({ id, name, type, onBudget, sortOrder, closedAt }) => ({
          id,
          name,
          type,
          onBudget,
          sortOrder,
          closedAt,
        })),
      payees: listPayees(db)
        .filter((p) => !p.systemKind)
        .map(({ id, name }) => ({ id, name })),
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
      remember = form.get('remember'),
      automation = form.get('automation');
    if (
      [...form.keys()].some(
        (key) => !['file', 'password', 'remember', 'automation'].includes(key),
      ) ||
      form.getAll('password').length > 1 ||
      form.getAll('remember').length > 1 ||
      form.getAll('automation').length > 1 ||
      (automation !== null && automation !== 'eligible') ||
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
        ...(automation === 'eligible' ? { automation: 'eligible' as const } : {}),
      }),
      201,
    );
  });
  api.get('/:id', (c) => {
    const row = getPayslipIntake(db, z.string().uuid().parse(c.req.param('id')));
    const query = z
      .strictObject({
        accountId: z.string().min(1).max(64).optional(),
        payoutDate: day.optional(),
        expectedOccurrenceId: z.string().min(1).max(64).optional(),
      })
      .parse(c.req.query());
    return c.json(intakeView(db, row, query));
  });
  api.put('/:id/mappings', async (c) => {
    const { wageTypes: mappings, password } = await readBody(
      c,
      z.strictObject({
        wageTypes: z
          .record(z.string().regex(/^\d{1,8}$/), z.enum(wageTypes))
          .refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= 200),
        password: z.string().min(1).max(MAX_PASSWORD).optional(),
      }),
    );
    let result: Awaited<ReturnType<typeof service.mapWageTypes>>;
    try {
      result = await service.mapWageTypes(z.string().uuid().parse(c.req.param('id')), mappings, {
        password,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'reparse')
        throw new ApiError(
          422,
          'unreadable',
          'Die Datei konnte mit der Zuordnung nicht neu ausgewertet werden.',
        );
      if (
        error instanceof Error &&
        (error.message === 'conflict' || error.name === 'ConflictError')
      )
        throw new ApiError(
          409,
          'conflict',
          'Die Aufgabe oder Zuordnung wurde zwischenzeitlich geändert. Bitte neu laden.',
        );
      throw error;
    }
    const row = getPayslipIntake(db, z.string().uuid().parse(c.req.param('id')));
    return c.json({ ...intakeView(db, row), groupId: result.groupId });
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
            accountId: z.string().min(1).max(64).optional(),
            payoutDate: day.optional(),
            payeeId: z.string().min(1).max(64).nullable().optional(),
            expectedOccurrenceId: z.string().min(1).max(64).nullable().optional(),
            splitToken: z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .optional(),
          }),
        ),
        { actor: ACTOR },
      ),
    ),
  );
  return api;
}
