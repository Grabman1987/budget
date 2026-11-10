/**
 * Voluntary risk profile (Einstellungen › Profil). Deterministic and versioned; see
 * docs/risk-profile.md. Willingness to accept losses (tolerance) and financial ability to bear them
 * (capacity) are classified separately. A missing answer makes its dimension `unknown`; nothing is
 * inferred from age, household size or any other profile field.
 */

export const RISK_PROFILE_VERSION = 1;

/** Questions in display order. Options are ordered from most cautious (score 0) upwards. */
export const RISK_QUESTIONS = {
  horizon: { dimension: 'capacity', options: ['lt3', '3to7', '7to15', 'gt15'] },
  liquidity: { dimension: 'capacity', options: ['high', 'some', 'low'] },
  reserve: { dimension: 'capacity', options: ['lt3', '3to6', 'gt6'] },
  income: { dimension: 'capacity', options: ['unstable', 'moderate', 'stable'] },
  lossReaction: { dimension: 'tolerance', options: ['sellAll', 'sellPart', 'hold', 'buyMore'] },
  acceptableLoss: { dimension: 'tolerance', options: ['p10', 'p20', 'p35', 'p50'] },
} as const;

export type RiskQuestionKey = keyof typeof RISK_QUESTIONS;
export type RiskAnswers = {
  [K in RiskQuestionKey]: (typeof RISK_QUESTIONS)[K]['options'][number] | null;
};

export const RISK_QUESTION_KEYS = Object.keys(RISK_QUESTIONS) as RiskQuestionKey[];

export const EMPTY_RISK_ANSWERS: RiskAnswers = {
  horizon: null,
  liquidity: null,
  reserve: null,
  income: null,
  lossReaction: null,
  acceptableLoss: null,
};

export const isRiskAnswer = (key: RiskQuestionKey, value: unknown): boolean =>
  (RISK_QUESTIONS[key].options as readonly unknown[]).includes(value);

export type RiskLevel = 'low' | 'medium' | 'high' | 'unknown';

export interface RiskDimension {
  level: RiskLevel;
  /** Questions of this dimension that were answered / that exist. */
  answered: number;
  total: number;
  /** Questions still without an answer (why the level is `unknown`). */
  missing: RiskQuestionKey[];
}

export interface RiskClassification {
  version: number;
  tolerance: RiskDimension;
  capacity: RiskDimension;
  /** Both known and willingness is above capacity: the owner should look at this. */
  toleranceExceedsCapacity: boolean;
}

const RANK: Record<Exclude<RiskLevel, 'unknown'>, number> = { low: 0, medium: 1, high: 2 };

const score = (key: RiskQuestionKey, answers: RiskAnswers): number | null => {
  const value = answers[key];
  if (value === null) return null;
  const index = (RISK_QUESTIONS[key].options as readonly string[]).indexOf(value);
  return index < 0 ? null : index;
};

function dimension(
  which: 'tolerance' | 'capacity',
  answers: RiskAnswers,
  toLevel: (scores: Partial<Record<RiskQuestionKey, number>>) => Exclude<RiskLevel, 'unknown'>,
): RiskDimension {
  const keys = RISK_QUESTION_KEYS.filter((k) => RISK_QUESTIONS[k].dimension === which);
  const scores: Partial<Record<RiskQuestionKey, number>> = {};
  const missing: RiskQuestionKey[] = [];
  for (const key of keys) {
    const s = score(key, answers);
    if (s === null) missing.push(key);
    else scores[key] = s;
  }
  return {
    level: missing.length > 0 ? 'unknown' : toLevel(scores),
    answered: keys.length - missing.length,
    total: keys.length,
    missing,
  };
}

const sum = (scores: Partial<Record<RiskQuestionKey, number>>) =>
  Object.values(scores).reduce((a, b) => a + b, 0);

/**
 * Tolerance: two answers, 0..3 each, sum 0..6 → low 0–2, medium 3–4, high 5–6.
 * Capacity: four answers (horizon 0..3, others 0..2), sum 0..9 → low 0–3, medium 4–6, high 7–9;
 * a horizon under 3 years or a high liquidity need caps capacity at low.
 */
export function classifyRiskProfile(answers: RiskAnswers): RiskClassification {
  const tolerance = dimension('tolerance', answers, (s) => {
    const t = sum(s);
    return t <= 2 ? 'low' : t <= 4 ? 'medium' : 'high';
  });
  const capacity = dimension('capacity', answers, (s) => {
    if (s.horizon === 0 || s.liquidity === 0) return 'low';
    const t = sum(s);
    return t <= 3 ? 'low' : t <= 6 ? 'medium' : 'high';
  });
  return {
    version: RISK_PROFILE_VERSION,
    tolerance,
    capacity,
    toleranceExceedsCapacity:
      tolerance.level !== 'unknown' &&
      capacity.level !== 'unknown' &&
      RANK[tolerance.level] > RANK[capacity.level],
  };
}
