import { globalSearch, type Db } from '@budget/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { readQuery } from './http';

/** Mounted inside the session-protected ledger API; never returns an unbounded pick list. */
export function searchRoutes(db: Db): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const { q } = readQuery(c, z.object({ q: z.string().max(200).trim().min(2) }));
    return c.json({ results: globalSearch(db, q) });
  });
  return app;
}
