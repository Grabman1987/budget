import {
  accountSummaries,
  compareDebtStrategies,
  debtCandidates,
  debtsAsOf,
  loanPlanView,
  removeLoanRateChange,
  removeLoanScenario,
  saveLoanRateChange,
  saveLoanScenario,
  type Db,
} from '@budget/db';
import {
  loanMeasureSchema,
  loanScenarioInputSchema,
  MAX_LOAN_AMOUNT_CENTS,
  MAX_LOAN_RATE_BP,
  MAX_PAYOFF_MONTHS,
  MAX_SCENARIO_MEASURES,
  PaymentBelowInterestError,
  payoffPlan,
} from '@budget/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, ApiError, readBody, readQuery } from './http';
import { day } from './schemas';

const amount = z.int().min(0);
const modelMonth = z.string().regex(/^(19\d{2}|[2-8]\d{3}|9[0-8]\d{2})-(0[1-9]|1[0-2])$/);
const planQuery = z.object({
  asOf: day.optional(),
  startMonth: modelMonth.optional(),
});
const rateChange = z
  .object({
    validFrom: day.refine(
      (v) => v >= '1900-01-01' && v <= '9899-12-31',
      'Datum außerhalb 1900–9899',
    ),
    rateBp: z.int().min(0).max(MAX_LOAN_RATE_BP),
  })
  .strict();
const draftBody = z
  .object({
    asOf: day.optional(),
    startMonth: modelMonth.optional(),
    measures: z.array(loanMeasureSchema).min(1).max(MAX_SCENARIO_MEASURES),
  })
  .strict();
const strategyBody = z
  .object({
    asOf: day.optional(),
    startMonth: modelMonth,
    extraCents: z.int().min(0).max(MAX_LOAN_AMOUNT_CENTS),
    debts: z
      .array(
        z
          .object({
            accountId: z.string().min(1).max(100),
            rateBp: z.int().min(0).max(MAX_LOAN_RATE_BP),
            minimumCents: z.int().min(0).max(MAX_LOAN_AMOUNT_CENTS),
            monthlyFeeCents: z.int().min(0).max(MAX_LOAN_AMOUNT_CENTS),
          })
          .strict(),
      )
      .min(2)
      .max(20),
  })
  .strict();
const scenario = z
  .object({
    asOf: day,
    startMonth: modelMonth,
    rateBp: z.int().min(0).max(100_000),
    paymentCents: amount,
    extraCents: amount,
    monthlyFeeCents: amount,
  })
  .strict();

/** Reject unsafe sums before calculation; no approximate cent values are returned. */
function safeNumbers(value: unknown): boolean {
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (Array.isArray(value)) return value.every(safeNumbers);
  if (value && typeof value === 'object') return Object.values(value).every(safeNumbers);
  return true;
}

export function debtRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const { asOf } = readQuery(c, z.object({ asOf: day.default(today()) }));
    if (asOf > today()) throw new ApiError(400, 'invalid', 'Der Stichtag liegt in der Zukunft.');
    try {
      return c.json(debtsAsOf(db, asOf));
    } catch (error) {
      if (error instanceof RangeError)
        throw new ApiError(
          422,
          'valuation_unavailable',
          'Die aktuelle Restschuld überschreitet die sichere Rechengrenze.',
          { reason: 'calculation_limit' },
        );
      throw error;
    }
  });
  /** The model days: never in the future, the first modelled month not before the day. */
  const modelDays = (asOfInput: string | undefined, startInput: string | undefined) => {
    const asOf = asOfInput ?? today();
    if (asOf > today()) throw new ApiError(400, 'invalid', 'Der Stichtag liegt in der Zukunft.');
    const startMonth = startInput ?? asOf.slice(0, 7);
    if (startMonth < asOf.slice(0, 7))
      throw new ApiError(400, 'invalid', 'Der Modellmonat liegt vor dem Stichtag.');
    return { asOf, startMonth };
  };
  // Multi-debt strategies: every open debt with its stored terms, then avalanche against snowball.
  app.get('/strategies', (c) => {
    const q = readQuery(c, planQuery);
    const { asOf, startMonth } = modelDays(q.asOf, q.startMonth);
    return c.json({ asOf, startMonth, debts: debtCandidates(db, asOf, startMonth) });
  });
  app.post('/strategies', async (c) => {
    const input = await readBody(c, strategyBody);
    const { asOf, startMonth } = modelDays(input.asOf, input.startMonth);
    return c.json(compareDebtStrategies(db, asOf, { ...input, startMonth }));
  });
  // Persisted per-loan planning: variable conditions and scenarios; writes are audited (undo).
  app.get('/:id/plan', (c) => {
    const q = readQuery(c, planQuery);
    const { asOf, startMonth } = modelDays(q.asOf, q.startMonth);
    return c.json(loanPlanView(db, c.req.param('id'), asOf, { startMonth }));
  });
  app.post('/:id/plan/preview', async (c) => {
    const input = await readBody(c, draftBody);
    const { asOf, startMonth } = modelDays(input.asOf, input.startMonth);
    return c.json(loanPlanView(db, c.req.param('id'), asOf, { startMonth, draft: input.measures }));
  });
  app.post('/:id/rate-changes', async (c) =>
    c.json(
      saveLoanRateChange(db, c.req.param('id'), null, await readBody(c, rateChange), {
        actor: ACTOR,
      }),
      201,
    ),
  );
  app.put('/:id/rate-changes/:changeId', async (c) =>
    c.json(
      saveLoanRateChange(
        db,
        c.req.param('id'),
        c.req.param('changeId'),
        await readBody(c, rateChange),
        { actor: ACTOR },
      ),
    ),
  );
  app.delete('/:id/rate-changes/:changeId', (c) =>
    c.json(removeLoanRateChange(db, c.req.param('id'), c.req.param('changeId'), { actor: ACTOR })),
  );
  app.post('/:id/scenarios', async (c) =>
    c.json(
      saveLoanScenario(
        db,
        c.req.param('id'),
        null,
        await readBody(c, loanScenarioInputSchema),
        today(),
        { actor: ACTOR },
      ),
      201,
    ),
  );
  app.put('/:id/scenarios/:scenarioId', async (c) =>
    c.json(
      saveLoanScenario(
        db,
        c.req.param('id'),
        c.req.param('scenarioId'),
        await readBody(c, loanScenarioInputSchema),
        today(),
        { actor: ACTOR },
      ),
    ),
  );
  app.delete('/:id/scenarios/:scenarioId', (c) =>
    c.json(removeLoanScenario(db, c.req.param('id'), c.req.param('scenarioId'), { actor: ACTOR })),
  );
  // Nonmutating computation: the app's session, origin, body-size and rate guards still apply.
  app.post('/:id/projection', async (c) => {
    const input = await readBody(c, scenario);
    if (input.asOf > today())
      throw new ApiError(400, 'invalid', 'Der Stichtag liegt in der Zukunft.');
    if (input.startMonth < input.asOf.slice(0, 7))
      throw new ApiError(400, 'invalid', 'Der Modellmonat liegt vor dem Stichtag.');
    const account = accountSummaries(db, input.asOf).find((a) => a.id === c.req.param('id'));
    if (!account) throw new ApiError(404, 'not_found', 'Konto nicht gefunden.');
    if (account.type !== 'loan' || account.balanceCents >= 0)
      throw new ApiError(
        422,
        'invalid_projection',
        'Nur ein Kredit mit offener Restschuld kann berechnet werden.',
      );
    const balanceCents = -account.balanceCents;
    if (!Number.isSafeInteger(balanceCents))
      throw new ApiError(
        422,
        'invalid_projection',
        'Die Restschuld überschreitet die sichere Rechengrenze.',
      );
    // Bound every potential accumulated amount using BigInt, independently of engine arithmetic.
    const worstInterest = (BigInt(balanceCents) * BigInt(input.rateBp) + 119999n) / 120000n;
    const upper =
      BigInt(balanceCents) +
      BigInt(MAX_PAYOFF_MONTHS) * (worstInterest + BigInt(input.monthlyFeeCents));
    if (
      upper > BigInt(Number.MAX_SAFE_INTEGER) ||
      !Number.isSafeInteger(input.paymentCents + input.extraCents)
    )
      throw new ApiError(
        422,
        'invalid_projection',
        'Die Beträge überschreiten die sichere Rechengrenze.',
      );
    try {
      const plan = payoffPlan({ ...input, balanceCents, maxMonths: MAX_PAYOFF_MONTHS });
      if (!safeNumbers(plan)) throw new RangeError('Unsafe result');
      return c.json({
        accountId: account.id,
        currency: account.currency,
        balanceCents,
        ...input,
        plan,
      });
    } catch (error) {
      if (error instanceof PaymentBelowInterestError)
        throw new ApiError(
          422,
          'invalid_projection',
          'Die Monatsrate muss Zinsen und Gebühren übersteigen.',
        );
      if (error instanceof RangeError)
        throw new ApiError(
          422,
          'invalid_projection',
          'Kein sicherer Tilgungsplan innerhalb von 1.200 Monaten möglich.',
        );
      throw error;
    }
  });
  return app;
}
