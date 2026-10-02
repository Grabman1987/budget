import {
  createPlannedEvent,
  deletePlannedEvent,
  liquidityReportView,
  restorePlannedEvent,
  updatePlannedEvent,
  type Db,
  type PlannedEventInput,
  type PlannedEventPatch,
} from '@budget/db';
import { LIQUIDITY_HORIZONS, LIQUIDITY_LEVERS, type LiquidityLeverId } from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, defined, readBody, readQuery } from './http';
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
});
const eventPatch = eventCreate.partial();

/**
 * Report 3.1 Liquiditätsprognose (`/api/liquidity`): the forecast of the budget accounts with the
 * planned events, the 10 % buffer, the verdict, the month outlook and the levers (`?horizon=` 90d,
 * 6m or 12m, `?levers=` ids switched on), plus the writes of the planned events. Every write
 * answers with the `groupId` of its audit group; `POST /api/undo` reverts it.
 */
export function liquidityRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });

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

  app.post('/events/:id/restore', (c) => {
    const { event, groupId } = restorePlannedEvent(db, c.req.param('id'), audit());
    return c.json({ event, groupId });
  });

  return app;
}
