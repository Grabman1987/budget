import {
  decideQuoteSource,
  marketAttempts,
  setQuoteFxCurrency,
  EntityNotFoundError,
  securityIsHeld,
  fxSeries,
  lastMarketRun,
  lastSuccessfulMarketRun,
  priceSeries,
  schema,
  setManualPrice,
  type Db,
} from '@budget/db';
import { addDays, parseMicro } from '@budget/domain';
import { errorKind, MarketError, type MarketSources } from '@budget/market';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull, lte } from 'drizzle-orm';
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

  /** The run log's newest entries: what ran last and what last refreshed prices. */
  app.get('/market/status', (c) =>
    c.json({
      lastRun: lastMarketRun(db) ?? null,
      lastSuccess: lastSuccessfulMarketRun(db) ?? null,
    }),
  );

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

  // A diagnostic read of the current mapping. Never stores quotes or resolves inbox items.
  app.get('/securities/:id/quote-diagnostics', (c) => {
    const sec = requireSecurity(c.req.param('id'));
    const latest = priceSeries(db, sec.id, undefined, today()).at(-1) ?? null;
    const movements = db
      .select({ id: schema.trade.id, date: schema.trade.date, kind: schema.trade.kind })
      .from(schema.trade)
      .where(
        and(
          eq(schema.trade.securityId, sec.id),
          isNull(schema.trade.deletedAt),
          lte(schema.trade.date, today()),
        ),
      )
      .orderBy(schema.trade.date, schema.trade.id)
      .all();
    return c.json({
      securityId: sec.id,
      name: sec.name,
      currency: sec.currency,
      symbol: sec.symbol,
      coingeckoId: sec.coingeckoId,
      hasQuoteUrl: !!sec.quoteUrl,
      quoteExchange: sec.quoteExchange,
      pricesEnabled: sec.pricesEnabled,
      held: securityIsHeld(db, sec.id, today()),
      quoteFxCurrency: sec.quoteFxCurrency,
      attempts: marketAttempts(db, sec.id, 10).map((a) => ({
        source: a.source,
        attemptedAt: a.attemptedAt,
        outcome: a.outcome,
        httpStatus: a.httpStatus,
        detail: a.detail,
      })),
      lastRun: lastMarketRun(db) ?? null,
      lastSuccessRun: lastSuccessfulMarketRun(db) ?? null,
      asOf: today(),
      latest,
      movements,
    });
  });

  app.post('/securities/:id/quote-preview', async (c) => {
    await readBody(c, z.object({}).strict());
    const sec = requireSecurity(c.req.param('id'));
    const to = today();
    const from = addDays(to, -30);
    const ref = { ...sec, adjusted: sec.quoteAdjusted, convertFrom: sec.quoteFxCurrency };
    const chain = [
      sources.quotes,
      ...(sources.moreQuotes ?? []),
      ...(sources.fallbackQuotes ? [sources.fallbackQuotes] : []),
    ];
    const attempts = [];
    for (const source of chain) {
      if (!(source.supports?.(ref) ?? true)) {
        attempts.push({ source: source.id, error: 'not_configured', latest: null });
        continue;
      }
      try {
        const quotes = await source.history(ref, from, to);
        const latest = quotes.at(-1) ?? null;
        attempts.push({ source: source.id, error: latest ? null : 'empty', latest });
      } catch (error) {
        attempts.push({
          source: source.id,
          error: errorKind(error),
          latest: null,
          currencyEvidence: error instanceof MarketError ? error.currencyEvidence : null,
        });
      }
    }
    return c.json({
      securityId: sec.id,
      currency: sec.currency,
      symbol: sec.symbol,
      testedAt: new Date().toISOString(),
      from,
      to,
      attempts,
    });
  });

  /** Owner decision: no repair, switch the automatic fetch off with a reason (closes the warnings). */
  app.post('/securities/:id/quote-source-decision', async (c) => {
    const sec = requireSecurity(c.req.param('id'));
    const body = await readBody(
      c,
      z.strictObject({
        mode: z.enum(['manual_only', 'fetch_off']),
        reason: z.string().trim().min(3).max(200),
      }),
    );
    return c.json(decideQuoteSource(db, sec.id, body, today(), { actor: ACTOR }));
  });

  /** Owner choice "mit EZB-Kurs umrechnen" (currency) or clear it (null); stores no price. */
  app.post('/securities/:id/quote-fx-currency', async (c) => {
    const sec = requireSecurity(c.req.param('id'));
    const body = await readBody(
      c,
      z.strictObject({
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .nullable(),
      }),
    );
    return c.json(setQuoteFxCurrency(db, sec.id, body.currency, { actor: ACTOR }));
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
