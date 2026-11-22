import { Hono } from 'hono';
import { z } from 'zod';
import {
  assignmentActionsSchema,
  assignmentRuleSchema,
  payeeCleanupSchema,
  todayInVienna,
} from '@budget/domain';
import {
  applyBookingAssignment,
  assignmentFromBooking,
  getBooking,
  listAssignmentRules,
  listPayeeCleanup,
  previewAssignmentRule,
  readAssignmentCandidate,
  readBookingAssignments,
  recordBookingReview,
  removeAssignmentRule,
  reorderAssignmentRules,
  saveAssignmentRule,
  savePayeeCleanup,
  type Db,
} from '@budget/db';
import { ACTOR, readBody } from './http';

/** Same session/origin boundary as ledger writes. Source credentials are never read here. */
export function assignmentRoutes(db: Db, today = () => todayInVienna()) {
  const app = new Hono();
  const id = z.string().min(1).max(100);
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    return next();
  });
  app.get('/', (c) => c.json({ rules: listAssignmentRules(db) }));
  app.post('/preview', async (c) =>
    c.json(previewAssignmentRule(db, await readBody(c, assignmentRuleSchema))),
  );
  app.put('/order', async (c) => {
    const input = await readBody(c, z.object({ ids: z.array(id).max(100) }).strict());
    return c.json(reorderAssignmentRules(db, input.ids, { actor: ACTOR }));
  });
  app.get('/cleanup', (c) => c.json({ sources: listPayeeCleanup(db) }));
  app.put('/cleanup', async (c) => {
    const input = await readBody(
      c,
      z.object({ sourceId: z.string().max(100), config: payeeCleanupSchema }).strict(),
    );
    return c.json(savePayeeCleanup(db, input.sourceId, input.config, { actor: ACTOR }));
  });
  app.get('/candidates/:id', (c) =>
    c.json(readAssignmentCandidate(db, id.parse(c.req.param('id')))),
  );
  app.get('/bookings/:id', (c) => c.json(readBookingAssignments(db, id.parse(c.req.param('id')))));
  app.post('/bookings/:id/apply', async (c) => {
    const input = await readBody(
      c,
      z.object({ ruleId: id, revision: z.string().length(64) }).strict(),
    );
    const bookingId = id.parse(c.req.param('id'));
    return c.json(
      db.transaction((tx) => {
        const before = getBooking(tx, bookingId)?.status;
        const result = applyBookingAssignment(
          tx,
          bookingId,
          input.ruleId,
          { actor: ACTOR },
          input.revision,
        );
        if (before === 'pending' && getBooking(tx, bookingId)?.status === 'confirmed')
          recordBookingReview(tx, bookingId, today(), { actor: ACTOR, groupId: result.groupId });
        return result;
      }),
    );
  });
  app.get('/bookings/:id/learn', (c) =>
    c.json({ draft: assignmentFromBooking(db, id.parse(c.req.param('id'))) }),
  );
  app.post('/', async (c) =>
    c.json(
      saveAssignmentRule(db, null, await readBody(c, assignmentRuleSchema), { actor: ACTOR }),
      201,
    ),
  );
  app.put('/:id', async (c) =>
    c.json(
      saveAssignmentRule(db, id.parse(c.req.param('id')), await readBody(c, assignmentRuleSchema), {
        actor: ACTOR,
      }),
    ),
  );
  app.delete('/:id', (c) =>
    c.json(removeAssignmentRule(db, id.parse(c.req.param('id')), { actor: ACTOR })),
  );
  return app;
}

export const bankConfirmSchema = z
  .object({
    categoryId: z.string().min(1).max(100).nullable(),
    payeeId: z.string().min(1).max(100).nullable().optional(),
    ruleId: z.string().min(1).max(100).optional(),
    revision: z.string().length(64).optional(),
    verifyNewTransfer: z.boolean().optional(),
    candidateRevision: z.string().length(64).optional(),
    actions: assignmentActionsSchema.optional(),
    // Optional "Alle Felder" additions (#1048). Omitted fields keep the previous behavior.
    // Same limit as the booking API; blank means "not given" (the bank text stays).
    memo: z.string().max(500).nullable().optional(),
    projectId: z.string().min(1).max(100).nullable().optional(),
    /** Cent-exact manual split lines; the server checks they sum to the bank amount. */
    splits: z
      .array(
        z
          .object({
            categoryId: z.string().min(1).max(100).nullable(),
            amountCents: z.number().int().safe(),
            memo: z.string().max(500).nullable().optional(),
          })
          .strict(),
      )
      .min(2)
      .max(50)
      .optional(),
    /** Receipts already stored in Prüfen, linked in the same audited confirmation. */
    receiptIds: z.array(z.string().min(1).max(128)).max(20).optional(),
  })
  .strict()
  .refine(
    (v) => !v.ruleId || (!v.actions && !!v.revision),
    'Regelversion oder manuelle Zuordnung wählen.',
  )
  .refine(
    // Manual split lines replace any rule: a rule, a single category or a split template conflict.
    (v) =>
      !v.splits ||
      (!v.ruleId &&
        v.categoryId === null &&
        v.actions?.categoryId == null &&
        !v.actions?.splits &&
        !v.actions?.incomeTypeId &&
        !v.actions?.transferAccountId),
    'Eigene Aufteilung ersetzt Regel und Kategorie.',
  )
  .refine(
    // Policy (#1048): a zero line carries no value and the client refuses it; the same category on
    // several lines stays allowed (as in the booking API), e.g. with different notes.
    (v) => !v.splits?.some((line) => line.amountCents === 0),
    'Aufteilungszeilen dürfen nicht 0,00 € sein.',
  );
