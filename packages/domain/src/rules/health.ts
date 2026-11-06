import { savingsRate } from '../kpi';
import { cents, formatEuro } from '../money';
import { formatPercent } from './format';
import type { RuleStatus } from './types';

/** Changing criteria, weights, eligibility or rounding requires a new version. */
export const HEALTH_METHOD_VERSION = 'budget-health-v1' as const;
export const HEALTH_CATEGORY_WEIGHTS = { cashflow: 40, debt: 30, portfolio: 30 } as const;
export type HealthCategoryId = keyof typeof HEALTH_CATEGORY_WEIGHTS;
export type HealthReason =
  | 'no_data'
  | 'source_unavailable'
  | 'valuation_unavailable'
  | 'incomplete_service'
  | 'missing_income'
  | 'missing_history'
  | 'missing_targets'
  | 'unknown_platform'
  | 'invalid_source'
  | 'date_mismatch'
  | 'no_portfolio';
export interface HealthWindow {
  from: string;
  to: string;
}
export type HealthSource<T> =
  | { state: 'available'; asOf: string; window: HealthWindow; facts: T }
  | { state: 'unavailable'; asOf: string; reason: HealthReason }
  | { state: 'not_applicable'; asOf: string; reason: 'no_portfolio' };

export interface HealthCashflowFacts {
  incomeCents: number;
  consumptionCents: number;
  targetBp: number;
  months: number;
}
export interface HealthReserveFacts {
  reserveCents: number;
  averageNeedCents: number;
  tenthsOfMonth: number;
  targetMonths: number;
  months: number;
}
export interface HealthDebtFacts {
  mode: 'no_debt' | 'funded_cards' | 'service';
  debtCents: number;
  paymentsCents: number;
  incomeCents: number | null;
  ratioBp: number | null;
  maxBp: number;
  badOverBp: number;
  status: RuleStatus;
}
export interface HealthPortfolioFacts {
  status: RuleStatus;
  valueText: string;
  thresholdText: string;
  evidence?: Record<string, unknown>;
}
export interface FinancialHealthInput {
  asOf: string;
  cashflow: HealthSource<HealthCashflowFacts>;
  reserves: HealthSource<HealthReserveFacts>;
  debt: HealthSource<HealthDebtFacts>;
  structure: HealthSource<HealthPortfolioFacts>;
  concentration: HealthSource<HealthPortfolioFacts>;
  speculation: HealthSource<HealthPortfolioFacts>;
}
export type HealthMetricId = Exclude<keyof FinancialHealthInput, 'asOf'>;
export interface HealthMetric {
  id: HealthMetricId;
  weight: number;
  score: number | null;
  state: HealthSource<unknown>['state'];
  reason: HealthReason | null;
  explanation: string;
  basis: string[];
  source: HealthSource<unknown>;
}
export interface HealthCategory {
  id: HealthCategoryId;
  weight: number;
  score: number | null;
  state: 'complete' | 'partial' | 'unavailable' | 'not_applicable';
  coverageBp: number;
  metrics: HealthMetric[];
}
export interface FinancialHealthAssessment {
  method: typeof HEALTH_METHOD_VERSION;
  asOf: string;
  score: number | null;
  coverageBp: number;
  applicableWeight: number;
  evaluatedCategories: number;
  applicableCategories: number;
  categories: HealthCategory[];
}

const rulePoints = { ok: 100, warn: 50, bad: 0 } as const;
const money = (value: number) => formatEuro(cents(value));
const validNumbers = (value: unknown): boolean =>
  typeof value === 'number'
    ? Number.isSafeInteger(value)
    : Array.isArray(value)
      ? value.every(validNumbers)
      : value !== null && typeof value === 'object'
        ? Object.values(value).every(validNumbers)
        : true;
const capped = (value: number) => Math.max(0, Math.min(100, value));

function metric<T>(
  id: HealthMetricId,
  weight: number,
  source: HealthSource<T>,
  asOf: string,
  assess: (facts: T) => Pick<HealthMetric, 'score' | 'explanation' | 'basis'> | null,
): HealthMetric {
  const unavailable = (reason: HealthReason): HealthMetric => ({
    id,
    weight,
    score: null,
    state: 'unavailable',
    reason,
    explanation: '',
    basis: [],
    source: { state: 'unavailable', asOf, reason },
  });
  if (source.asOf !== asOf) return unavailable('date_mismatch');
  if (source.state !== 'available')
    return {
      id,
      weight,
      score: null,
      state: source.state,
      reason: source.reason,
      explanation: '',
      basis: [],
      source,
    };
  if (source.window.to > asOf || source.window.from > source.window.to)
    return unavailable('date_mismatch');
  if (!validNumbers(source.facts)) return unavailable('invalid_source');
  const result = assess(source.facts);
  if (!result || result.score === null || !Number.isSafeInteger(result.score))
    return unavailable('invalid_source');
  return { id, weight, state: 'available', reason: null, source, ...result };
}

function category(id: HealthCategoryId, metrics: HealthMetric[]): HealthCategory {
  const known = metrics.filter((m) => m.score !== null);
  const notApplicable = metrics.every((m) => m.state === 'not_applicable');
  // Only an entirely absent portfolio is an eligible exemption in v1.
  const exempt = id === 'portfolio' && notApplicable;
  const complete = known.length === metrics.length;
  return {
    id,
    weight: HEALTH_CATEGORY_WEIGHTS[id],
    score: complete
      ? Math.round(known.reduce((sum, m) => sum + m.score! * m.weight, 0) / 100)
      : null,
    state: exempt
      ? 'not_applicable'
      : complete
        ? 'complete'
        : known.length
          ? 'partial'
          : 'unavailable',
    coverageBp: known.reduce((sum, m) => sum + m.weight * 100, 0),
    metrics,
  };
}

/** Assessment only: source facts/rule outcomes retain their established meanings. */
export function financialHealthAssessment(input: FinancialHealthInput): FinancialHealthAssessment {
  const cashflow = category('cashflow', [
    metric('cashflow', 50, input.cashflow, input.asOf, (f) => {
      if (f.incomeCents <= 0 || f.targetBp < 0 || f.months <= 0) return null;
      const saved = f.incomeCents - f.consumptionCents;
      if (!Number.isSafeInteger(saved)) return null;
      const rate = savingsRate(f);
      if (rate === null || !Number.isSafeInteger(rate)) return null;
      const score =
        f.targetBp === 0 ? (saved < 0 ? 0 : 100) : capped(Math.round((rate * 100) / f.targetBp));
      return {
        score,
        explanation:
          saved < 0
            ? 'Der Konsum übersteigt die Haushaltseinnahmen.'
            : rate >= f.targetBp
              ? 'Die Sparfähigkeit erreicht das gewählte Ziel.'
              : 'Die Sparfähigkeit liegt unter dem gewählten Ziel.',
        basis: [
          `Referenzeinnahmen R11 (inkl. Zwölftel) ${money(f.incomeCents)} − Konsum ${money(f.consumptionCents)} = ${money(saved)}`,
          `Sparfähigkeit ${formatPercent(rate)} · R01-Ziel ${formatPercent(f.targetBp)} · ${f.months} vollständige Monate`,
        ],
      };
    }),
    metric('reserves', 50, input.reserves, input.asOf, (f) => {
      if (f.averageNeedCents <= 0 || f.targetMonths <= 0 || f.months <= 0 || f.tenthsOfMonth < 0)
        return null;
      const score = capped(Math.round((f.tenthsOfMonth * 100) / (f.targetMonths * 10)));
      return {
        score,
        explanation:
          f.tenthsOfMonth >= f.targetMonths * 10
            ? 'Die bekannte Reserve erreicht das gewählte R02-Ziel.'
            : 'Die bekannte Reserve liegt unter dem gewählten R02-Ziel.',
        basis: [
          `Reserve ${money(f.reserveCents)} · durchschnittlicher Bedarf ${money(f.averageNeedCents)} je Monat`,
          `Deckung ${(f.tenthsOfMonth / 10).toLocaleString('de-AT', { minimumFractionDigits: 1 })} Monate · R02-Ziel ${f.targetMonths} Monate · ${f.months} vollständige Monate`,
        ],
      };
    }),
  ]);
  const debt = category('debt', [
    metric('debt', 100, input.debt, input.asOf, (f) => {
      if (f.debtCents < 0 || f.paymentsCents < 0 || f.maxBp < 0 || f.badOverBp < 0) return null;
      if (f.mode === 'no_debt' && f.debtCents !== 0) return null;
      if (
        f.mode === 'service' &&
        (f.incomeCents === null || f.incomeCents <= 0 || f.ratioBp === null)
      )
        return null;
      return {
        score: f.mode === 'service' ? rulePoints[f.status] : 100,
        explanation:
          f.mode === 'no_debt'
            ? 'Die vollständig bewerteten Konten weisen keine Schulden aus.'
            : f.mode === 'funded_cards'
              ? 'Die bekannten Kartenschulden sind vollständig durch Zahlungsenvelopes gedeckt.'
              : f.status === 'ok'
                ? 'Die vollständig erfasste Schuldendienstquote erfüllt R08.'
                : f.status === 'warn'
                  ? 'Die vollständig erfasste Schuldendienstquote liegt im Warnbereich von R08.'
                  : 'Die vollständig erfasste Schuldendienstquote verletzt R08.',
        basis: [
          `Bekannte Schulden ${money(f.debtCents)}`,
          ...(f.mode === 'service'
            ? [
                `R08-Schuldendienst ${money(f.paymentsCents)} ÷ Referenzeinkommen ${money(f.incomeCents!)} = ${formatPercent(f.ratioBp!)}`,
                `R08-Grenze ${formatPercent(f.maxBp)} · Warnband ${formatPercent(f.badOverBp)}`,
              ]
            : []),
        ],
      };
    }),
  ]);
  const portfolioMetric = (id: 'structure' | 'concentration' | 'speculation', weight: number) =>
    metric(id, weight, input[id], input.asOf, (f) => ({
      score: rulePoints[f.status],
      explanation:
        f.status === 'ok'
          ? 'Die bekannten Portfoliodaten erfüllen das gewählte Kriterium.'
          : f.status === 'warn'
            ? 'Die bekannten Portfoliodaten liegen im Warnbereich des Kriteriums.'
            : 'Die bekannten Portfoliodaten verletzen das gewählte Kriterium.',
      basis: [f.valueText, f.thresholdText],
    }));
  const portfolio = category('portfolio', [
    portfolioMetric('structure', 40),
    portfolioMetric('concentration', 40),
    portfolioMetric('speculation', 20),
  ]);
  const categories = [cashflow, debt, portfolio];
  const applicable = categories.filter((c) => c.state !== 'not_applicable');
  const applicableWeight = applicable.reduce((sum, c) => sum + c.weight, 0);
  const complete = applicable.length > 0 && applicable.every((c) => c.score !== null);
  return {
    method: HEALTH_METHOD_VERSION,
    asOf: input.asOf,
    score: complete
      ? Math.round(applicable.reduce((sum, c) => sum + c.score! * c.weight, 0) / applicableWeight)
      : null,
    coverageBp: applicableWeight
      ? Math.round(
          applicable.reduce((sum, c) => sum + c.coverageBp * c.weight, 0) / applicableWeight,
        )
      : 0,
    applicableWeight,
    evaluatedCategories: applicable.filter((c) => c.score !== null).length,
    applicableCategories: applicable.length,
    categories,
  };
}
