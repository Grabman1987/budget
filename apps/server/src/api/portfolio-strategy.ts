import {
  portfolioStrategyView, recordStrategyMonthlyDecision, saveStrategyConfiguration,
  MISSING_STRATEGY_EVIDENCE, type Db, type StrategyEvidence,
} from '@budget/db';
import { strategyConfigurationSchema, todayInVienna } from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, ApiError, readBody } from './http';

/** Must verify actual provider/index identity and the complete official US calendar before returning evidence. */
export type StrategyEvidenceProvider = (asOf: string) => Promise<StrategyEvidence>;

/** Optional strategy settings and projections; never accepts index/calendar evidence over HTTP. */
export function portfolioStrategyRoutes(db: Db, now: () => string = () => new Date().toISOString(),
  provider: StrategyEvidenceProvider = async () => MISSING_STRATEGY_EVIDENCE,
): Hono {
  const app = new Hono();
  app.get('/', async (c) => {
    const asOf = now(), evidence = await provider(asOf);
    return c.json(portfolioStrategyView(db, asOf, evidence));
  });
  app.put('/configuration', async (c) => {
    const input = await readBody(c, z.strictObject({ config: strategyConfigurationSchema,
      revision: z.string().regex(/^[a-f0-9]{64}$/) }));
    return c.json(saveStrategyConfiguration(db, input, todayInVienna(new Date(now())), { actor: ACTOR, groupId: randomUUID() }));
  });
  app.post('/decision', async (c) => {
    const input = await readBody(c, z.strictObject({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      revision: z.string().regex(/^[a-f0-9]{64}$/) }));
    const asOf = now(), evidence = await provider(asOf);
    if (evidence.status !== 'verified') throw new ApiError(409, 'strategy_evidence_unavailable',
      'Ohne verifizierte Indexdaten und vollständigen US-Handelskalender wird keine Monatsentscheidung gespeichert.');
    return c.json(recordStrategyMonthlyDecision(db, evidence, input.month, asOf, input.revision,
      { actor: ACTOR, groupId: randomUUID() }));
  });
  return app;
}
