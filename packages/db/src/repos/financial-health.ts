import {
  addMonths,
  allocationStatus,
  classifyRisk,
  emergencyCoverage,
  evaluateDebtServiceRule,
  evaluateRule,
  financialHealthAssessment,
  lastDayOfMonth,
  PARAM_SCHEMAS,
  type FinancialHealthInput,
  type EmergencyCoverageInput,
  type HealthReason,
  type HealthSource,
  type HealthWindow,
  type RuleCode,
  type RuleInputs,
  type RuleParams,
} from '@budget/domain';
import { isNull } from 'drizzle-orm';
import { rule } from '../schema';
import { allocationInputsAsOf } from './allocation-inputs';
import { cashValuer } from './cash-valuation';
import { debtsAsOf } from './debts';
import { MissingFxRateError } from './errors';
import { accountSummaries } from './ledger-queries';
import { fallibleNetWorthValuationAsOf } from './portfolio';
import {
  debtServiceRuleInputs,
  healthBudgetInputs,
  loadFacts,
  referenceMonth,
  type RuleFacts,
} from './rule-inputs';
import { resolvePortfolioRiskPolicy } from './portfolio-risk-policy';
import { runInTransaction, type Executor } from './types';

/** Safe cent sums, without guessing an overflowing total. */
function sumCents(values: readonly number[]): number | null {
  if (values.some((v) => !Number.isSafeInteger(v))) return null;
  const sum = values.reduce((s, v) => s + BigInt(v), 0n);
  return sum > BigInt(Number.MAX_SAFE_INTEGER) || sum < BigInt(Number.MIN_SAFE_INTEGER)
    ? null
    : Number(sum);
}

/** Eligibility guard only; all actual R02 arithmetic remains in emergencyCoverage. */
export function checkedHealthEmergencyCoverage(input: EmergencyCoverageInput) {
  const total = sumCents(input.needSpending.map((month) => month.cents));
  if (total === null || !Number.isSafeInteger(input.reserveCents)) return null;
  const coverage = emergencyCoverage(input);
  if (
    BigInt(Math.max(0, input.reserveCents)) * 10n * BigInt(coverage.months) >
    BigInt(Number.MAX_SAFE_INTEGER)
  )
    return null;
  return coverage;
}

/** One current assessment, one SQLite read snapshot, no rule_result/audit/other writes. */
export function financialHealthAsOf(db: Executor, asOf: string) {
  return runInTransaction(db, (tx) => readAssessment(tx, asOf));
}

function readAssessment(db: Executor, asOf: string) {
  const ref = referenceMonth(asOf);
  const missing = <T>(reason: HealthReason): HealthSource<T> => ({
    state: 'unavailable',
    asOf,
    reason,
  });
  const known = <T>(facts: T, window: HealthWindow): HealthSource<T> => ({
    state: 'available',
    asOf,
    window,
    facts,
  });
  const dayWindow = { from: asOf, to: asOf };
  const refWindow = { from: `${ref}-01`, to: lastDayOfMonth(ref) };
  const input: FinancialHealthInput = {
    asOf,
    cashflow: missing('no_data'),
    reserves: missing('no_data'),
    debt: missing('no_data'),
    structure: missing('no_data'),
    concentration: missing('no_data'),
    speculation: missing('no_data'),
  };
  const accounts = accountSummaries(db, asOf).filter((a) => a.openingDate <= asOf);
  if (!accounts.length) return financialHealthAssessment(input);

  const exactPercent = (bp: number) =>
    `${(bp / 100).toLocaleString('de-AT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} %`;
  const rows = db.select().from(rule).where(isNull(rule.deletedAt)).all();
  // Enabled toggles do not remove fixed v1 criteria. Stored explicit limits still apply.
  const params = <C extends RuleCode>(code: C): RuleParams<C> | null => {
    const row = rows.find((r) => r.kind === 'rule' && r.code === code);
    try {
      return PARAM_SCHEMAS[code].parse(JSON.parse(row?.paramsJson ?? '{}')) as RuleParams<C>;
    } catch {
      return null;
    }
  };
  const p01 = params('R01'),
    p02 = params('R02'),
    p08 = params('R08');
  let loadedFacts: RuleFacts | null = null;
  let budgetFacts: ReturnType<typeof healthBudgetInputs> | null = null;
  try {
    const facts = loadFacts(db, asOf);
    loadedFacts = facts;
    budgetFacts = healthBudgetInputs(facts, asOf);
  } catch (error) {
    if (!(error instanceof RangeError || error instanceof MissingFxRateError)) throw error;
    input.cashflow = missing('source_unavailable');
    input.reserves = missing('source_unavailable');
    input.debt = missing('source_unavailable');
    input.structure = missing('source_unavailable');
    input.concentration = missing('source_unavailable');
    input.speculation = missing('source_unavailable');
  }

  const { valuation, calculationLimitAccountIds } = fallibleNetWorthValuationAsOf(db, asOf);
  const limits = new Set(calculationLimitAccountIds);
  const unknownAccount = (id: string) =>
    limits.has(id) ||
    valuation.byAccount[id] == null ||
    valuation.incomplete.some((v) => v.accountId === id);

  if (budgetFacts) {
    const { months, complete: completeHistory, flows } = budgetFacts;
    const from = months[0] ?? ref;
    const income = sumCents(flows.flatMap((f) => (f ? [f.incomeCents] : [])));
    const spending = sumCents(flows.flatMap((f) => (f ? [f.spendingCents] : [])));
    const window = { from: `${from}-01`, to: lastDayOfMonth(ref) };
    input.cashflow =
      !completeHistory || flows.some((f) => !f)
        ? missing('missing_history')
        : !p01 || income === null || spending === null
          ? missing('invalid_source')
          : income <= 0
            ? missing('missing_income')
            : known(
                {
                  incomeCents: income,
                  consumptionCents: spending,
                  targetBp: p01.futureMinBp,
                  months: months.length,
                },
                window,
              );

    const reserveAccounts = accounts.filter((a) => a.role === 'reserve');
    // R02's zero reserve is valid only after every reserve account is actually valued.
    input.reserves = reserveAccounts.some((a) => unknownAccount(a.id))
      ? missing('valuation_unavailable')
      : !completeHistory
        ? missing('missing_history')
        : !p02
          ? missing('invalid_source')
          : (() => {
              const reserve = sumCents(reserveAccounts.map((a) => valuation.byAccount[a.id]!));
              if (reserve === null) return missing('invalid_source');
              const coverage = checkedHealthEmergencyCoverage({
                reserveCents: reserve,
                needSpending: budgetFacts.needSpending,
                firstMonth: budgetFacts.firstMonth,
                currentMonth: addMonths(ref, 1),
              });
              return coverage === null
                ? missing('invalid_source')
                : coverage.tenthsOfMonth === null
                  ? missing('missing_history')
                  : known(
                      {
                        ...coverage,
                        tenthsOfMonth: coverage.tenthsOfMonth,
                        reserveCents: reserve,
                        targetMonths: p02.targetMonths,
                      },
                      window,
                    );
            })();
  }

  // Inventory includes closed nonzero accounts, cards and overdrawn accounts, as the debt view does.
  const debts = debtsAsOf(db, asOf);
  if (debts.totalEurCents === null || accounts.some((a) => unknownAccount(a.id))) {
    input.debt = missing('valuation_unavailable');
  } else if (!p08) {
    input.debt = missing('invalid_source');
  } else if (debts.totalEurCents === 0) {
    input.debt = known(
      {
        mode: 'no_debt',
        debtCents: 0,
        paymentsCents: 0,
        incomeCents: null,
        ratioBp: null,
        maxBp: p08.maxBp,
        badOverBp: p08.badOverBp,
        status: 'ok',
      },
      dayWindow,
    );
  } else if (loadedFacts) {
    const source = debtServiceRuleInputs(
      loadedFacts,
      asOf,
      Object.fromEntries(accounts.map((a) => [a.id, valuation.byAccount[a.id]!])),
    );
    const coveredCard = (a: (typeof debts.accounts)[number]) =>
      a.type === 'credit_card' &&
      source.cards.some(
        (c) =>
          c.id === a.id &&
          Number.isSafeInteger(c.owedCents) &&
          Number.isSafeInteger(c.availableCents) &&
          c.owedCents >= (a.owedEurCents ?? Infinity) &&
          c.availableCents >= c.owedCents,
      );
    const obligations = debts.accounts.filter((a) => !coveredCard(a));
    if (!obligations.length) {
      input.debt = known(
        {
          mode: 'funded_cards',
          debtCents: debts.totalEurCents,
          paymentsCents: 0,
          incomeCents: null,
          ratioBp: null,
          maxBp: p08.maxBp,
          badOverBp: p08.badOverBp,
          status: 'ok',
        },
        dayWindow,
      );
    } else {
      const cash = cashValuer(db);
      const installments = obligations.map((a) =>
        a.type === 'loan' &&
        a.closedAt === null &&
        a.installmentCents !== null &&
        a.installmentCents > 0
          ? cash(a.installmentCents, a.currency, asOf).eurCents
          : null,
      );
      const minimum = installments.some((v) => v === null)
        ? null
        : sumCents(installments as number[]);
      const payments = source.loanPaymentsMonthlyCents;
      const evaluation = evaluateDebtServiceRule(p08, source);
      const ratio =
        typeof evaluation?.detail['ratioBp'] === 'number' ? evaluation.detail['ratioBp'] : null;
      input.debt =
        minimum === null || payments === null || payments < minimum
          ? missing('incomplete_service')
          : !evaluation || ratio === null || source.netIncomeMonthlyCents === null
            ? missing('missing_income')
            : known(
                {
                  mode: 'service',
                  debtCents: debts.totalEurCents,
                  paymentsCents: payments,
                  incomeCents: source.netIncomeMonthlyCents,
                  ratioBp: ratio,
                  maxBp: p08.maxBp,
                  badOverBp: p08.badOverBp,
                  status: evaluation.status,
                },
                refWindow,
              );
    }
  }

  const allocation = allocationInputsAsOf(db, asOf);
  const portfolioMissing = (reason: HealthReason) => {
    input.structure = missing(reason);
    input.concentration = missing(reason);
    input.speculation = missing(reason);
  };
  if (allocation.quality.confidence !== 'exact') {
    portfolioMissing('valuation_unavailable');
  } else if (
    !allocation.positions.some((p) => p.valueCents !== 0) &&
    !allocation.unavailable.length
  ) {
    const absent = { state: 'not_applicable', asOf, reason: 'no_portfolio' } as const;
    input.structure = absent;
    input.concentration = absent;
    input.speculation = absent;
  } else if (allocation.valueCents === null || allocation.valueCents <= 0) {
    portfolioMissing('valuation_unavailable');
  } else {
    let policy: ReturnType<typeof resolvePortfolioRiskPolicy>;
    try {
      policy = resolvePortfolioRiskPolicy(db, asOf, allocation.valueCents);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      portfolioMissing('invalid_source');
      return financialHealthAssessment(input);
    }
    // R13–R15 read only this exact allocation/policy. Other unavailable rule inputs stay absent.
    const portfolioSource: RuleInputs = {
      asOf,
      refMonth: ref,
      allocByMonth: null,
      emergency: null,
      moneyEvents: [],
      payYourself: null,
      sinkingFunds: [],
      cards: [],
      forecast: null,
      netIncomeMonthlyCents: null,
      loanPaymentsMonthlyCents: null,
      fixedCosts: null,
      debt: null,
      flows: [],
      windfall: [],
      freedom: null,
      positions: allocation.positions,
      allocationQuality: allocation.quality,
      classTargets: policy.targets,
      portfolioRiskPolicy: policy,
      names: loadedFacts
        ? {
            assetClasses: loadedFacts.classNames,
            securities: Object.fromEntries(
              [...loadedFacts.securities.values()].map((s) => [s.id, s.name]),
            ),
            platforms: loadedFacts.platformNames,
          }
        : { assetClasses: {}, securities: {}, platforms: {} },
    };
    const structure = allocationStatus(allocation.positions, policy.targets, policy.R13);
    const bands = structure.rows
      .map((r) =>
        r.targetBp === null
          ? `${portfolioSource.names.assetClasses[r.assetClass] ?? r.assetClass}: nicht gesteuert`
          : `${portfolioSource.names.assetClasses[r.assetClass] ?? r.assetClass}: Soll ${exactPercent(r.targetBp)}, effektives Band ±${exactPercent(r.bandBp ?? 0).replace(' %', ' Pp')}`,
      )
      .join('; ');
    for (const [key, code, threshold] of [
      [
        'structure',
        'R13',
        `R13: ${bands}. Warnung außerhalb des Bandes; verletzt bei Abweichung > Band × ${policy.R13.badFactorPct} / 100. Spekulatives Übergewicht bleibt bei R15.`,
      ],
      [
        'concentration',
        'R14',
        `R14: Einzeltitel ${exactPercent(policy.R14.singleBp)}; Krypto/P2P-Plattform ${exactPercent(policy.R14.platformBp)}. Warnung bis ${exactPercent(policy.R14.badOverBp).replace(' %', ' Pp')} darüber; verletzt bei größerer Überschreitung.`,
      ],
      [
        'speculation',
        'R15',
        `R15: spekulatives Bruttoexposure ${exactPercent(policy.R15.limitBp)}. Warnung bis ${exactPercent(policy.R15.badOverBp).replace(' %', ' Pp')} darüber; verletzt bei größerer Überschreitung.`,
      ],
    ] as const) {
      const evaluated = evaluateRule(code, policy[code], portfolioSource);
      input[key] = evaluated
        ? known(
            {
              status: evaluated.status,
              valueText: evaluated.valueText,
              thresholdText: threshold,
              evidence: {
                parameters: policy[code],
                values: evaluated.detail,
                ...(code === 'R13' ? { effectiveTargets: structure.rows } : {}),
              },
            },
            dayWindow,
          )
        : missing(key === 'structure' ? 'missing_targets' : 'invalid_source');
    }
    if (policy.targets.reduce((sum, t) => sum + t.targetBp, 0) !== 10000)
      input.structure = missing('missing_targets');
    if (
      allocation.positions.some(
        (p) => p.valueCents !== 0 && classifyRisk(p).platform && !p.platform,
      )
    )
      input.concentration = missing('unknown_platform');
  }
  return financialHealthAssessment(input);
}
