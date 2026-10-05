import { Hono } from 'hono';
import { inflationBasketChanges } from '@budget/domain';
import { inflationReport, saveInflationBasket, type Db } from '@budget/db';
import { ACTOR, readBody } from './http';

export function inflationBasketRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json({ categories: inflationReport(db, today()).basketSettings }));
  app.put('/', async (c) =>
    c.json(saveInflationBasket(db, await readBody(c, inflationBasketChanges), { actor: ACTOR })),
  );
  return app;
}
