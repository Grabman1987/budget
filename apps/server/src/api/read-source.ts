import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import {
  accountSummaries,
  listEntities,
  mapReadSource,
  readSourceMappings,
  readSourceSince,
  readSourceState,
  setReadSourceSince,
  security,
  type Db,
} from '@budget/db';
import type { ReadSource } from '@budget/domain';
import { readSourceRunning, refreshReadSource } from '../sources/refresh';
import { ACTOR, readBody } from './http';

export function readSourceRoutes(
  db: Db,
  today: () => string,
  stepUp: MiddlewareHandler,
  source: ReadSource,
): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const { lastSuccess, lastAttempt, status, balances } = readSourceState(db);
    return c.json({
      configured: source.configured(),
      running: readSourceRunning(db),
      lastSuccess,
      lastAttempt,
      status,
      balances,
      mappings: readSourceMappings(db),
      since: readSourceSince(db),
      accounts: accountSummaries(db, today())
        .filter((a) => !a.onBudget && !a.closedAt)
        .map(({ id, name, currency, type }) => ({ id, name, currency, type })),
      securities: listEntities(db, security).map(({ id, name }) => ({ id, name })),
    });
  });
  app.post('/refresh', stepUp, async (c) => {
    const body = await readBody(c, z.object({ fullHistory: z.boolean().optional() }).strict());
    return c.json(await refreshReadSource(db, source, new Date(), body.fullHistory));
  });
  app.put('/mapping', stepUp, async (c) => {
    const body = await readBody(
      c,
      z
        .object({
          key: z.string().min(1).max(210),
          accountId: z.string().min(1).max(100),
          securityId: z.string().min(1).max(100).nullable(),
        })
        .strict(),
    );
    return c.json(mapReadSource(db, body, { actor: ACTOR }));
  });
  app.put('/since', stepUp, async (c) => {
    const body = await readBody(
      c,
      z
        .object({
          since: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .refine((v) => new Date(v + 'T00:00:00Z').toISOString().startsWith(v))
            .nullable(),
        })
        .strict(),
    );
    return c.json(setReadSourceSince(db, body.since, { actor: ACTOR }));
  });
  return app;
}
