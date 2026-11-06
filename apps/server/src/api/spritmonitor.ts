import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import type { Db } from '@budget/db';
import { readBody } from './http';
import { spritmonitorSync } from '../sources/spritmonitor-sync';

/** Mounted behind the ledger session/origin guards; writes additionally require a passkey session. */
export function spritmonitorRoutes(db: Db, passkeySession: MiddlewareHandler) {
  const service = spritmonitorSync(db);
  const app = new Hono();
  app.get('/', (c) => c.json(service.status()));
  app.post('/refresh', passkeySession, async (c) => {
    await readBody(c, z.object({}).strict());
    return c.json(await service.refresh(new Date(), 'owner'));
  });
  app.post('/resolve', passkeySession, async (c) => {
    const body = await readBody(
      c,
      z
        .object({
          key: z.string().regex(/^spritmonitor\.row\.[a-f0-9]{40}$/),
          fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
          action: z.enum(['ignore', 'link', 'book']),
          bookingId: z.string().min(1).max(200).optional(),
        })
        .strict(),
    );
    return c.json(service.resolve(body.key, body.fingerprint, body.action, body.bookingId));
  });
  return app;
}
