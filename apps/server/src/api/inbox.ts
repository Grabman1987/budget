import {
  prepareInboxBankSuggestions,
  readInbox,
  readInboxCount,
  resolveInboxItem,
  type Db,
} from '@budget/db';
import { Hono } from 'hono';
import {
  inboxCause,
  inboxMatchesPeriod,
  inboxSegment,
  inboxTaskSource,
  type InboxTaskSource,
  type InboxSegment,
} from '@budget/domain';
import { z } from 'zod';
import { ACTOR, readBody, readQuery } from './http';

const page = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  period: z.enum(['all', 'current', 'historical']).default('all'),
  bankSource: z.string().uuid().optional(),
  bankAccountId: z.string().uuid().optional(),
  dateSort: z.enum(['newest', 'oldest']).optional(),
  fromDate: z.iso.date().optional(),
  readSource: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(300).optional(),
  /** Konten › Prüfen: one part of the queue, without overspent categories. */
  segment: z.enum(['auto', 'umsaetze', 'aufgaben']).optional(),
  taskSource: z.enum(['plan', 'payslips', 'other']).optional(),
});

/** Actual queue behind the common session/origin guard; stored acknowledgement has one undo group. */
export function inboxRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const {
      limit,
      offset,
      period,
      bankSource,
      bankAccountId,
      dateSort,
      fromDate,
      readSource,
      title,
      segment,
      taskSource,
    } = readQuery(c, page);
    const inbox = readInbox(db, today(), bankSource, readSource, {
      excludeOverspent: segment !== undefined,
      ...(bankAccountId ? { bankAccountId } : {}),
    });
    // Unlinked receipts count as tasks but are not entries; the header pill is the sum of both parts.
    const segments = { umsaetze: 0, aufgaben: inbox.count - inbox.entries.length };
    for (const entry of inbox.entries) segments[inboxSegment(entry)] += 1;
    const shown: InboxSegment | undefined =
      segment === undefined
        ? undefined
        : segment === 'auto'
          ? segments.umsaetze > 0 || segments.aufgaben === 0
            ? 'umsaetze'
            : 'aufgaben'
          : segment;
    // Full outstanding items, independent of period, source drilldown and pagination.
    const taskSources: Record<InboxTaskSource, number> = {
      accounts: inbox.accountReminders.length,
      receipts: inbox.unlinkedReceiptCount,
      plan: 0,
      payslips: 0,
      other: 0,
    };
    for (const entry of inbox.entries)
      if (inboxSegment(entry) === 'aufgaben') taskSources[inboxTaskSource(entry)] += 1;
    const segmentFields = shown ? { segment: shown, segments, taskSources } : {};
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
        (!shown || inboxSegment(entry) === shown) &&
        (!taskSource ||
          (inboxSegment(entry) === 'aufgaben' && inboxTaskSource(entry) === taskSource)) &&
        inboxMatchesPeriod({ ...entry, date: date(entry) }, period, inbox.asOf) &&
        (!fromDate || date(entry) >= fromDate) &&
        (!title || (entry.type === 'stored' && entry.title === title)),
    );
    const overspent = filtered.filter(
      (entry): entry is Extract<(typeof filtered)[number], { type: 'envelope' }> =>
        entry.type === 'envelope',
    );
    const overspentSummary = overspent.length
      ? {
          month: overspent[0]!.month,
          count: overspent.length,
          deficitCents: overspent.reduce((sum, entry) => sum + entry.deficitCents, 0),
        }
      : undefined;
    if (dateSort)
      filtered.sort(
        (a, b) =>
          (dateSort === 'newest' ? -1 : 1) * date(a).localeCompare(date(b)) ||
          a.id.localeCompare(b.id),
      );
    // Without `limit` the whole queue, as before; `count` always is the full number of tasks.
    if (limit === undefined)
      return c.json({
        ...inbox,
        entries: prepareInboxBankSuggestions(db, filtered),
        overspentSummary,
        ...segmentFields,
      });
    const start = offset ?? 0;
    const entries = prepareInboxBankSuggestions(db, filtered.slice(start, start + limit));
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
      overspentSummary,
      ...segmentFields,
      totalEntries: filtered.length,
      countsByKind,
      countsByCause,
      limit,
      offset: start,
      next,
      ...(readSource ? { countsByTitle } : {}),
    });
  });
  // The header pill is the Prüfen total (Umsätze + Aufgaben); overspent categories live in Heute/Plan.
  app.get('/count', (c) => c.json(readInboxCount(db, today(), { excludeOverspent: true })));
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
