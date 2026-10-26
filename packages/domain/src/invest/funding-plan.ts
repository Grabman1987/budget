import { z } from 'zod';

const money = z.int().min(0).max(Number.MAX_SAFE_INTEGER);
const bp = z.int().min(0).max(10000);
export const fundingPlanSchema = z
  .strictObject({
    version: z.literal(1),
    monthlyCents: money,
    oneOffCents: money,
    freeCashCents: money,
    fixedFeeCents: money,
    variableFeeBp: bp,
    maxFeeBp: bp,
    stage: z.int().min(0).nullable(),
    rows: z
      .array(
        z.strictObject({
          name: z.string().trim().min(1).max(120),
          securityId: z.string().min(1).max(64).nullable(),
          valueCents: money,
          priceCents: money,
          fractional: z.boolean(),
        }),
      )
      .min(1)
      .max(20),
    stages: z
      .array(z.strictObject({ fromCents: money, weights: z.array(bp).min(1).max(20) }))
      .min(1)
      .max(10),
  })
  .superRefine((p, ctx) => {
    if (p.stage !== null && p.stage >= p.stages.length)
      ctx.addIssue({ code: 'custom', message: 'Bitte eine vorhandene Stufe wählen.' });
    p.stages.forEach((s, i) => {
      if (s.weights.length !== p.rows.length || s.weights.reduce((a, b) => a + b, 0) !== 10000)
        ctx.addIssue({
          code: 'custom',
          message: 'Jede Stufe muss für alle Bausteine genau 100 % ergeben.',
        });
      if ((i === 0 && s.fromCents !== 0) || (i > 0 && s.fromCents <= p.stages[i - 1]!.fromCents))
        ctx.addIssue({ code: 'custom', message: 'Stufen beginnen bei 0 und steigen streng an.' });
    });
    const ids = p.rows.flatMap((r) => (r.securityId ? [r.securityId] : []));
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Jedes Instrument darf nur einmal zugeordnet werden.',
      });
  });
export type FundingPlan = z.infer<typeof fundingPlanSchema>;
export interface FundingPlanState {
  plan: FundingPlan | null;
  revision: string;
  unavailable: boolean;
}

/** Explicit editable owner template; no product identifiers, orders or financial ledger writes. */
export function fundingTemplate(): FundingPlan {
  return {
    version: 1,
    monthlyCents: 0,
    oneOffCents: 0,
    freeCashCents: 0,
    fixedFeeCents: 0,
    variableFeeBp: 0,
    maxFeeBp: 50,
    stage: 2,
    rows: ['Global', 'Efficient Core', 'Aktien-Booster', 'Gold', 'Bitcoin', 'Managed Futures'].map(
      (name) => ({ name, securityId: null, valueCents: 0, priceCents: 0, fractional: false }),
    ),
    stages: [
      { fromCents: 0, weights: [6500, 2500, 1000, 0, 0, 0] },
      { fromCents: 1000000, weights: [6000, 2000, 1000, 500, 500, 0] },
      { fromCents: 5000000, weights: [5000, 2000, 1000, 500, 500, 1000] },
    ],
  };
}
function safe(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < 0n)
    throw new RangeError('Der Betrag oder die Stückzahl ist zu groß.');
  return Number(value);
}
function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + BigInt(b), 0n);
  if (!sum) return weights.map(() => 0);
  const numerators = weights.map((w) => BigInt(total) * BigInt(w));
  const parts = numerators.map((n) => safe(n / sum));
  let rest = total - parts.reduce((a, b) => a + b, 0);
  for (const { i } of numerators
    .map((n, i) => ({ i, r: n % sum }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1))) {
    if (rest-- <= 0) break;
    parts[i]!++;
  }
  return parts;
}

/** Snapshot scenario only. All fees are inside the budget; skipped orders retain their cash. */
export function calculateFunding(input: FundingPlan) {
  const p = fundingPlanSchema.parse(input);
  const budgetCents = safe(
    BigInt(p.monthlyCents) + BigInt(p.oneOffCents) + BigInt(p.freeCashCents),
  );
  const wealthCents = safe(p.rows.reduce((a, r) => a + BigInt(r.valueCents), BigInt(budgetCents)));
  const stage = p.stage ?? p.stages.findLastIndex((s) => wealthCents >= s.fromCents);
  const weights = p.stages[stage]!.weights;
  const targets = split(wealthCents, weights);
  const monthly = split(p.monthlyCents, weights);
  const budgets = split(
    budgetCents,
    targets.map((t, i) => Math.max(0, t - p.rows[i]!.valueCents)),
  );
  const rows = p.rows.map((r, i) => {
    const budget = budgets[i]!;
    const maxBuy =
      (BigInt(Math.max(0, budget - p.fixedFeeCents)) * 10000n) / BigInt(10000 + p.variableFeeBp);
    const step = r.fractional ? 1n : 100000000n;
    const units = r.priceCents ? ((maxBuy * 100000000n) / BigInt(r.priceCents) / step) * step : 0n;
    const gross = (units * BigInt(r.priceCents) + 99999999n) / 100000000n;
    const fee = gross
      ? BigInt(p.fixedFeeCents) + (gross * BigInt(p.variableFeeBp) + 9999n) / 10000n
      : 0n;
    const tooCostly = gross > 0n && fee * 10000n > gross * BigInt(p.maxFeeBp);
    return {
      targetBp: weights[i]!,
      targetCents: targets[i]!,
      monthlyCents: monthly[i]!,
      budgetCents: budget,
      overweightCents: Math.max(0, r.valueCents - targets[i]!),
      unitsE8: tooCostly ? 0 : safe(units),
      buyCents: tooCostly ? 0 : safe(gross),
      feeCents: tooCostly ? 0 : safe(fee),
      status: !budget
        ? 'Kein Kaufbedarf'
        : !r.priceCents
          ? 'Kurs eintragen'
          : !units
            ? 'Betrag ansparen'
            : tooCostly
              ? 'Gebühren bündeln'
              : 'Kaufvorschlag',
    };
  });
  const buysCents = safe(rows.reduce((a, r) => a + BigInt(r.buyCents), 0n));
  const feesCents = safe(rows.reduce((a, r) => a + BigInt(r.feeCents), 0n));
  return {
    stage,
    wealthCents,
    budgetCents,
    rows,
    buysCents,
    feesCents,
    remainingCents: budgetCents - buysCents - feesCents,
  };
}
