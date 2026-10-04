import { incomeMonthRules, saveIncomeMonthRules, type Db } from '@budget/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, readBody } from './http';

export function incomeMonthRoutes(db: Db) {
  const app = new Hono();
  app.get('/', (c) => c.json({ rules: incomeMonthRules(db) }));
  app.put('/', async (c) => {
    const { rules } = await readBody(
      c,
      z.strictObject({
        rules: z
          .array(
            z.strictObject({
              scope: z.enum(['payee', 'category', 'incomeType']),
              targetId: z.string().min(1).max(64),
              nextMonth: z.boolean(),
            }),
          )
          .max(200),
      }),
    );
    return c.json(saveIncomeMonthRules(db, rules, { actor: ACTOR }));
  });
  return app;
}
