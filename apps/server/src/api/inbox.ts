import { readInbox, readInboxCount, resolveInboxItem, type Db } from '@budget/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, readBody } from './http';

/** Actual queue behind the common session/origin guard; stored acknowledgement has one undo group. */
export function inboxRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json(readInbox(db, today())));
  app.get('/count', (c) => c.json(readInboxCount(db, today())));
  app.post('/:id/resolve', async (c) => {
    await readBody(c, z.object({}).strict());
    const id = z.string().min(1).max(100).parse(c.req.param('id'));
    return c.json(resolveInboxItem(db, id, { actor: ACTOR }));
  });
  return app;
}
