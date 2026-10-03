import { candidateMatches, mergeBankCandidate, linkBankCandidate, type Db } from '@budget/db';
import { randomUUID } from 'node:crypto';
import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { BankError } from '../bank-sync/provider';
import type { BankSync } from '../bank-sync/service';
import type { SessionRow } from '../auth/store';
import { readBody } from './http';

export function bankSyncRoutes(service: BankSync | null, stepUp: MiddlewareHandler, db: Db) {
  const app = new Hono<{ Variables: { session: SessionRow } }>();
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    return next();
  });
  app.get('/', (c) =>
    c.json(
      service
        ? { ...service.status(), workerEnabled: process.env['BUDGET_BANK_SYNC_DAILY'] !== '0' }
        : { configured: false, connections: [], accounts: [] },
    ),
  );
  app.get('/candidates/:id/matches', (c) =>
    c.json(candidateMatches(db, z.string().uuid().parse(c.req.param('id')))),
  );
  for (const action of ['merge', 'transfer'] as const)
    app.post('/candidates/:id/' + action, async (c) => {
      const input = await readBody(c, z.object({ bookingId: z.string().min(1).max(200) }).strict());
      const mutate = action === 'merge' ? mergeBankCandidate : linkBankCandidate;
      return c.json(
        mutate(
          db,
          z.string().uuid().parse(c.req.param('id')),
          input.bookingId,
          { actor: 'owner', groupId: randomUUID() },
          service?.clock().toISOString() ?? new Date().toISOString(),
        ),
      );
    });
  app.use('*', async (c, next) => (service ? next() : c.json({ error: 'not_configured' }, 503)));
  const id = z.string().uuid();
  const short = z.string().min(1).max(200);
  app.get('/institutions', stepUp, async (c) =>
    c.json({ institutions: await service!.provider.institutions() }),
  );
  app.post('/auth', stepUp, async (c) => {
    const input = await readBody(
      c,
      z.object({ name: short, country: z.string().length(2) }).strict(),
    );
    const session = c.get('session') as SessionRow | undefined;
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    return c.json(await service!.start(input.name, input.country, session.id));
  });
  app.post('/callback', stepUp, async (c) => {
    const input = await readBody(
      c,
      z.object({ code: z.string().min(1).max(4096), state: z.string().min(32).max(100) }).strict(),
    );
    const session = c.get('session') as SessionRow | undefined;
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    return c.json(await service!.callback(input.code, input.state, session.id));
  });
  app.put('/accounts/:id', stepUp, async (c) => {
    const input = await readBody(
      c,
      z.object({ accountId: short, fromDate: z.iso.date() }).strict(),
    );
    return c.json(service!.map(id.parse(c.req.param('id')), input.accountId, input.fromDate));
  });
  app.post('/:id/pause', stepUp, async (c) => {
    await readBody(c, z.object({}).strict());
    return c.json(service!.pause(id.parse(c.req.param('id'))));
  });
  app.post('/:id/sync', async (c) => {
    await readBody(c, z.object({}).strict());
    return c.json(service!.requestRun(id.parse(c.req.param('id'))), 202);
  });
  app.post('/candidates/:id/confirm', async (c) => {
    const input = await readBody(c, z.object({ categoryId: short.nullable() }).strict());
    return c.json(service!.confirm(id.parse(c.req.param('id')), input.categoryId));
  });
  app.onError((error, c) => {
    if (error instanceof BankError)
      return c.json(
        { error: error.code, message: 'Bankverbindung konnte nicht verarbeitet werden.' },
        503,
      );
    throw error;
  });
  return app;
}
