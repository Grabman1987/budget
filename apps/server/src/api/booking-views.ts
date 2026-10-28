import { changeBookingViews, bookingViews, type Db } from '@budget/db';
import { bookingViewInput, type BookingViewInput, type BookingViewsChange } from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, defined, readBody, readQuery } from './http';

const view = z.unknown().transform((raw, ctx): BookingViewInput => {
  const parsed = bookingViewInput(raw);
  if (parsed) return parsed;
  ctx.addIssue({ code: 'custom', message: 'Invalid saved booking filter' });
  return z.NEVER;
});
const body = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('save'), revision: z.string().min(1).max(64), id: z.uuid().optional(), view }),
  z.strictObject({ kind: z.literal('delete'), revision: z.string().min(1).max(64), id: z.uuid() }),
]);
/** Uses the application's existing authenticated, same-origin write boundary. */
export function bookingViewsRoutes(db: Db): Hono {
  const app = new Hono();
  app.use('*', async (c, next) => { readQuery(c, z.strictObject({})); await next(); });
  app.get('/', (c) => c.json(bookingViews(db)));
  app.post('/', async (c) => {
    const { revision, ...change } = await readBody(c, body);
    return c.json(changeBookingViews(db, revision, defined<BookingViewsChange>(change), { actor: ACTOR, groupId: randomUUID() }));
  });
  return app;
}
