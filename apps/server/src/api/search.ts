import { globalSearch, type Db } from '@budget/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { readQuery } from './http';

/** Session-protected and bounded; an explicitly empty query offers recent bookings. */
export function searchRoutes(db: Db): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const { q, recent } = readQuery(
      c,
      z.object({
        q: z.union([z.literal(''), z.string().max(200).trim().min(2)]),
        recent: z
          .string()
          .max(2000)
          .transform((value, ctx) => {
            try {
              return JSON.parse(value) as unknown;
            } catch {
              ctx.addIssue({ code: 'custom', message: 'Ungültige Suchhistorie' });
              return z.NEVER;
            }
          })
          .pipe(
            z
              .array(
                z.object({
                  kind: z.enum(['account', 'category', 'payee', 'contact', 'booking']),
                  id: z.string().min(1).max(64),
                }),
              )
              .max(8),
          )
          .optional(),
      }),
    );
    return c.json({ results: globalSearch(db, q, recent) });
  });
  return app;
}
