import {
  ChecklistRuleBackedError,
  confirmChecklistItem,
  getBookSettings,
  saveBookSettings,
  evaluateRules,
  evaluationDays,
  financeCheck,
  listRules,
  ruleResults,
  updateRule,
  type Db,
  type RulePatch,
} from '@budget/db';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, ApiError, defined, readBody, readQuery } from './http';
import { day, month } from './schemas';

const patchBody = z
  .strictObject({
    /** Parameters to change, validated against the rule's own schema. */
    params: z.record(z.string(), z.unknown()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => v.params !== undefined || v.enabled !== undefined, {
    message: 'Give params or enabled',
  });
const confirmBody = z.strictObject({ confirmed: z.boolean() });
const resultsQuery = z.object({ from: day.optional(), to: day.optional() });

/**
 * The rule book (Regelwerk, concept §3.5): Registered rules with parameters and newest result, edits
 * (audited and undoable via `POST /undo`), evaluation, the 12-month result matrix and the
 * Finanz-Check. The engine is `evaluateRule` in `@budget/domain`.
 */
export function ruleRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });

  app.get('/', (c) => c.json(listRules(db, today())));

  app.get('/inputs', (c) => c.json(getBookSettings(db)));
  app.patch('/inputs', async (c) => {
    const body = await readBody(
      c,
      z
        .strictObject({
          birthMonth: z.union([month, z.literal('')]).optional(),
          pension: z
            .array(z.strictObject({ month, amountCents: z.int().min(0).max(100_000_000) }))
            .max(24)
            .optional(),
        })
        .refine(
          (v) => v.birthMonth !== undefined || (v.pension?.length ?? 0) > 0,
          'Nothing to change',
        ),
    );
    if (body.pension && new Set(body.pension.map((r) => r.month)).size !== body.pension.length)
      throw new ApiError(400, 'invalid', 'Monate müssen eindeutig sein.');
    const ctx = audit();
    try {
      return c.json({ ...saveBookSettings(db, defined(body), ctx, today()), groupId: ctx.groupId });
    } catch (e) {
      if (e instanceof RangeError)
        throw new ApiError(400, 'invalid', 'Geburtsmonat oder Beitrag ungültig.');
      throw e;
    }
  });

  // Fixed paths before `/:code`.
  app.post('/evaluate', (c) => c.json(evaluateRules(db, today())));

  app.get('/results', (c) => {
    const q = readQuery(c, resultsQuery);
    const to = q.to ?? today();
    const from = q.from ?? (evaluationDays(to)[0] as string);
    if (to < from) throw new ApiError(400, 'invalid', '`to` must not be before `from`');
    return c.json(ruleResults(db, from, to));
  });

  app.get('/check', (c) => c.json(financeCheck(db, today())));

  app.patch('/checklist/:code', async (c) => {
    const { confirmed } = await readBody(c, confirmBody);
    const ctx = audit();
    try {
      return c.json({
        item: confirmChecklistItem(db, c.req.param('code'), confirmed, ctx),
        groupId: ctx.groupId,
      });
    } catch (error) {
      if (error instanceof ChecklistRuleBackedError)
        throw new ApiError(409, 'rule_backed', error.message, { ruleCode: error.ruleCode });
      throw error;
    }
  });

  app.patch('/:code', async (c) => {
    const patch = await readBody(c, patchBody);
    const ctx = audit();
    const rule = updateRule(db, c.req.param('code'), defined<RulePatch>(patch), ctx);
    return c.json({ rule, groupId: ctx.groupId });
  });

  return app;
}
