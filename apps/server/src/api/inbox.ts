import { readInbox, readInboxCount, resolveInboxItem, type Db } from '@budget/db';
import { Hono } from 'hono';
import { inboxCause, inboxMatchesPeriod } from '@budget/domain';
import { z } from 'zod';
import { ACTOR, readBody, readQuery } from './http';

const page = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  period: z.enum(['all', 'current', 'historical']).default('all'),
  bankSource: z.string().uuid().optional(),
});

/** Actual queue behind the common session/origin guard; stored acknowledgement has one undo group. */
export function inboxRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const { limit, offset, period, bankSource } = readQuery(c, page);
    const inbox = readInbox(db, today(), bankSource);
    const filtered = inbox.entries.filter((entry) => inboxMatchesPeriod(entry, period, inbox.asOf));
    // Without `limit` the whole queue, as before; `count` always is the full number of tasks.
    if (limit === undefined) return c.json({ ...inbox, entries: filtered });
    const start = offset ?? 0;
    const entries = filtered.slice(start, start + limit);
    const next = start + entries.length < filtered.length ? start + entries.length : null;
    const countsByKind: Record<string, number> = {};
    const countsByCause: Record<string, number> = {};
    for (const entry of filtered) {
      countsByKind[entry.kind] = (countsByKind[entry.kind] ?? 0) + 1;
      const cause = inboxCause(entry);
      if (cause) countsByCause[cause] = (countsByCause[cause] ?? 0) + 1;
    }
    return c.json({
      ...inbox,
      entries,
      totalEntries: filtered.length,
      countsByKind,
      countsByCause,
      limit,
      offset: start,
      next,
    });
  });
  app.get('/count', (c) => c.json(readInboxCount(db, today())));
  app.get('/:id', (c) => {
    const id = z.string().min(1).max(100).parse(c.req.param('id'));
    const inbox = readInbox(db, today());
    const entry = inbox.entries.find(
      (item) => item.id === id && item.type === 'stored' && item.kind === 'import',
    );
    if (!entry) return c.json({ error: 'not_found' }, 404);
    return c.json({ entry });
  });
  app.post('/:id/resolve', async (c) => {
    await readBody(c, z.object({}).strict());
    const id = z.string().min(1).max(100).parse(c.req.param('id'));
    return c.json(resolveInboxItem(db, id, { actor: ACTOR }));
  });
  return app;
}
