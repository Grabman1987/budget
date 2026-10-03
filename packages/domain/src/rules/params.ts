import { z } from 'zod';

/**
 * Parameters of the registered rules (concept §3.5). One zod schema per rule; every field has the
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
  'R17',
  'R18',
  'R19',
  'R20',
  'R21',
  'R22',
] as const;
export const BOOK_RULE_CODES = RULE_CODES.filter((code) => Number(code.slice(1)) >= 17);
export const DEFAULT_ACTIVE_RULE_COUNT = RULE_CODES.length - BOOK_RULE_CODES.length;

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
  // Book-derived rules: every threshold and inclusion is configurable through the params patch.
  R17: z
    .object({
      targetBp: bp.default(2500),
      minBp: bp.default(1500),
      includeEmployerPension: z.boolean().default(true),
      maxSeverity: z.enum(['bad', 'warn']).default('bad'),
    })
    .refine((p) => p.minBp <= p.targetBp, {
      message: 'Minimum must not exceed target',
      path: ['minBp'],
    }),
  R18: z
    .object({
      okFromX100: count.default(100),
      warnFromX100: count.default(50),
      aboveAverageX100: count.default(200),
      // Owner decision: this benchmark can never turn red.
      maxSeverity: z.literal('warn').default('warn'),
      minAge: count.default(25),
      includeCapitalIncome: z.boolean().default(true),
    })
    .refine((p) => p.warnFromX100 <= p.okFromX100, {
      message: 'Lower benchmark must not exceed target',
      path: ['warnFromX100'],
    }),
  R19: z
    .object({
      minGrowthBp: bp.default(300),
      targetBp: bp.default(5000),
      minBp: bp.default(2500),
    })
    .refine((p) => p.minBp <= p.targetBp, {
      message: 'Minimum must not exceed target',
      path: ['minBp'],
    }),
  R20: z
    .object({
      okMonths: z.int().min(0).max(12).default(11),
      warnMonths: z.int().min(0).max(12).default(9),
      exemptDebtPriority: z.boolean().default(true),
    })
    .refine((p) => p.warnMonths <= p.okMonths, {
      message: 'Warning must not exceed target',
      path: ['warnMonths'],
    }),
  R21: z
    .object({
      leverageMaxBp: bp.default(1000),
      leverageBadOverBp: bp.default(500),
      ignoreBelowCents: z.int().min(0).max(100_000_000).default(10_000),
      debitWarnFromBp: bp.default(1),
      debitBadOverBp: bp.default(500),
    })
    .refine((p) => p.debitWarnFromBp <= p.debitBadOverBp, {
      message: 'Warning must not exceed bad threshold',
      path: ['debitWarnFromBp'],
    }),
  R22: z.object({
    maxBp: bp.default(30),
    badOverBp: bp.default(30),
    maxUnknownSharePct: z.int().min(0).max(100).default(20),
    excludeLeveraged: z.boolean().default(true),
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
  return schema.strict().parse(merged);
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
