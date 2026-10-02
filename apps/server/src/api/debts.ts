import { accountSummaries, debtsAsOf, type Db } from '@budget/db';
import { MAX_PAYOFF_MONTHS, PaymentBelowInterestError, payoffPlan } from '@budget/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { ApiError, readBody, readQuery } from './http';
import { day } from './schemas';

const amount = z.int().min(0);
const modelMonth = z.string().regex(/^(19\d{2}|[2-8]\d{3}|9[0-8]\d{2})-(0[1-9]|1[0-2])$/);
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
