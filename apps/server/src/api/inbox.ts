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
  dateSort: z.enum(['newest', 'oldest']).optional(),
  fromDate: z.iso.date().optional(),
  readSource: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(300).optional(),
});

/** Actual queue behind the common session/origin guard; stored acknowledgement has one undo group. */
export function inboxRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const { limit, offset, period, bankSource, dateSort, fromDate, readSource, title } = readQuery(
      c,
      page,
    );
    const inbox = readInbox(db, today(), bankSource, readSource);
    const countsByTitle: Record<string, number> = {};
    if (readSource)
      for (const entry of inbox.entries) {
        if (entry.type === 'stored')
          countsByTitle[entry.title] = (countsByTitle[entry.title] ?? 0) + 1;
      }
    const date = (entry: (typeof inbox.entries)[number]) =>
      entry.type === 'stored'
        ? (entry.bankCandidate?.date ?? entry.createdAt.slice(0, 10))
        : entry.type === 'envelope'
          ? entry.month + '-01'
          : entry.date;
    const filtered = inbox.entries.filter(
      (entry) =>
        inboxMatchesPeriod({ ...entry, date: date(entry) }, period, inbox.asOf) &&
        (!fromDate || date(entry) >= fromDate) &&
        (!title || (entry.type === 'stored' && entry.title === title)),
    );
    if (dateSort)
      filtered.sort(
        (a, b) =>
          (dateSort === 'newest' ? -1 : 1) * date(a).localeCompare(date(b)) ||
          a.id.localeCompare(b.id),
      );
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
      ...(readSource ? { countsByTitle } : {}),
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
