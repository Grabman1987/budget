import {
  createPlannedEvent,
  createIncomePause,
  deleteIncomePause,
  deletePlannedEvent,
  listIncomePauses,
  liquidityReportView,
  plannedEventsView,
  plannedEventAccounts,
  restorePlannedEvent,
  updatePlannedEvent,
  updateIncomePause,
  type IncomePauseInput,
  type IncomePausePatch,
  type Db,
  type PlannedEventInput,
  type PlannedEventPatch,
} from '@budget/db';
import {
  EVENT_RECURRENCES,
  LIQUIDITY_HORIZONS,
  LIQUIDITY_LEVERS,
  type LiquidityLeverId,
} from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { ZodError, z } from 'zod';
import { ACTOR, ApiError, defined, readBody, readQuery } from './http';
import { cents, day } from './schemas';

const horizon = z.enum(LIQUIDITY_HORIZONS as [string, ...string[]]);
const query = z.object({
  horizon: horizon.default('6m'),
  /** Comma separated lever ids. */
  levers: z.string().max(200).default(''),
});
const eventCreate = z.object({
  name: z.string().trim().min(1).max(80),
  date: day,
  amountCents: cents.refine((v) => v !== 0, 'The amount must not be 0'),
  accountId: z.string().min(1).max(64).nullable().optional(),
  enabled: z.boolean().optional(),
  note: z.string().max(500).nullable().optional(),
  categoryId: z.string().min(1).max(64).nullable().optional(),
  recurrence: z.enum(EVENT_RECURRENCES).optional(),
  recurrenceMonths: z
    .array(z.number().int().min(1).max(12))
    .max(12)
    .refine((v) => new Set(v).size === v.length)
    .optional(),
  recurrenceUntil: day.nullable().optional(),
});
const eventPatch = eventCreate.partial();
const incomePauseCreate = z
  .object({
    sourceId: z.string().min(1).max(64),
    startDate: day,
    endDate: day,
  })
  .strict()
  .refine(
    ({ startDate, endDate }) => startDate <= endDate,
    'Das Ende darf nicht vor dem Beginn liegen.',
  );
const incomePausePatch = z
  .object({
    sourceId: z.string().min(1).max(64).optional(),
    startDate: day.optional(),
    endDate: day.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((v) => v !== undefined), 'No changes provided');

async function readIncomePauseBody<T>(c: Context, schema: z.ZodType<T>) {
  try {
    return await readBody(c, schema);
  } catch (error) {
    if (
      error instanceof ZodError &&
      error.issues.some((issue) => issue.code === 'unrecognized_keys')
    )
      throw new ApiError(
        422,
        'invalid',
        'Nicht unterstützte Felder für die Einkommenspause sind nicht zulässig.',
      );
    throw error;
  }
}

const incomePauseView = (pause: {
  id: string;
  expectedPaymentId: string;
  startDate: string;
  endDate: string;
}) => ({
  id: pause.id,
  sourceId: pause.expectedPaymentId,
  startDate: pause.startDate,
  endDate: pause.endDate,
});

/**
 * Report 3.1 Liquiditätsprognose (`/api/liquidity`): the forecast of the budget accounts with the
 * planned events, the 10 % buffer, the verdict, the month outlook and the levers (`?horizon=` 90d,
 * 6m or 12m, `?levers=` ids switched on), plus the writes of the planned events. Every write
 * answers with the `groupId` of its audit group; `POST /api/undo` reverts it.
 */
export function liquidityRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });
  app.get('/events', (c) => {
    const asOf = today();
    return c.json({
      asOf,
      events: plannedEventsView(db, asOf),
      budgetAccounts: plannedEventAccounts(db, asOf),
    });
  });

  app.get('/income-pauses', (c) => c.json({ pauses: listIncomePauses(db).map(incomePauseView) }));

  app.get('/', (c) => {
    const q = readQuery(c, query);
    const known = new Set<string>(LIQUIDITY_LEVERS);
    const levers = q.levers
      .split(',')
      .filter((l) => known.has(l))
      .map((l) => l as LiquidityLeverId);
    return c.json(
      liquidityReportView(db, today(), {
        horizon: q.horizon as (typeof LIQUIDITY_HORIZONS)[number],
        levers,
      }),
    );
  });

  app.post('/events', async (c) => {
    const { event, groupId } = createPlannedEvent(
      db,
      defined<PlannedEventInput>(await readBody(c, eventCreate)),
      audit(),
    );
    return c.json({ event, groupId }, 201);
  });

  app.patch('/events/:id', async (c) => {
    const { event, groupId } = updatePlannedEvent(
      db,
      c.req.param('id'),
      defined<PlannedEventPatch>(await readBody(c, eventPatch)),
      audit(),
    );
    return c.json({ event, groupId });
  });

  app.delete('/events/:id', (c) => c.json(deletePlannedEvent(db, c.req.param('id'), audit())));

  app.post('/income-pauses', async (c) => {
    const result = createIncomePause(
      db,
      defined<IncomePauseInput>(await readIncomePauseBody(c, incomePauseCreate)),
      today(),
      audit(),
    );
    return c.json({ ...result, pause: incomePauseView(result.pause) }, 201);
  });

  app.patch('/income-pauses/:id', async (c) => {
    const result = updateIncomePause(
      db,
      c.req.param('id'),
      defined<IncomePausePatch>(await readIncomePauseBody(c, incomePausePatch)),
      today(),
      audit(),
    );
    return c.json({ ...result, pause: incomePauseView(result.pause) });
  });

  app.delete('/income-pauses/:id', (c) =>
    c.json(deleteIncomePause(db, c.req.param('id'), audit())),
  );

  app.post('/events/:id/restore', (c) => {
    const { event, groupId } = restorePlannedEvent(db, c.req.param('id'), audit());
    return c.json({ event, groupId });
  });

  return app;
}
