import { changeExplorerViews, explorerViews, type Db } from '@budget/db';
import {
  explorerViewInput,
  type ExplorerViewInput,
  type ExplorerViewsChange,
} from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, defined, readBody, readQuery } from './http';

const view = z.unknown().transform((raw, ctx): ExplorerViewInput => {
  const parsed = explorerViewInput(raw);
  if (parsed) return parsed;
  ctx.addIssue({ code: 'custom', message: 'Invalid saved Explorer query' });
  return z.NEVER;
});
const body = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('save'),
    revision: z.string().min(1).max(64),
    id: z.uuid().optional(),
    view,
  }),
  z.strictObject({ kind: z.literal('delete'), revision: z.string().min(1).max(64), id: z.uuid() }),
  z.strictObject({
    kind: z.literal('import'),
    revision: z.string().min(1).max(64),
    views: z.array(view).min(1).max(20),
  }),
]);

/** Mounted behind the application's existing session and same-origin write guards. */
export function explorerViewsRoutes(db: Db): Hono {
  const app = new Hono();
  const scope = z.strictObject({ report: z.literal('explorer').optional() });
  app.use('*', async (c, next) => {
    readQuery(c, scope);
    await next();
  });
  app.get('/', (c) => c.json(explorerViews(db)));
  app.post('/', async (c) => {
    const { revision, ...change } = await readBody(c, body);
    return c.json(
      changeExplorerViews(db, revision, defined<ExplorerViewsChange>(change), {
        actor: ACTOR,
        groupId: randomUUID(),
      }),
    );
  });
  return app;
}
