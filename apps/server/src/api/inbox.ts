import {
  InboxActionError,
  acceptAllSuggestions,
  acceptInboxItem,
  dismissInboxItem,
  evaluateRules,
  listInbox,
  refreshInbox,
  ruleFromInboxItem,
  type Db,
} from '@budget/db';
import { randomUUID } from 'node:crypto';
import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { ACTOR, ApiError, readBody } from './http';

const acceptBody = z.strictObject({
  /** An uncategorised booking: a category other than the suggestion. */
  categoryId: z.string().min(1).optional(),
  /** A manual value: the new value in cents. */
  valueCents: z.number().int().min(0).optional(),
});
const ruleBody = z.strictObject({ categoryId: z.string().min(1).optional() });

/** Longest time the open items are served without looking at the ledger again. */
const MAX_AGE_MS = 30_000;

/**
 * The Posteingang (concept §4). The open items are derived from the ledger by `refreshInbox`.
 * When that runs: on every read once something was written through this API (a middleware marks
 * the inbox dirty, so the next read refreshes; any number of writes cost one refresh), when the
 * day changed, and at the latest 30 s after the previous run (writes of other parts, the worker
 * later). `POST /refresh` forces it. Rules are evaluated once per day, lazily, on the first run.
 */
export function createInbox(db: Db, today: () => string) {
  let dirty = true;
  let lastDay = '';
  let lastAt = 0;
  let rulesDay = '';

  const refresh = (force = false) => {
    const day = today();
    if (!force && !dirty && day === lastDay && Date.now() - lastAt < MAX_AGE_MS) return;
    if (rulesDay !== day) {
      rulesDay = day;
      evaluateRules(db, day);
    }
    refreshInbox(db, day);
    dirty = false;
    lastDay = day;
    lastAt = Date.now();
  };
  const view = (force = false) => {
    refresh(force);
    return listInbox(db, today());
  };
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });
  const decide = <T>(fn: () => T): T => {
    try {
      const result = fn();
      dirty = true;
      return result;
    } catch (error) {
      if (error instanceof InboxActionError) throw new ApiError(422, 'invalid', error.message);
      throw error;
    }
  };

  /** Marks the inbox dirty after every successful write of the ledger API. */
  const markWrites: MiddlewareHandler = async (c, next) => {
    await next();
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.res.status < 400) dirty = true;
  };

  const routes = new Hono();
  routes.get('/', (c) => c.json(view()));
  routes.post('/refresh', (c) => c.json(view(true)));
  // Fixed paths before `/:id`.
  routes.post('/accept-all', (c) => {
    refresh();
    return c.json(decide(() => acceptAllSuggestions(db, audit(), today())));
  });
  routes.post('/:id/accept', async (c) => {
    const input = await readBody(c, acceptBody);
    return c.json(
      decide(() =>
        acceptInboxItem(
          db,
          c.req.param('id'),
          {
            ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
            ...(input.valueCents !== undefined ? { valueCents: input.valueCents } : {}),
          },
          audit(),
          today(),
        ),
      ),
    );
  });
  routes.post('/:id/rule', async (c) => {
    const input = await readBody(c, ruleBody);
    return c.json(
      decide(() =>
        ruleFromInboxItem(
          db,
          c.req.param('id'),
          input.categoryId !== undefined ? { categoryId: input.categoryId } : {},
          audit(),
        ),
      ),
    );
  });
  routes.post('/:id/dismiss', (c) =>
    c.json(decide(() => dismissInboxItem(db, c.req.param('id'), audit()))),
  );
  return { routes, markWrites, refresh };
}
