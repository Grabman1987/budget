import {
  recordStrategyMonthlyDecision, saveStrategyConfiguration,
  portfolioStrategyWithRebalanceView, reviewStrategyRebalance, linkStrategyRebalanceTrade,
  unlinkStrategyRebalanceTrade, closeStrategyRebalance, strategyRebalanceTradeFacts,
  MISSING_STRATEGY_EVIDENCE, type Db, type StrategyEvidence,
} from '@budget/db';
import { STRATEGY_CATEGORIES, strategyConfigurationSchema, todayInVienna } from '@budget/domain';
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
    return c.json(portfolioStrategyWithRebalanceView(db, asOf, evidence));
  });
  app.put('/configuration', async (c) => {
    const input = await readBody(c, z.strictObject({ config: strategyConfigurationSchema,
      revision: z.string().regex(/^[a-f0-9]{64}$/) }));
    return c.json(saveStrategyConfiguration(db, input, todayInVienna(new Date(now())), { actor: ACTOR, groupId: randomUUID() }));
  });
  app.post('/decision', async (c) => {
    const input = await readBody(c, z.strictObject({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      revision: z.string().regex(/^[a-f0-9]{64}$/),
      decisionRevision: z.string().regex(/^[a-f0-9]{64}$/) }));
    const asOf = now(), evidence = await provider(asOf);
    if (evidence.status !== 'verified') throw new ApiError(409, 'strategy_evidence_unavailable',
      'Ohne verifizierte Indexdaten und vollständigen US-Handelskalender wird keine Monatsentscheidung gespeichert.');
    return c.json(recordStrategyMonthlyDecision(db, evidence, input.month, asOf, input.revision, input.decisionRevision,
      { actor: ACTOR, groupId: randomUUID() }));
  });
  const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
  const revision = z.string().regex(/^[a-f0-9]{64}$/);
  const requestId = z.uuid();
  const eventBase = { month, revision, requestId };
  app.get('/rebalance/trade/:id', (c) => c.json(strategyRebalanceTradeFacts(db, c.req.param('id'))));
  app.post('/rebalance/review', async (c) => {
    const input = await readBody(c, z.strictObject({ ...eventBase, decisionRevision: revision,
      proposalRevision: revision }));
    return c.json(reviewStrategyRebalance(db, input, now(), { actor: ACTOR, groupId: randomUUID() }));
  });
  app.post('/rebalance/link', async (c) => {
    const input = await readBody(c, z.strictObject({ ...eventBase,
      tradeId: z.string().min(1).max(200), tradeRevision: revision,
      category: z.enum(STRATEGY_CATEGORIES) }));
    return c.json(linkStrategyRebalanceTrade(db, input, now(), { actor: ACTOR, groupId: randomUUID() }));
  });
  app.post('/rebalance/unlink', async (c) => {
    const input = await readBody(c, z.strictObject({ ...eventBase, tradeId: z.string().min(1).max(200) }));
    return c.json(unlinkStrategyRebalanceTrade(db, input, { actor: ACTOR, groupId: randomUUID() }));
  });
  app.post('/rebalance/close', async (c) => {
    const input = await readBody(c, z.strictObject({ ...eventBase,
      outcome: z.enum(['completed', 'cancelled', 'partial_closed', 'reopen']) }));
    return c.json(closeStrategyRebalance(db, input, { actor: ACTOR, groupId: randomUUID() }));
  });
  return app;
}
