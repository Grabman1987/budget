import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import {
  compareLoanScenario,
  loanMeasureSchema,
  loanScenarioInputSchema,
  loanSummary,
  MAX_LOAN_RATE_BP,
  measuresBeforeStart,
  PaymentBelowInterestError,
  rateInForce,
  simulateLoan,
  simulatePayoff,
  type LoanComparison,
  type LoanMeasure,
  type LoanRatePoint,
  type LoanScenarioInput,
  type LoanSummary,
  type LoanTermsInput,
  type PayoffLoan,
  type StrategyResult,
} from '@budget/domain';
import { loanRateChange, loanScenario } from '../schema';
import { insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import { ConflictError, EntityNotFoundError } from './errors';
import { accountSummaries, type AccountSummary } from './ledger-queries';
import { runInTransaction, type Executor } from './types';

/** At most this many scenarios per loan keep the comparison readable on a phone. */
export const MAX_LOAN_SCENARIOS = 8;
const MAX_RATE_CHANGES = 60;

export interface LoanRateChangeView {
  id: string;
  validFrom: string;
  rateBp: number;
}
export interface LoanScenarioView {
  id: string;
  name: string;
  measures: LoanMeasure[];
}

const parseMeasures = (json: string): LoanMeasure[] =>
  loanMeasureSchema.array().parse(JSON.parse(json));

function loanAccount(db: Executor, accountId: string, asOf?: string): AccountSummary {
  const found = accountSummaries(db, asOf ?? '9999-12-31').find((a) => a.id === accountId);
  if (!found) throw new EntityNotFoundError('account', accountId);
  if (found.type !== 'loan')
    throw new ConflictError('Nur ein Kredit hat Zinsänderungen und Szenarien.');
  return found;
}

export function listLoanRateChanges(db: Executor, accountId: string): LoanRateChangeView[] {
  return db
    .select()
    .from(loanRateChange)
    .where(and(eq(loanRateChange.accountId, accountId), isNull(loanRateChange.deletedAt)))
    .orderBy(asc(loanRateChange.validFrom))
    .all()
    .map((r) => ({ id: r.id, validFrom: r.validFrom, rateBp: r.rateBp }));
}

export function listLoanScenarios(db: Executor, accountId: string): LoanScenarioView[] {
  return db
    .select()
    .from(loanScenario)
    .where(and(eq(loanScenario.accountId, accountId), isNull(loanScenario.deletedAt)))
    .orderBy(asc(loanScenario.createdAt), asc(loanScenario.id))
    .all()
    .map((r) => ({ id: r.id, name: r.name, measures: parseMeasures(r.measuresJson) }));
}

/** Create (`id` null) or change a dated rate of a loan; one live change per day. */
export function saveLoanRateChange(
  db: Executor,
  accountId: string,
  id: string | null,
  input: { validFrom: string; rateBp: number },
  ctx: AuditContext,
): { id: string; groupId: string } {
  if (!Number.isSafeInteger(input.rateBp) || input.rateBp < 0 || input.rateBp > MAX_LOAN_RATE_BP)
    throw new ConflictError('Der Zinssatz liegt außerhalb des zulässigen Bereichs.');
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    loanAccount(tx, accountId);
    const live = listLoanRateChanges(tx, accountId);
    if (id && !live.some((r) => r.id === id)) throw new EntityNotFoundError('loan_rate_change', id);
    if (live.some((r) => r.id !== id && r.validFrom === input.validFrom))
      throw new ConflictError('Für diesen Tag gibt es bereits eine Zinsänderung.');
    if (!id && live.length >= MAX_RATE_CHANGES)
      throw new ConflictError(`Höchstens ${String(MAX_RATE_CHANGES)} Zinsänderungen je Kredit.`);
    const values = { validFrom: input.validFrom, rateBp: input.rateBp };
    const rowId = id ?? randomUUID();
    if (id) updateTracked(tx, loanRateChange, [id], values, grouped);
    else insertTracked(tx, loanRateChange, { id: rowId, accountId, ...values }, grouped);
    return { id: rowId, groupId: grouped.groupId };
  });
}

export function removeLoanRateChange(
  db: Executor,
  accountId: string,
  id: string,
  ctx: AuditContext,
): { groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    if (!listLoanRateChanges(tx, accountId).some((r) => r.id === id))
      throw new EntityNotFoundError('loan_rate_change', id);
    updateTracked(
      tx,
      loanRateChange,
      [id],
      { deletedAt: new Date().toISOString() },
      grouped,
      'delete',
    );
    return { groupId: grouped.groupId };
  });
}

/** Create (`id` null) or replace a scenario of a loan. */
export function saveLoanScenario(
  db: Executor,
  accountId: string,
  id: string | null,
  input: LoanScenarioInput,
  today: string,
  ctx: AuditContext,
): { id: string; groupId: string } {
  const parsed = loanScenarioInputSchema.parse(input);
  if (measuresBeforeStart(parsed.measures, today.slice(0, 7)).length > 0)
    throw new ConflictError('Eine Sondertilgung liegt vor dem aktuellen Monat.');
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    loanAccount(tx, accountId);
    const live = listLoanScenarios(tx, accountId);
    if (id && !live.some((s) => s.id === id)) throw new EntityNotFoundError('loan_scenario', id);
    if (!id && live.length >= MAX_LOAN_SCENARIOS)
      throw new ConflictError(`Höchstens ${String(MAX_LOAN_SCENARIOS)} Szenarien je Kredit.`);
    if (live.some((s) => s.id !== id && s.name.toLowerCase() === parsed.name.toLowerCase()))
      throw new ConflictError('Ein Szenario mit diesem Namen gibt es bereits.');
    const values = { name: parsed.name, measuresJson: JSON.stringify(parsed.measures) };
    const rowId = id ?? randomUUID();
    if (id) updateTracked(tx, loanScenario, [id], values, grouped);
    else insertTracked(tx, loanScenario, { id: rowId, accountId, ...values }, grouped);
    return { id: rowId, groupId: grouped.groupId };
  });
}

export function removeLoanScenario(
  db: Executor,
  accountId: string,
  id: string,
  ctx: AuditContext,
): { groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    if (!listLoanScenarios(tx, accountId).some((s) => s.id === id))
      throw new EntityNotFoundError('loan_scenario', id);
    updateTracked(
      tx,
      loanScenario,
      [id],
      { deletedAt: new Date().toISOString() },
      grouped,
      'delete',
    );
    return { groupId: grouped.groupId };
  });
}

/** Undo may restore a rate change on a day that has a live one by now: refuse the whole action. */
export function assertLoanPlanInvariants(db: Executor): void {
  const seen = new Set<string>();
  for (const r of db.select().from(loanRateChange).where(isNull(loanRateChange.deletedAt)).all()) {
    const key = `${r.accountId}|${r.validFrom}`;
    if (seen.has(key)) throw new ConflictError('Für diesen Tag gibt es bereits eine Zinsänderung.');
    seen.add(key);
  }
}

// ---- plan ----

type ErrorCode = 'payment_below_interest' | 'horizon' | 'limit';
export type LoanOutcome =
  ({ status: 'ok' } & LoanComparison) | { status: 'error'; code: ErrorCode };
export type BaselineOutcome =
  { status: 'ok'; summary: LoanSummary } | { status: 'error'; code: ErrorCode };

export interface LoanPlanView {
  accountId: string;
  name: string;
  currency: string;
  asOf: string;
  /** First modelled payment month. */
  startMonth: string;
  /** Debt to repay (positive cents); 0 when the account owes nothing. */
  balanceCents: number;
  /** Terms the plan needs and the account does not have yet. */
  missing: Array<'rate' | 'installment' | 'fee'>;
  terms: {
    rateBp: number | null;
    interestKind: 'fixed' | 'variable' | null;
    installmentCents: number | null;
    monthlyFeeCents: number | null;
    /** Rate in force in the first modelled month (the account rate or the latest dated change). */
    effectiveRateBp: number | null;
  };
  rateChanges: LoanRateChangeView[];
  baseline: BaselineOutcome | null;
  scenarios: Array<
    LoanScenarioView & {
      /** Sondertilgungen that lie before the first modelled month and no longer count. */
      expired: number;
      outcome: LoanOutcome | null;
    }
  >;
  draft?: { expired: number; outcome: LoanOutcome | null };
}

const classify = (error: unknown): ErrorCode => {
  if (error instanceof PaymentBelowInterestError) return 'payment_below_interest';
  if (error instanceof RangeError && /Not repaid/.test(error.message)) return 'horizon';
  if (error instanceof RangeError) return 'limit';
  throw error;
};

function attempt<T>(run: () => T): T | { status: 'error'; code: ErrorCode } {
  try {
    return run();
  } catch (error) {
    return { status: 'error', code: classify(error) };
  }
}

const asPoints = (changes: LoanRateChangeView[]): LoanRatePoint[] =>
  changes.map((c) => ({ month: c.validFrom.slice(0, 7), rateBp: c.rateBp }));

/** Baseline and every stored scenario (and an optional unsaved draft) of one loan. */
export function loanPlanView(
  db: Executor,
  accountId: string,
  asOf: string,
  options: { startMonth?: string; draft?: LoanMeasure[] } = {},
): LoanPlanView {
  const account = loanAccount(db, accountId, asOf);
  const startMonth = options.startMonth ?? asOf.slice(0, 7);
  const balanceCents = Math.max(0, -account.balanceCents);
  const rateChanges = listLoanRateChanges(db, accountId);
  const missing: LoanPlanView['missing'] = [];
  if (account.interestRateBp === null) missing.push('rate');
  if (account.installmentCents === null || account.installmentCents === 0)
    missing.push('installment');
  if (account.monthlyFeeCents === null) missing.push('fee');
  const points = asPoints(rateChanges);
  const terms: LoanTermsInput | null =
    missing.length === 0 && balanceCents > 0
      ? {
          balanceCents,
          startMonth,
          rateBp: account.interestRateBp!,
          installmentCents: account.installmentCents!,
          monthlyFeeCents: account.monthlyFeeCents!,
          rateChanges: points,
        }
      : null;
  const baseline: BaselineOutcome | null = terms
    ? attempt(() => ({ status: 'ok' as const, summary: loanSummary(simulateLoan(terms)) }))
    : null;
  const evaluate = (measures: LoanMeasure[]): LoanOutcome | null => {
    if (!terms || !baseline || baseline.status !== 'ok') return null;
    return attempt(() => ({
      status: 'ok' as const,
      ...compareLoanScenario(terms, measures, baseline.summary),
    }));
  };
  const view: LoanPlanView = {
    accountId,
    name: account.name,
    currency: account.currency,
    asOf,
    startMonth,
    balanceCents,
    missing,
    terms: {
      rateBp: account.interestRateBp,
      interestKind: account.interestKind,
      installmentCents: account.installmentCents,
      monthlyFeeCents: account.monthlyFeeCents,
      effectiveRateBp:
        account.interestRateBp === null
          ? null
          : rateInForce(account.interestRateBp, points, startMonth),
    },
    rateChanges,
    baseline,
    scenarios: listLoanScenarios(db, accountId).map((s) => ({
      ...s,
      expired: measuresBeforeStart(s.measures, startMonth).length,
      outcome: evaluate(s.measures),
    })),
  };
  if (options.draft)
    view.draft = {
      expired: measuresBeforeStart(options.draft, startMonth).length,
      outcome: evaluate(options.draft),
    };
  return view;
}

// ---- several debts ----

export interface DebtCandidate {
  accountId: string;
  name: string;
  type: string;
  currency: string;
  /** Debt in the account's currency (positive cents). */
  balanceCents: number;
  /** Rate in force in the start month (account rate and dated changes), `null` when not stored. */
  rateBp: number | null;
  /** Stored installment, `null` for a card or a loan without one. */
  minimumCents: number | null;
  monthlyFeeCents: number | null;
}

/** Every open debt (loans, cards with a balance, other liabilities) with the terms stored for it. */
export function debtCandidates(db: Executor, asOf: string, startMonth: string): DebtCandidate[] {
  return accountSummaries(db, asOf)
    .filter((a) => a.balanceCents < 0 && Number.isSafeInteger(a.balanceCents))
    .map((a) => ({
      accountId: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      balanceCents: -a.balanceCents,
      rateBp:
        a.interestRateBp === null
          ? null
          : a.type === 'loan'
            ? rateInForce(a.interestRateBp, asPoints(listLoanRateChanges(db, a.id)), startMonth)
            : a.interestRateBp,
      minimumCents: a.installmentCents,
      monthlyFeeCents: a.monthlyFeeCents,
    }));
}

export interface StrategyInputDebt {
  accountId: string;
  rateBp: number;
  minimumCents: number;
  monthlyFeeCents: number;
}
export type StrategyOutcome =
  | {
      status: 'ok';
      months: number;
      endMonth: string | null;
      interestCents: number;
      feeCents: number;
      totalPaidCents: number;
      loans: Array<{
        id: string;
        name: string;
        interestCents: number;
        paidOffMonth: string | null;
      }>;
    }
  | { status: 'error'; code: ErrorCode; names: string[] };

export interface StrategyView {
  currency: string;
  startMonth: string;
  extraCents: number;
  startingDebtCents: number;
  monthlyBudgetCents: number;
  minimumOnly: StrategyOutcome;
  avalanche: StrategyOutcome;
  snowball: StrategyOutcome;
  /** Snowball interest minus avalanche interest; `null` when either is unavailable. */
  interestAdvantageCents: number | null;
}

function strategyOutcome(
  loans: PayoffLoan[],
  strategy: 'avalanche' | 'snowball',
  extraCents: number,
  startMonth: string,
): StrategyOutcome {
  try {
    const r: StrategyResult = simulatePayoff(loans, { strategy, extraCents, startMonth });
    if (![r.interestCents, r.feeCents, r.totalPaidCents].every(Number.isSafeInteger))
      throw new RangeError('Unsafe cent sum');
    return {
      status: 'ok',
      months: r.months,
      endMonth: r.endMonth,
      interestCents: r.interestCents,
      feeCents: r.feeCents,
      totalPaidCents: r.totalPaidCents,
      loans: r.loans.map((l) => ({
        id: l.id,
        name: l.name,
        interestCents: l.interestCents,
        paidOffMonth: l.paidOffMonth,
      })),
    };
  } catch (error) {
    const code = classify(error);
    const ids = error instanceof PaymentBelowInterestError ? error.loanIds : [];
    return {
      status: 'error',
      code,
      names: loans.filter((l) => ids.includes(l.id)).map((l) => l.name),
    };
  }
}

/** Avalanche against snowball (and minimum payments only) for the chosen debts of one currency. */
export function compareDebtStrategies(
  db: Executor,
  asOf: string,
  input: { startMonth: string; extraCents: number; debts: StrategyInputDebt[] },
): StrategyView {
  const candidates = new Map(
    debtCandidates(db, asOf, input.startMonth).map((c) => [c.accountId, c]),
  );
  const ids = new Set(input.debts.map((d) => d.accountId));
  if (ids.size !== input.debts.length) throw new ConflictError('Jede Schuld nur einmal wählen.');
  const chosen = input.debts.map((d) => {
    const c = candidates.get(d.accountId);
    if (!c) throw new ConflictError('Eine gewählte Schuld hat keinen offenen Saldo mehr.');
    return { d, c };
  });
  const currencies = new Set(chosen.map(({ c }) => c.currency));
  if (currencies.size !== 1) throw new ConflictError('Die Schulden müssen dieselbe Währung haben.');
  const loans: PayoffLoan[] = chosen.map(({ d, c }) => ({
    id: c.accountId,
    name: c.name,
    balanceCents: c.balanceCents,
    rateBp: d.rateBp,
    minimumCents: d.minimumCents,
    monthlyFeeCents: d.monthlyFeeCents,
  }));
  const avalanche = strategyOutcome(loans, 'avalanche', input.extraCents, input.startMonth);
  const snowball = strategyOutcome(loans, 'snowball', input.extraCents, input.startMonth);
  const sum = (pick: (l: PayoffLoan) => number) => loans.reduce((a, l) => a + pick(l), 0);
  return {
    currency: [...currencies][0]!,
    startMonth: input.startMonth,
    extraCents: input.extraCents,
    startingDebtCents: sum((l) => l.balanceCents),
    monthlyBudgetCents: sum((l) => l.minimumCents) + input.extraCents,
    minimumOnly: strategyOutcome(loans, 'avalanche', 0, input.startMonth),
    avalanche,
    snowball,
    interestAdvantageCents:
      avalanche.status === 'ok' && snowball.status === 'ok'
        ? snowball.interestCents - avalanche.interestCents
        : null,
  };
}
