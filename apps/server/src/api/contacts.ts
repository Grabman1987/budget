import {
  addContactAlias,
  commitContactMerge,
  previewContactMerge,
  archiveContact,
  assertFresh,
  removeContactAlias,
  reopenContact,
  createEntity,
  chooseContactCredit,
  convertContactOutlayToGift,
  getContactStatement,
  getContactRepaymentAllocation,
  reallocateContactRepayment,
  adoptContactRepayment,
  waiveContactOutlay,
  listContactStatements,
  schema,
  settleContact,
  writeOffContact,
  updateEntity,
  type Db,
} from '@budget/db';
import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { contactTotals } from '@budget/domain';
import { ACTOR, ApiError, defined, readBody, readQuery } from './http';
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().startsWith(v);
  }, 'Invalid date');
const expectedAt = z.string().min(1).max(40).optional();
const query = z.object({ asOf: day.optional(), history: z.enum(['0', '1']).optional() });
const receipt = z
  .object({
    accountId: z.string().min(1).max(100),
    date: day,
    amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    memo: z.string().max(2000).nullable().optional(),
    excessToBudget: z.boolean().optional(),
    creditChoice: z.enum(['free', 'category', 'gift']).optional(),
    creditCategoryId: z.string().min(1).max(100).optional(),
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
    const contacts = listContactStatements(db, asOf, q.history === '1');
    return c.json({ asOf, currency: 'EUR' as const, contacts, totals: contactTotals(contacts) });
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
  app.patch('/:id', async (c) => {
    const input = await readBody(
      c,
      z.object({ name: z.string().trim().min(1).max(200), expectedUpdatedAt: expectedAt }).strict(),
    );
    const ctx = audit();
    const row = db.transaction((tx) => {
      const current = tx
        .select()
        .from(schema.contact)
        .where(and(eq(schema.contact.id, c.req.param('id')), isNull(schema.contact.deletedAt)))
        .get();
      if (current) assertFresh(current, input.expectedUpdatedAt);
      return updateEntity(tx, schema.contact, c.req.param('id'), { name: input.name }, ctx);
    });
    return c.json({ contact: row, groupId: ctx.groupId });
  });
  app.post('/:id/aliases', async (c) => {
    const input = await readBody(
      c,
      z
        .object({ alias: z.string().trim().min(1).max(200), expectedUpdatedAt: expectedAt })
        .strict(),
    );
    const ctx = audit();
    const alias = addContactAlias(
      db,
      c.req.param('id'),
      input.alias,
      ctx,
      defined<{ expectedUpdatedAt?: string }>({ expectedUpdatedAt: input.expectedUpdatedAt }),
    );
    return c.json({ alias, groupId: ctx.groupId }, 201);
  });
  app.delete('/:id/aliases/:aliasId', (c) => {
    const q = readQuery(c, z.object({ expectedUpdatedAt: expectedAt }).strict());
    const ctx = audit();
    removeContactAlias(
      db,
      c.req.param('id'),
      c.req.param('aliasId'),
      ctx,
      defined<{ expectedUpdatedAt?: string }>({ expectedUpdatedAt: q.expectedUpdatedAt }),
    );
    return c.json({ groupId: ctx.groupId });
  });
  for (const [path, run] of [
    ['archive', archiveContact],
    ['reopen', reopenContact],
  ] as const)
    app.post(`/:id/${path}`, async (c) => {
      const input = await readBody(c, z.object({ expectedUpdatedAt: expectedAt }).strict());
      const ctx = audit();
      const row = run(
        db,
        c.req.param('id'),
        ctx,
        defined<{ expectedUpdatedAt?: string }>({ expectedUpdatedAt: input.expectedUpdatedAt }),
      );
      return c.json({ contact: row, groupId: ctx.groupId });
    });
  // Stateless merge token (#871): the secret lives per process, a restart expires open previews.
  const mergeSecret = randomBytes(32).toString('hex');
  app.post('/:id/merge/preview', async (c) => {
    const input = await readBody(c, z.object({ targetId: z.string().min(1).max(100) }).strict());
    return c.json(
      previewContactMerge(db, c.req.param('id'), input.targetId, { secret: mergeSecret }),
    );
  });
  app.post('/:id/merge', async (c) => {
    const input = await readBody(
      c,
      z
        .object({ targetId: z.string().min(1).max(100), token: z.string().min(1).max(200) })
        .strict(),
    );
    const ctx = audit();
    const row = commitContactMerge(db, c.req.param('id'), input.targetId, input.token, ctx, {
      secret: mergeSecret,
    });
    return c.json({ contact: row, groupId: ctx.groupId });
  });
  app.post('/:id/settlements', async (c) => {
    const input = await readBody(c, receipt);
    if (input.date > today())
      throw new ApiError(422, 'future_receipt', 'A contact receipt must be an actual payment');
    if (input.excessToBudget !== undefined && input.creditChoice !== undefined)
      throw new ApiError(422, 'credit_choice', 'Choose one credit disposition');
    const ctx = audit();
    const result = db.transaction((tx) => {
      const settled = settleContact(
        tx,
        c.req.param('id'),
        {
          accountId: input.accountId,
          date: input.date,
          amountCents: input.amountCents,
          ...(input.memo === undefined ? {} : { memo: input.memo }),
          ...(input.allocations === undefined ? {} : { allocations: input.allocations }),
        },
        ctx,
      );
      const budgetConversion =
        input.excessToBudget && settled.creditCents > 0
          ? {
              ...writeOffContact(
                tx,
                c.req.param('id'),
                {
                  accountId: input.accountId,
                  date: input.date,
                  amountCents: settled.creditCents,
                  memo: 'Überschuss dieser Rückzahlung ins Budget',
                },
                ctx,
                today(),
              ),
              amountCents: settled.creditCents,
            }
          : null;
      if (input.creditChoice && input.creditChoice !== 'free' && settled.creditCents > 0) {
        const receiptSplitId = getContactStatement(
          tx,
          c.req.param('id'),
          input.date,
        ).movements.find((m) => m.bookingId === settled.bookingId)!.splitId;
        chooseContactCredit(
          tx,
          c.req.param('id'),
          {
            receiptSplitId,
            amountCents: settled.creditCents,
            date: input.date,
            choice: input.creditChoice,
            ...(input.creditCategoryId ? { categoryId: input.creditCategoryId } : {}),
          },
          ctx,
          today(),
        );
      }
      return { ...settled, budgetConversion };
    });
    return c.json(result, 201);
  });
  app.post('/:id/credits/:splitId', async (c) => {
    const input = await readBody(
      c,
      z
        .object({
          date: day,
          amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
          choice: z.enum(['free', 'category', 'gift']),
          categoryId: z.string().min(1).max(100).optional(),
          accountId: z.string().min(1).max(100).optional(),
          unlock: z.boolean().optional(),
        })
        .strict(),
    );
    return c.json(
      chooseContactCredit(
        db,
        c.req.param('id'),
        { ...defined(input), receiptSplitId: c.req.param('splitId') },
        audit(),
        today(),
        { unlock: input.unlock ?? false },
      ),
      201,
    );
  });
  app.get('/:id/settlements/:splitId/allocations', (c) =>
    c.json(getContactRepaymentAllocation(db, c.req.param('id'), c.req.param('splitId'), today())),
  );
  app.post('/:id/settlements/:splitId/allocations', async (c) => {
    const input = await readBody(
      c,
      z
        .object({ allocations: receipt.shape.allocations.unwrap(), unlock: z.boolean().optional() })
        .strict(),
    );
    return c.json(
      reallocateContactRepayment(
        db,
        c.req.param('id'),
        c.req.param('splitId'),
        input,
        audit(),
        today(),
        { unlock: input.unlock ?? false },
      ),
    );
  });
  app.post('/:id/settlements/:splitId/adopt', async (c) => {
    const input = await readBody(c, z.object({ unlock: z.boolean().optional() }).strict());
    return c.json(
      adoptContactRepayment(db, c.req.param('id'), c.req.param('splitId'), audit(), today(), {
        unlock: input.unlock ?? false,
      }),
    );
  });
  app.post('/:id/outlays/:splitId/waive', async (c) => {
    const input = await readBody(
      c,
      z
        .object({
          amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
          categoryId: z.string().min(1).max(100).optional(),
          unlock: z.boolean().optional(),
        })
        .strict(),
    );
    return c.json(
      waiveContactOutlay(
        db,
        c.req.param('id'),
        c.req.param('splitId'),
        defined(input),
        audit(),
        today(),
        {
          unlock: input.unlock ?? false,
        },
      ),
      201,
    );
  });
  app.post('/:id/outlays/:splitId/gift', async (c) => {
    const input = await readBody(
      c,
      z
        .object({
          amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
          categoryId: z.string().min(1).max(100),
        })
        .strict(),
    );
    return c.json(
      convertContactOutlayToGift(
        db,
        c.req.param('id'),
        c.req.param('splitId'),
        input,
        audit(),
        today(),
      ),
      201,
    );
  });
  app.post('/:id/write-offs', async (c) => {
    const input = await readBody(
      c,
      receipt
        .omit({
          allocations: true,
          excessToBudget: true,
          creditChoice: true,
          creditCategoryId: true,
        })
        .extend({
          categoryId: z.string().min(1).max(100).nullable().optional(),
          incomeTypeId: z.string().min(1).max(100).nullable().optional(),
        }),
    );
    return c.json(writeOffContact(db, c.req.param('id'), defined(input), audit(), today()), 201);
  });
  return app;
}
