import {
  createEntity,
  getContactStatement,
  listContactStatements,
  schema,
  settleContact,
  type Db,
} from '@budget/db';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, ApiError, readBody, readQuery } from './http';
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().startsWith(v);
  }, 'Invalid date');
const query = z.object({ asOf: day.optional(), history: z.enum(['0', '1']).optional() });
const receipt = z
  .object({
    accountId: z.string().min(1).max(100),
    date: day,
    amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    memo: z.string().max(2000).nullable().optional(),
    allocations: z
      .array(
        z
          .object({
            outlaySplitId: z.string().min(1).max(100),
            amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
          })
          .strict(),
      )
      .max(1000)
      .optional(),
  })
  .strict();

/** Session and origin guards are inherited from /api; every mutation returns one undo group. */
export function contactRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });
  app.get('/', (c) => {
    const q = readQuery(c, query);
    const asOf = q.asOf ?? today();
    return c.json({ asOf, contacts: listContactStatements(db, asOf, q.history === '1') });
  });
  app.post('/', async (c) => {
    const input = await readBody(
      c,
      z
        .object({
          name: z.string().trim().min(1).max(200),
          note: z.string().max(2000).nullable().optional(),
        })
        .strict(),
    );
    const ctx = audit();
    const row = createEntity(db, schema.contact, input, ctx);
    return c.json({ contact: row, groupId: ctx.groupId }, 201);
  });
  app.get('/:id', (c) => {
    const q = readQuery(c, query);
    return c.json(getContactStatement(db, c.req.param('id'), q.asOf ?? today()));
  });
  app.post('/:id/settlements', async (c) => {
    const input = await readBody(c, receipt);
    if (input.date > today())
      throw new ApiError(422, 'future_receipt', 'A contact receipt must be an actual payment');
    return c.json(
      settleContact(
        db,
        c.req.param('id'),
        {
          accountId: input.accountId,
          date: input.date,
          amountCents: input.amountCents,
          ...(input.memo === undefined ? {} : { memo: input.memo }),
          ...(input.allocations === undefined ? {} : { allocations: input.allocations }),
        },
        audit(),
      ),
      201,
    );
  });
  return app;
}
