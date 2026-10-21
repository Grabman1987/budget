import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { statementFactsSchema } from '@budget/domain';
import {
  assertStatementCas,
  findStatementIntake,
  getReceipt,
  getStatementIntake,
  listStatementIntakes,
  mutateStatementIntake,
  stageStatementIntake,
  statementAccount,
  readStatementAutomationConfig,
  saveStatementAutomationConfig,
  readStatementAutomationOutcome,
  receipt,
  type Db,
} from '@budget/db';
import { digest, RECEIPT_LIMIT, sanitizedFilename, storeReceipt } from '../receipts/files';
import { extractStatement, readStatementSource } from '../statements/service';
import { ACTOR, ApiError, readBody, readQuery } from './http';
import {
  automateRetainedStatement,
  unchangedStatementAutomation,
} from '../statements/automation-service';
const identity = z.string().min(1).max(128);
const cas = z
  .object({
    revision: z.string().uuid(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    accountId: identity,
  })
  .strict();
const password = z.string().max(1024).optional();
export function statementIntakeRoutes(db: Db, dir: string) {
  const api = new Hono();
  const available = async (id: string) => {
    const current = getStatementIntake(db, id),
      source = db.select().from(receipt).where(eq(receipt.id, current.receiptId)).get();
    if (!source || source.sha256 !== current.sha256)
      throw new ApiError(409, 'conflict', 'Abrechnungsquelle fehlt oder ist beschädigt.');
    try {
      await readStatementSource(dir, current.sha256, source.sizeBytes);
    } catch {
      throw new ApiError(409, 'conflict', 'Abrechnungsquelle fehlt oder ist beschädigt.');
    }
  };
  api.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });
  api.get('/', (c) =>
    c.json({
      intakes: listStatementIntakes(
        db,
        readQuery(c, z.object({ accountId: identity }).strict()).accountId,
      ),
    }),
  );
  // Static automation routes precede the retained-document identity route.
  api.get('/automation/config', (c) => {
    const { accountId } = readQuery(c, z.strictObject({ accountId: identity }));
    return c.json({ config: readStatementAutomationConfig(db, accountId) });
  });
  api.put('/automation/config', async (c) =>
    c.json(
      saveStatementAutomationConfig(
        db,
        await readBody(
          c,
          z.strictObject({
            accountId: identity,
            expectedRevision: z.string().uuid().nullable(),
            enabled: z.boolean(),
            scheduledPayment: z
              .discriminatedUnion('mode', [
                z.strictObject({ mode: z.literal('none') }),
                z.strictObject({ mode: z.literal('existing'), paymentId: z.string().uuid() }),
              ])
              .nullable(),
            mappedCards: z
              .array(
                z.strictObject({
                  token: z.string().regex(/^[a-f0-9]{64}$/),
                  accountId: identity,
                }),
              )
              .max(64),
          }),
        ),
        { actor: ACTOR },
      ),
    ),
  );
  api.get('/:id/automation', (c) => {
    const id = identity.parse(c.req.param('id'));
    getStatementIntake(db, id);
    return c.json({ automation: readStatementAutomationOutcome(db, id) });
  });
  api.post('/:id/automate', async (c) => {
    const body = await readBody(c, cas.extend({ password }));
    const id = identity.parse(c.req.param('id'));
    const current = assertStatementCas(db, id, body);
    const automation =
      current.status !== 'pending'
        ? unchangedStatementAutomation(db, id)
        : await automateRetainedStatement(db, dir, id, body, body.password);
    return c.json({ intake: getStatementIntake(db, id), automation, groupId: automation.groupId });
  });
  api.get('/:id', (c) =>
    c.json({ intake: getStatementIntake(db, identity.parse(c.req.param('id'))) }),
  );
  api.post('/upload', async (c) => {
    let form: FormData;
    try {
      form = await c.req.raw.formData();
    } catch {
      throw new ApiError(400, 'invalid', 'Ungültiger PDF-Upload.');
    }
    if (
      [...form.keys()].some((k) => !['file', 'accountId', 'password', 'automation'].includes(k)) ||
      ['file', 'accountId'].some((k) => form.getAll(k).length !== 1) ||
      form.getAll('password').length > 1 ||
      form.getAll('automation').length > 1 ||
      (form.get('automation') !== null && form.get('automation') !== 'eligible')
    )
      throw new ApiError(400, 'invalid', 'Bitte genau eine PDF-Datei und ein Konto auswählen.');
    const accountId = identity.parse(form.get('accountId')),
      pw = password.parse(form.get('password') ?? undefined),
      file = form.get('file');
    statementAccount(db, accountId);
    if (!(file instanceof File) || !file.size || file.size > RECEIPT_LIMIT)
      throw new ApiError(400, 'invalid', 'Bitte eine PDF-Datei mit höchstens 15 MB auswählen.');
    const bytes = Buffer.from(await file.arrayBuffer()),
      sha = digest(bytes);
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new ApiError(400, 'invalid', 'Bitte eine PDF-Datei auswählen.');
    const old = findStatementIntake(db, sha);
    if (old) {
      if (old.accountId !== accountId)
        throw new ApiError(409, 'conflict', 'Diese Datei ist bereits einer Abrechnung zugeordnet.');
      if (old.deletedAt)
        throw new ApiError(
          409,
          'statement_deleted',
          'Diese Abrechnung wurde entfernt. Bitte ausdrücklich wiederherstellen.',
          { intake: old },
        );
      return c.json(
        {
          intake: old,
          duplicate: true,
          groupId: null,
          ...(form.get('automation') === 'eligible'
            ? { automation: unchangedStatementAutomation(db, old.id) }
            : {}),
        },
        201,
      );
    }
    const proposal = await extractStatement(bytes, pw);
    await storeReceipt(dir, bytes);
    const staged = stageStatementIntake(
      db,
      {
        accountId,
        sha256: sha,
        sizeBytes: bytes.length,
        filename: sanitizedFilename(file.name),
        proposal,
      },
      { actor: ACTOR },
    );
    if (form.get('automation') !== 'eligible') return c.json(staged, 201);
    const automation = staged.duplicate
      ? unchangedStatementAutomation(db, staged.intake.id)
      : await automateRetainedStatement(
          db,
          dir,
          staged.intake.id,
          {
            revision: staged.intake.revision,
            sha256: staged.intake.sha256,
            accountId: staged.intake.accountId,
          },
          pw,
        );
    return c.json(
      {
        ...staged,
        intake: getStatementIntake(db, staged.intake.id),
        sourceGroupId: staged.groupId,
        groupId: automation.groupId ?? staged.groupId,
        automation,
      },
      201,
    );
  });
  api.post('/:id/reparse', async (c) => {
    const body = await readBody(c, cas.extend({ password })),
      id = identity.parse(c.req.param('id'));
    const current = assertStatementCas(db, id, body),
      source = getReceipt(db, current.receiptId);
    if (current.status !== 'pending')
      throw new ApiError(409, 'conflict', 'Die Abrechnung zuerst erneut öffnen.');
    let bytes: Buffer;
    try {
      bytes = await readStatementSource(dir, current.sha256, source.sizeBytes);
    } catch {
      throw new ApiError(409, 'conflict', 'Abrechnungsquelle fehlt oder ist beschädigt.');
    }
    const proposal = await extractStatement(bytes, body.password);
    // Repository rechecks the tuple in its write transaction after the asynchronous worker.
    return c.json(mutateStatementIntake(db, id, body, 'reparse', { proposal }, { actor: ACTOR }));
  });
  api.put('/:id/review', async (c) => {
    const body = await readBody(
      c,
      cas.extend({
        facts: statementFactsSchema,
        savePending: z.boolean().optional(),
        targetAccountId: identity.optional(),
      }),
    );
    assertStatementCas(db, identity.parse(c.req.param('id')), body);
    await available(c.req.param('id'));
    return c.json(
      mutateStatementIntake(db, identity.parse(c.req.param('id')), body, 'review', body, {
        actor: ACTOR,
      }),
    );
  });
  for (const action of ['reopen', 'reject', 'restore'] as const)
    api.post(`/:id/${action}`, async (c) => {
      const body = await readBody(c, cas),
        id = identity.parse(c.req.param('id'));
      assertStatementCas(db, id, body, action === 'restore');
      if (action === 'restore') await available(id);
      return c.json(mutateStatementIntake(db, id, body, action, {}, { actor: ACTOR }));
    });
  api.delete('/:id', async (c) =>
    c.json(
      mutateStatementIntake(
        db,
        identity.parse(c.req.param('id')),
        await readBody(c, cas),
        'delete',
        {},
        { actor: ACTOR },
      ),
    ),
  );
  return api;
}
