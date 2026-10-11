import {
  bankBookingMatches,
  candidateMatches,
  linkBankCandidate,
  mergeBankBooking,
  mergeBankCandidate,
  applyBookingAssignment,
  deleteBooking,
  getBooking,
  readAssignmentCandidate,
  resolveInboxItem,
  schema,
  ConflictError,
  updateBooking,
  type Db,
} from '@budget/db';
import { randomUUID } from 'node:crypto';
import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { BankError } from '../bank-sync/provider';
import type { BankSync } from '../bank-sync/service';
import type { SessionRow } from '../auth/store';
import { readBody } from './http';
import { bankConfirmSchema } from './assignment-rules';
import { eq } from 'drizzle-orm';

const shortId = z.string().min(1).max(100);
const revision = z.string().length(64);
const suggestion = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('rule'),
    ruleId: shortId,
    revision,
    candidateRevision: revision.optional(),
  }),
  z.strictObject({
    action: z.literal('merge'),
    bookingId: shortId,
    candidateRevision: revision.optional(),
  }),
]);
const bulkSchema = z
  .strictObject({
    action: z.enum(['dismiss', 'confirm']),
    rows: z
      .array(
        z.strictObject({
          type: z.enum(['candidate', 'booking']),
          id: shortId,
          suggestion: suggestion.optional(),
        }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (input) => new Set(input.rows.map((row) => row.type + ':' + row.id)).size === input.rows.length,
    'Jede Zeile nur einmal auswählen.',
  );

export function bankSyncRoutes(
  service: BankSync | null,
  passkeySession: MiddlewareHandler,
  db: Db,
) {
  const app = new Hono<{ Variables: { session: SessionRow } }>();
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    return next();
  });
  app.get('/', (c) =>
    c.json(
      service
        ? { ...service.status(), workerEnabled: process.env['BUDGET_BANK_SYNC_DAILY'] !== '0' }
        : { configured: false, connections: [], accounts: [] },
    ),
  );
  app.post('/inbox/bulk', async (c) => {
    const input = await readBody(c, bulkSchema);
    const ctx = { actor: 'owner', groupId: randomUUID() };
    const now = service?.clock().toISOString() ?? new Date().toISOString();
    const result = db.transaction((tx) => {
      let changedCount = 0,
        skippedCount = 0;
      // Validate the complete preview before any confirmation can learn a payee alias.
      for (const row of input.rows) {
        if (input.action !== 'confirm' || row.type !== 'candidate' || !row.suggestion) continue;
        const review = readAssignmentCandidate(tx, row.id);
        if (
          !row.suggestion.candidateRevision ||
          row.suggestion.candidateRevision !== review.candidateRevision
        )
          throw new ConflictError('Der Bankumsatz hat sich geändert. Bitte neu laden.');
      }
      for (const row of input.rows) {
        if (row.type === 'candidate') {
          const item = tx
            .select()
            .from(schema.inboxItem)
            .where(eq(schema.inboxItem.id, row.id))
            .get();
          if (
            !item ||
            item.refType !== 'bank-sync-candidate' ||
            item.refId !== row.id ||
            item.resolvedAt
          )
            throw new ConflictError('Bankumsatz nicht mehr offen. Bitte neu laden.');
        } else {
          const booking = getBooking(tx, row.id);
          if (
            !booking ||
            booking.source !== 'bank' ||
            booking.status === 'reconciled' ||
            (booking.status !== 'pending' &&
              !booking.splits.some(
                (split) => split.categoryId === null && split.incomeTypeId === null,
              ))
          )
            throw new ConflictError('Nur offene Bankbuchungen auswählen.');
        }
        if (input.action === 'dismiss') {
          if (row.type === 'candidate') resolveInboxItem(tx, row.id, ctx);
          else deleteBooking(tx, row.id, ctx);
        } else if (!row.suggestion) {
          skippedCount++;
          continue;
        } else if (row.type === 'candidate') {
          const prepared = row.suggestion;
          const review = readAssignmentCandidate(tx, row.id);
          if (prepared.action === 'merge')
            mergeBankCandidate(tx, row.id, prepared.bookingId, ctx, now);
          else {
            if (!service) throw new ConflictError('Bankbestätigung nicht verfügbar.');
            // The synchronous service opens a savepoint on this same connection; the outer
            // transaction rolls back every row and its audit entries together.
            service.confirm(
              row.id,
              null,
              { ...prepared, candidateRevision: review.candidateRevision },
              ctx,
            );
          }
        } else if (row.suggestion.action === 'merge')
          mergeBankBooking(tx, row.id, row.suggestion.bookingId, ctx);
        else {
          applyBookingAssignment(tx, row.id, row.suggestion.ruleId, ctx, row.suggestion.revision);
          updateBooking(tx, row.id, { status: 'confirmed' }, ctx);
        }
        changedCount++;
      }
      return { groupId: ctx.groupId, changedCount, skippedCount };
    });
    return c.json(result);
  });
  app.get('/candidates/:id/matches', (c) =>
    c.json(candidateMatches(db, z.string().uuid().parse(c.req.param('id')))),
  );
  for (const action of ['merge', 'transfer'] as const)
    app.post('/candidates/:id/' + action, async (c) => {
      const input = await readBody(c, z.object({ bookingId: z.string().min(1).max(200) }).strict());
      const mutate = action === 'merge' ? mergeBankCandidate : linkBankCandidate;
      return c.json(
        mutate(
          db,
          z.string().uuid().parse(c.req.param('id')),
          input.bookingId,
          { actor: 'owner', groupId: randomUUID() },
          service?.clock().toISOString() ?? new Date().toISOString(),
        ),
      );
    });
  // Decision 41: a booked bank row is already an unchecked booking, merged into an earlier manual one.
  app.get('/bookings/:id/matches', (c) =>
    c.json(bankBookingMatches(db, z.string().min(1).max(200).parse(c.req.param('id')))),
  );
  app.post('/bookings/:id/merge', async (c) => {
    const input = await readBody(c, z.object({ bookingId: z.string().min(1).max(200) }).strict());
    return c.json(
      mergeBankBooking(db, z.string().min(1).max(200).parse(c.req.param('id')), input.bookingId, {
        actor: 'owner',
        groupId: randomUUID(),
      }),
    );
  });
  app.use('*', async (c, next) => (service ? next() : c.json({ error: 'not_configured' }, 503)));
  const id = z.string().uuid();
  const short = z.string().min(1).max(200);
  app.get('/institutions', passkeySession, async (c) =>
    c.json({ institutions: await service!.provider.institutions() }),
  );
  app.post('/auth', passkeySession, async (c) => {
    const input = await readBody(
      c,
      z.object({ name: short, country: z.string().length(2) }).strict(),
    );
    const session = c.get('session') as SessionRow | undefined;
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    return c.json(await service!.start(input.name, input.country, session.id));
  });
  app.post('/callback', passkeySession, async (c) => {
    const input = await readBody(
      c,
      z.object({ code: z.string().min(1).max(4096), state: z.string().min(32).max(100) }).strict(),
    );
    const session = c.get('session') as SessionRow | undefined;
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    return c.json(await service!.callback(input.code, input.state, session.id));
  });
  app.put('/accounts/:id', passkeySession, async (c) => {
    const input = await readBody(
      c,
      z.object({ accountId: short, fromDate: z.iso.date() }).strict(),
    );
    return c.json(service!.map(id.parse(c.req.param('id')), input.accountId, input.fromDate));
  });
  app.post('/:id/pause', passkeySession, async (c) => {
    await readBody(c, z.object({}).strict());
    return c.json(service!.pause(id.parse(c.req.param('id'))));
  });
  app.put('/:id/policy', passkeySession, async (c) => {
    const input = await readBody(c, z.strictObject({ bookedToLedger: z.boolean() }));
    return c.json(service!.setPolicy(id.parse(c.req.param('id')), input.bookedToLedger));
  });
  app.post('/:id/sync', async (c) => {
    await readBody(c, z.object({}).strict());
    return c.json(service!.requestRun(id.parse(c.req.param('id'))), 202);
  });
  app.post('/candidates/:id/confirm', async (c) => {
    const { categoryId, ...options } = await readBody(c, bankConfirmSchema);
    return c.json(service!.confirm(id.parse(c.req.param('id')), categoryId, options));
  });
  app.onError((error, c) => {
    if (error instanceof BankError)
      return c.json(
        { error: error.code, message: 'Bankverbindung konnte nicht verarbeitet werden.' },
        503,
      );
    throw error;
  });
  return app;
}
