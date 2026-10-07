import { readInbox, readInboxCount, resolveInboxItem, type Db } from '@budget/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, readBody, readQuery } from './http';

const page = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/** Actual queue behind the common session/origin guard; stored acknowledgement has one undo group. */
export function inboxRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const { limit, offset } = readQuery(c, page);
    const inbox = readInbox(db, today());
    // Without `limit` the whole queue, as before; `count` always is the full number of tasks.
    if (limit === undefined) return c.json(inbox);
    const start = offset ?? 0;
    const entries = inbox.entries.slice(start, start + limit);
    const next = start + entries.length < inbox.entries.length ? start + entries.length : null;
    return c.json({ ...inbox, entries, limit, offset: start, next });
  });
  app.get('/count', (c) => c.json(readInboxCount(db, today())));
  app.post('/:id/resolve', async (c) => {
    await readBody(c, z.object({}).strict());
    const id = z.string().min(1).max(100).parse(c.req.param('id'));
    return c.json(resolveInboxItem(db, id, { actor: ACTOR }));
  });
  return app;
}
