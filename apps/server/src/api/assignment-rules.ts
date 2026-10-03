import { Hono } from 'hono';
import { z } from 'zod';
import { assignmentActionsSchema, assignmentRuleSchema, payeeCleanupSchema } from '@budget/domain';
import {
  applyBookingAssignment,
  assignmentFromBooking,
  listAssignmentRules,
  listPayeeCleanup,
  previewAssignmentRule,
  readAssignmentCandidate,
  readBookingAssignments,
  removeAssignmentRule,
  reorderAssignmentRules,
  saveAssignmentRule,
  savePayeeCleanup,
  type Db,
} from '@budget/db';
import { ACTOR, readBody } from './http';

/** Same session/origin boundary as ledger writes. Source credentials are never read here. */
export function assignmentRoutes(db: Db) {
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
    return c.json(
      applyBookingAssignment(
        db,
        id.parse(c.req.param('id')),
        input.ruleId,
        { actor: ACTOR },
        input.revision,
      ),
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
    candidateRevision: z.string().length(64).optional(),
    actions: assignmentActionsSchema.optional(),
  })
  .strict()
  .refine(
    (v) => !v.ruleId || (!v.actions && !!v.revision),
    'Regelversion oder manuelle Zuordnung wählen.',
  );
