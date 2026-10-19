import { changeFreedomGoal, freedomGoal, type Db } from '@budget/db';
import { type FreedomGoalChange } from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, readBody, readQuery } from './http';

const revision = z.string().min(1).max(64);
const body = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('year'), revision, year: z.number().int().min(1900).max(9999) }),
  z.strictObject({
    kind: z.literal('age'),
    revision,
    age: z.number().int().min(0).max(200),
    ageRevision: revision,
  }),
  z.strictObject({ kind: z.literal('clear'), revision }),
]);

/** Mounted beneath the existing session, same-origin and import/read-only write guards. */
export function freedomGoalRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.use('*', async (c, next) => {
    // No personal goal in query URLs, which may be retained by infrastructure logs.
    readQuery(c, z.strictObject({}));
    await next();
  });
  app.get('/', (c) => c.json(freedomGoal(db, today())));
  app.post('/', async (c) => {
    const { revision: expectedRevision, ...change } = await readBody(c, body);
    return c.json(
      changeFreedomGoal(
        db,
        expectedRevision,
        change as FreedomGoalChange,
        {
          actor: ACTOR,
          groupId: randomUUID(),
        },
        today(),
      ),
    );
  });
  return app;
}
