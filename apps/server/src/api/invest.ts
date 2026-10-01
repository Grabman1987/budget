import {
  applySavingsProposal,
  assetClassesInUse,
  changeSavingsPlan,
  createAssetClass,
  createSavingsPlan,
  createSecurity,
  createTrade,
  deleteAssetClass,
  deleteSavingsPlan,
  deleteSecurity,
  deleteTargetVersion,
  deleteTrade,
  endSavingsPlan,
  getAssetClass,
  getSecurity,
  getTrade,
  listAssetClasses,
  listSavingsPlans,
  listSecurities,
  listTargetVersions,
  listTrades,
  portfolioSummary,
  portfolioPositions,
  investmentPreferences,
  setInvestmentCostMethod,
  restoreSecurity,
  SECURITY_KINDS,
  savingsExecutions,
  savingsProposal,
  setTargets,
  targetsAsOf,
  TRADE_KINDS,
  updateAssetClass,
  updateSecurity,
  updateTrade,
  accounts,
  type AssetTargetInput,
  type Db,
  type SavingsPlanInput,
  type TradeInput,
  type TradePatch,
} from '@budget/db';
import { monthOf, nextExecutionAfter, parseScaledDecimal } from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, ApiError, defined, readBody, readQuery } from './http';
import { day, month } from './schemas';

const id = z.string().min(1).max(64);
const text = z.string().max(500);
const bp = z.int().min(0).max(10_000);

// ---------- securities ----------
const securityFields = {
  name: z.string().min(1).max(120),
  kind: z.enum(SECURITY_KINDS),
  symbol: z.string().max(40).nullable(),
  /** ISO 6166: two letters, nine letters or digits, one check digit. */
  isin: z
    .string()
    .regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/, 'ISIN with 12 characters')
    .nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency code such as EUR'),
  terBp: bp,
  assetClassId: id.nullable(),
  /** The platform (broker, crypto or P2P provider) that holds the security. */
  institutionId: id.nullable(),
  benchmark: z.string().max(120).nullable(),
  fallbackQuoteId: z.string().max(60).nullable(),
  quoteExchange: z.string().max(40).nullable(),
  pricesEnabled: z.boolean(),
  quoteAdjusted: z.boolean(),
};
const securityCreate = z.object({
  ...securityFields,
  symbol: securityFields.symbol.optional(),
  isin: securityFields.isin.optional(),
  currency: securityFields.currency.default('EUR'),
  terBp: securityFields.terBp.default(0),
  assetClassId: securityFields.assetClassId.optional(),
  institutionId: securityFields.institutionId.optional(),
  benchmark: securityFields.benchmark.optional(),
  fallbackQuoteId: securityFields.fallbackQuoteId.optional(),
  quoteExchange: securityFields.quoteExchange.optional(),
  pricesEnabled: securityFields.pricesEnabled.optional(),
  quoteAdjusted: securityFields.quoteAdjusted.optional(),
});
const securityPatch = z
  .object(securityFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
const deletedQuery = z.object({ deleted: z.enum(['1', 'true']).optional() });

export function securityRoutes(db: Db): Hono {
  const app = new Hono();
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });
  const found = (securityId: string) => {
    const row = getSecurity(db, securityId);
    if (!row) throw new ApiError(404, 'not_found', `Security ${securityId} not found`);
    return row;
  };

  app.get('/', (c) => {
    const { deleted } = readQuery(c, deletedQuery);
    return c.json({ securities: listSecurities(db, { includeDeleted: deleted !== undefined }) });
  });
  app.post('/', async (c) => {
    const body = await readBody(c, securityCreate);
    const ctx = audit();
    const row = createSecurity(db, defined(body), ctx);
    return c.json({ security: row, groupId: ctx.groupId }, 201);
  });
  app.get('/:id', (c) => c.json({ security: found(c.req.param('id')) }));
  app.patch('/:id', async (c) => {
    const body = await readBody(c, securityPatch);
    const ctx = audit();
    const row = updateSecurity(db, c.req.param('id'), defined(body), ctx);
    return c.json({ security: row, groupId: ctx.groupId });
  });
  app.delete('/:id', (c) => {
    const ctx = audit();
    deleteSecurity(db, c.req.param('id'), ctx);
    return c.json({ groupId: ctx.groupId });
  });
  app.post('/:id/restore', (c) => {
    const ctx = audit();
    return c.json({ security: restoreSecurity(db, c.req.param('id'), ctx), groupId: ctx.groupId });
  });
  return app;
}

// ---------- asset classes ----------
const classCreate = z.object({ name: z.string().min(1).max(80), sortOrder: z.int().optional() });
const classPatch = classCreate
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
const targetsBody = z.object({
  validFrom: day,
  targets: z
    .array(z.object({ assetClassId: id, targetShareBp: bp, bandBp: bp.optional() }))
    .min(1)
    .max(50),
});

export function assetClassRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });

  app.get('/', (c) => {
    const current = new Map(targetsAsOf(db, today()).map((t) => [t.assetClassId, t]));
    const inUse = assetClassesInUse(db);
    return c.json({
      assetClasses: listAssetClasses(db).map((cls) => ({
        ...cls,
        target: current.get(cls.id) ?? null,
        inUse: inUse.has(cls.id),
      })),
    });
  });
  app.post('/', async (c) => {
    const body = await readBody(c, classCreate);
    const ctx = audit();
    const row = createAssetClass(db, defined(body), ctx);
    return c.json({ assetClass: row, groupId: ctx.groupId }, 201);
  });

  // Fixed paths before `/:id`.
  app.get('/targets', (c) => c.json({ versions: listTargetVersions(db) }));
  app.put('/targets', async (c) => {
    const { validFrom, targets } = await readBody(c, targetsBody);
    const ctx = audit();
    const version = setTargets(
      db,
      validFrom,
      targets.map((t) => defined<AssetTargetInput>(t)),
      ctx,
    );
    return c.json({ version, groupId: ctx.groupId });
  });
  app.delete('/targets/:validFrom', (c) => {
    const validFrom = day.parse(c.req.param('validFrom'));
    const ctx = audit();
    deleteTargetVersion(db, validFrom, ctx);
    return c.json({ groupId: ctx.groupId });
  });

  app.patch('/:id', async (c) => {
    const body = await readBody(c, classPatch);
    const ctx = audit();
    const row = updateAssetClass(db, c.req.param('id'), defined(body), ctx);
    return c.json({ assetClass: row, groupId: ctx.groupId });
  });
  app.delete('/:id', (c) => {
    if (!getAssetClass(db, c.req.param('id')))
      throw new ApiError(404, 'not_found', 'Asset class not found');
    const ctx = audit();
    deleteAssetClass(db, c.req.param('id'), ctx);
    return c.json({ groupId: ctx.groupId });
  });
  return app;
}

// ---------- trades ----------
/** Units as the signed integer (1e-8) or as decimal text with an optional sign (`-2.5`). */
const unitsFields = {
  unitsE8: z.int().optional(),
  units: z
    .string()
    .regex(/^-?\d+(\.\d{1,8})?$/, 'Units with at most 8 decimals')
    .optional(),
};
const oneUnits = (v: { unitsE8?: number | undefined; units?: string | undefined }) =>
  v.unitsE8 === undefined || v.units === undefined;
const unitsOf = (v: { unitsE8?: number | undefined; units?: string | undefined }) =>
  v.units !== undefined ? parseScaledDecimal(v.units, 8) : v.unitsE8;

const tradeCreate = z
  .object({
    securityId: id,
    accountId: id,
    date: day,
    kind: z.enum(TRADE_KINDS),
    ...unitsFields,
    amountCents: z.int().min(0),
    feeCents: z.int().min(0).optional(),
    taxCents: z.int().min(0).optional(),
    importKey: z.string().min(1).max(200).nullable().optional(),
    note: text.nullable().optional(),
  })
  .refine(oneUnits, 'Give either unitsE8 or units');
const tradePatch = z
  .object({
    securityId: id,
    date: day,
    kind: z.enum(TRADE_KINDS),
    ...unitsFields,
    amountCents: z.int().min(0),
    feeCents: z.int().min(0),
    taxCents: z.int().min(0),
    note: text.nullable(),
  })
  .partial()
  .refine(oneUnits, 'Give either unitsE8 or units')
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
const tradeQuery = z.object({
  account: id.optional(),
  security: id.optional(),
  from: day.optional(),
  to: day.optional(),
});

export function tradeRoutes(db: Db): Hono {
  const app = new Hono();
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });

  app.get('/', (c) => {
    const { account, security, from, to } = readQuery(c, tradeQuery);
    return c.json({
      trades: listTrades(db, defined({ accountId: account, securityId: security, from, to })),
    });
  });
  app.get('/:id', (c) => c.json({ trade: getTrade(db, c.req.param('id')) }));

  app.post('/', async (c) => {
    const { units, unitsE8, ...rest } = await readBody(c, tradeCreate);
    const account = accounts.get(db, rest.accountId);
    if (account?.closedAt)
      throw new ApiError(409, 'account_closed', 'The account is closed; reopen it first');
    const ctx = audit();
    const result = createTrade(
      db,
      defined<TradeInput>({ ...rest, unitsE8: unitsOf({ units, unitsE8 }) }),
      ctx,
    );
    return c.json({ ...result, groupId: ctx.groupId }, result.duplicate ? 200 : 201);
  });
  app.patch('/:id', async (c) => {
    const { units, unitsE8, ...rest } = await readBody(c, tradePatch);
    const ctx = audit();
    const result = updateTrade(
      db,
      c.req.param('id'),
      defined<TradePatch>({ ...rest, unitsE8: unitsOf({ units, unitsE8 }) }),
      ctx,
    );
    return c.json({ ...result, groupId: ctx.groupId });
  });
  app.delete('/:id', (c) => {
    const ctx = audit();
    deleteTrade(db, c.req.param('id'), ctx);
    return c.json({ groupId: ctx.groupId });
  });
  return app;
}

// ---------- savings plans ----------
const planCreate = z.object({
  securityId: id,
  accountId: id,
  sourceAccountId: id.nullable().optional(),
  amountCents: z.int().positive(),
  dayOfMonth: z.int().min(1).max(31),
  validFrom: day.optional(),
  note: text.nullable().optional(),
});
const planPatch = z
  .object({
    amountCents: z.int().positive(),
    dayOfMonth: z.int().min(1).max(31),
    sourceAccountId: id.nullable(),
    note: text.nullable(),
    /** First day the change applies; default the next execution day. */
    from: day,
  })
  .partial()
  .refine((v) => Object.keys(v).filter((k) => k !== 'from').length > 0, 'Nothing to change');
const stepSchema = z.int().min(1).max(1_000_000);
const proposalQuery = z.object({ step: z.coerce.number().pipe(stepSchema).optional() });
const applyBody = z.object({ stepCents: stepSchema.optional() });
const planEnd = z.object({ to: day.optional() });
const planListQuery = z.object({ ended: z.enum(['1', 'true']).optional() });
const executionsQuery = z.object({ month: month.optional() });

export function savingsPlanRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });

  app.get('/', (c) => {
    const { ended } = readQuery(c, planListQuery);
    return c.json({ plans: listSavingsPlans(db, { includeEnded: ended !== undefined }) });
  });
  app.post('/', async (c) => {
    const body = await readBody(c, planCreate);
    const ctx = audit();
    const plan = createSavingsPlan(
      db,
      defined<SavingsPlanInput>({ ...body, validFrom: body.validFrom ?? today() }),
      ctx,
    );
    return c.json({ plan, groupId: ctx.groupId }, 201);
  });

  // Fixed paths before `/:id`.
  app.get('/executions', (c) => {
    const { month: m } = readQuery(c, executionsQuery);
    const now = today();
    const target = m ?? monthOf(now);
    return c.json({ month: target, executions: savingsExecutions(db, target, now) });
  });
  app.get('/proposal', (c) => {
    const { step } = readQuery(c, proposalQuery);
    const { basis, ...proposal } = savingsProposal(db, today(), defined({ stepCents: step }));
    return c.json({ proposal, basis });
  });
  app.post('/apply', async (c) => {
    // The body is optional: an empty one applies the proposal with the default step.
    const raw = await c.req.text();
    const { stepCents } = applyBody.parse(raw.trim() ? JSON.parse(raw) : {});
    const ctx = audit();
    return c.json(applySavingsProposal(db, today(), ctx, defined({ stepCents })));
  });

  app.patch('/:id', async (c) => {
    const { from, ...change } = await readBody(c, planPatch);
    const plan = listSavingsPlans(db).find((p) => p.id === c.req.param('id'));
    if (!plan) throw new ApiError(404, 'not_found', 'Open savings plan not found');
    const start = from ?? nextExecutionAfter(change.dayOfMonth ?? plan.dayOfMonth, today());
    const ctx = audit();
    const row = changeSavingsPlan(db, plan.id, defined(change), start, ctx);
    return c.json({ plan: row, groupId: ctx.groupId });
  });
  app.post('/:id/end', async (c) => {
    const { to } = await readBody(c, planEnd);
    const ctx = audit();
    return c.json({
      plan: endSavingsPlan(db, c.req.param('id'), to ?? today(), ctx),
      groupId: ctx.groupId,
    });
  });
  app.delete('/:id', (c) => {
    const ctx = audit();
    deleteSavingsPlan(db, c.req.param('id'), ctx);
    return c.json({ groupId: ctx.groupId });
  });
  return app;
}

// ---------- portfolio ----------
const portfolioQuery = z.object({
  period: z.enum(['1M', '3M', 'YTD', '1J', '3J', 'Alles']).default('1J'),
  view: z.enum(['securities', 'depot']).default('securities'),
  benchmark: id.optional(),
  /** Depot view: comma-separated reference account ids (default: the investment accounts). */
  reference: z.string().max(2000).optional(),
});

export function portfolioRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/positions', (c) => c.json(portfolioPositions(db, today())));
  app.get('/preferences', (c) => c.json(investmentPreferences(db)));
  app.patch('/preferences', async (c) => {
    const { costMethod } = await readBody(
      c,
      z.strictObject({ costMethod: z.enum(['average', 'fifo']) }),
    );
    const ctx = { actor: ACTOR, groupId: randomUUID() };
    return c.json({ ...setInvestmentCostMethod(db, costMethod, ctx), groupId: ctx.groupId });
  });
  app.get('/', (c) => {
    const { period, view, benchmark, reference } = readQuery(c, portfolioQuery);
    const refs = reference?.split(',').filter(Boolean);
    return c.json({
      portfolio: portfolioSummary(
        db,
        defined({
          today: today(),
          period,
          view,
          benchmarkSecurityId: benchmark,
          referenceAccounts: refs && refs.length > 0 ? refs : undefined,
        }),
      ),
    });
  });
  return app;
}
