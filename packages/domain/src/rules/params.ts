import { z } from 'zod';

/**
 * Parameters of the rules R01 to R16 (concept §3.5). One zod schema per rule; every field has the
 * concept's default, so `PARAM_SCHEMAS[code].parse({})` is the default parameter set. Shares and
 * rates are basis points (10 000 = 100 %), money is integer cents, `*Months` / `*Days` are counts.
 * "badOverBp" is how far beyond a limit a rule turns from Warnung to verletzt.
 */

export const RULE_CODES = [
  'R01',
  'R02',
  'R03',
  'R04',
  'R05',
  'R06',
  'R07',
  'R08',
  'R09',
  'R10',
  'R11',
  'R12',
  'R13',
  'R14',
  'R15',
  'R16',
] as const;
export type RuleCode = (typeof RULE_CODES)[number];

const bp = z.number().int().min(0).max(100_000);
const count = z.number().int().min(0).max(1_200);

export const PARAM_SCHEMAS = {
  R01: z.object({
    needMaxBp: bp.default(5000),
    wantMaxBp: bp.default(3000),
    futureMinBp: bp.default(2000),
    badOverBp: bp.default(1000),
  }),
  R02: z.object({
    minMonths: count.default(3),
    targetMonths: count.default(6),
  }),
  R03: z.object({
    targetDays: count.default(30),
    badBelowDays: count.default(7),
  }),
  R04: z.object({
    /** Zukunft is funded within this many days after the salary (owner decision 01.10.2026). */
    withinDays: count.default(3),
    /** Salaries of the last n months are checked. */
    months: count.default(3),
  }),
  R05: z.object({
    /** Share of underfunded funds (bp) from which the rule is verletzt. */
    badUncoveredBp: bp.default(5000),
  }),
  R06: z.object({}),
  R07: z.object({
    horizonDays: z.number().int().min(1).max(365).default(90),
    minCents: z.number().int().default(0),
  }),
  R08: z.object({
    maxBp: bp.default(3000),
    badOverBp: bp.default(1000),
  }),
  R09: z.object({
    /** Interest above this counts as expensive debt. */
    rateBp: bp.default(500),
    strategy: z.enum(['avalanche', 'snowball']).default('avalanche'),
    /** An extra repayment within the last n months counts as active. */
    lookbackMonths: count.default(3),
  }),
  R10: z.object({
    maxBp: bp.default(5500),
    badOverBp: bp.default(1000),
  }),
  R11: z.object({
    /** Spending may outgrow income by this much before the rule warns. */
    toleranceBp: bp.default(0),
    badOverBp: bp.default(500),
  }),
  R12: z.object({
    enjoyBp: bp.default(1000),
    /** What may stay in "Zu verteilen" on top of the Genuss share (rounding, small change). */
    slackBp: bp.default(500),
    lookbackMonths: count.default(3),
    /** Envelopes (category ids) that count as Genuss. */
    enjoyCategoryIds: z.array(z.string()).default([]),
    /** Share of a special payment per envelope key (used by the 50/30/20 read model). */
    windfallShares: z.record(z.string(), z.number()).default({}),
  }),
  R13: z.object({
    /** Beyond `band x factor / 100` the rule is verletzt. */
    badFactorPct: z.number().int().min(100).max(1_000).default(200),
  }),
  R14: z.object({
    singleBp: bp.default(1000),
    platformBp: bp.default(2000),
    badOverBp: bp.default(500),
  }),
  R15: z.object({
    limitBp: bp.default(1000),
    badOverBp: bp.default(300),
  }),
  R16: z.object({
    /** Annual spend is the freedom number divided by this multiple (25 = 4 % rule). */
    multiple: z.number().int().min(1).max(100).default(25),
  }),
} as const satisfies Record<RuleCode, z.ZodType>;

export type RuleParams<C extends RuleCode> = z.infer<(typeof PARAM_SCHEMAS)[C]>;

/** The default parameters of a rule. */
export function defaultParams(code: RuleCode): Record<string, unknown> {
  return PARAM_SCHEMAS[code].parse({}) as Record<string, unknown>;
}

export const isRuleCode = (code: string): code is RuleCode =>
  (RULE_CODES as readonly string[]).includes(code);

/**
 * Apply an edit: the stored parameters with the patch on top, validated strictly (unknown keys
 * and out-of-range values throw a ZodError). Returns the complete parameter set.
 */
export function applyParamsPatch(
  code: RuleCode,
  current: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const schema = PARAM_SCHEMAS[code] as unknown as z.ZodObject<z.ZodRawShape>;
  const merged = { ...resolveParams(code, current), ...patch };
  return z.strictObject(schema.shape).parse(merged);
}

/**
 * Parameters as stored: the stored keys over the defaults. A stored value that no longer fits the
 * schema falls back to the default of the whole rule.
 */
export function resolveParams(code: RuleCode, stored: unknown): Record<string, unknown> {
  const parsed = PARAM_SCHEMAS[code].safeParse(
    stored !== null && typeof stored === 'object' ? stored : {},
  );
  return parsed.success ? (parsed.data as Record<string, unknown>) : defaultParams(code);
}
