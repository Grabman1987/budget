import {
  EntityNotFoundError,
  fxSeries,
  priceSeries,
  schema,
  setManualPrice,
  type Db,
} from '@budget/db';
import { parseMicro } from '@budget/domain';
import type { MarketSources } from '@budget/market';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { refreshMarket } from '../market/timer';
import { ACTOR, ApiError, readBody, readQuery } from './http';
import { day } from './schemas';

const range = z.object({ from: day.optional(), to: day.optional() });
const fxQuery = range.extend({ currency: z.string().regex(/^[A-Z]{3}$/) });

/** A manual price: integer micro-units, or decimal text (`85.12`), exactly one of the two. */
const manualPrice = z
  .object({
    priceMicro: z.int().positive().optional(),
    price: z
      .string()
      .regex(/^\d+(\.\d{1,6})?$/)
      .optional(),
  })
  .refine((v) => (v.priceMicro === undefined) !== (v.price === undefined), {
    message: 'Give either priceMicro or price',
  });

/**
 * Market data: the refresh job, the price series of a security (a manual price wins over every
 * source), and the ECB rates. Sources are injected (fixture outside production).
 */
export function marketRoutes(db: Db, today: () => string, sources: MarketSources): Hono {
  const app = new Hono();
  let running = false;

  app.post('/market/refresh', async (c) => {
    if (running) throw new ApiError(409, 'refresh_running', 'A market refresh is already running');
    running = true;
    try {
      return c.json(await refreshMarket(db, sources, today()));
    } finally {
      running = false;
    }
  });

  const requireSecurity = (id: string) => {
    const row = db.select().from(schema.security).where(eq(schema.security.id, id)).get();
    if (!row || row.deletedAt) throw new EntityNotFoundError('security', id);
    return row;
  };

  app.get('/securities/:id/prices', (c) => {
    const sec = requireSecurity(c.req.param('id'));
    const { from, to } = readQuery(c, range);
    return c.json({
      securityId: sec.id,
      currency: sec.currency,
      prices: priceSeries(db, sec.id, from, to),
    });
  });

  app.put('/securities/:id/prices/:date', async (c) => {
    const sec = requireSecurity(c.req.param('id'));
    const date = day.parse(c.req.param('date'));
    if (date > today())
      throw new ApiError(400, 'invalid', 'A price cannot be set for a future day');
    const body = await readBody(c, manualPrice);
    const priceMicro = body.priceMicro ?? parseMicro(body.price as string);
    if (priceMicro <= 0) throw new ApiError(400, 'invalid', 'The price must be positive');
    const ctx = { actor: ACTOR, groupId: randomUUID() };
    const result = setManualPrice(
      db,
      { securityId: sec.id, date, priceMicro, currency: sec.currency },
      ctx,
    );
    return c.json({
      price: result.price,
      groupId: result.groupId,
    });
  });

  app.get('/fx', (c) => {
    const { currency, from, to } = readQuery(c, fxQuery);
    return c.json({ currency, rates: fxSeries(db, currency, from, to) });
  });

  return app;
}
