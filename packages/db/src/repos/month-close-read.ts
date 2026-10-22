import {
  closeSteps,
  closeNavigation,
  cents,
  lastDayOfMonth,
  monthCloseStateSchema,
  addMonths,
  nextPayday,
  closePlanHistory,
  closeDeviations,
  type CloseWork,
  type MonthCloseState,
} from '@budget/domain';
import { and, desc, eq, isNull, lte } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Db } from '../client';
import { appSetting, valuation, bankSyncCandidate, booking } from '../schema';
import { getEntity } from './entities';
import { accountSummaries } from './ledger-queries';
import { readInbox } from './inbox';
import { planMonthViews } from './plan-months';
import { holdingValuationAsOf } from './portfolio';
import { listReconciliations } from './reconciliation';
import { reportTables } from './report-tables';
import { monthOnePager } from './month-reports';
import { monthCloseSourceRevision } from './month-close-state';
import { previewMonthCloseReconciliation } from './month-close-reconciliation';
import { occurrencesBetween } from './heute';
import { loadFacts } from './rule-inputs';

const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key = (m: string) => `month_close.${m}`;

export interface MonthCloseReadContext {
  plans: ReturnType<typeof planMonthViews>;
  states: ReadonlyMap<string, MonthCloseState>;
}

/** One existing canonical plan run for all requested months and their successors. */
export function monthCloseReadContext(db: Db, months: readonly string[], today: string,
  states: ReadonlyMap<string, MonthCloseState>,
): MonthCloseReadContext {
  const wanted = [...new Set(months.flatMap((month) => [month, addMonths(month, 1)]))].sort();
  return { plans: planMonthViews(db, wanted, {}, today), states };
}

export function readMonthClose(db: Db, m: string, today: string) {
  return db.transaction((tx) => {
    const prepared = prepareMonthCloseSource(tx, m, today);
    return completeMonthCloseView(tx, m, today, prepared);
  });
}

/** Exact original facts/property/array order, shared by full close and reminder comparison. */
export function prepareMonthCloseSource(db: Db, m: string, today: string, context?: MonthCloseReadContext) {
  const end = lastDayOfMonth(m);
  const asOf = end < today ? end : today;
  const holdings = holdingValuationAsOf(db, asOf);
  const holdingAccounts = new Set(
    [...holdings.values, ...holdings.missingPricePositions, ...holdings.missingFxPositions].map(
      (h) => h.accountId,
    ),
  );
  const stored = context?.states.has(m) ? undefined : getEntity(db, appSetting, key(m));
  const state = context?.states.get(m) ?? monthCloseStateSchema.parse(stored ? JSON.parse(stored.value) : {});
  // Overspent envelopes are handled in the dedicated step 3, not as inbox work in step 1.
  const inbox = readInbox(db, asOf)
    .entries.filter((e) => e.type !== 'envelope')
    .filter((e) => {
      let date = e.type === 'stored' ? e.createdAt.slice(0, 10) : e.date;
      if (e.type === 'stored' && e.refId) {
        if (e.refType === 'bank-sync-candidate')
          date =
            db.select().from(bankSyncCandidate).where(eq(bankSyncCandidate.id, e.refId)).get()
              ?.date ?? date;
        if (e.refType === 'booking')
          date = db.select().from(booking).where(eq(booking.id, e.refId)).get()?.date ?? date;
      }
      return date.slice(0, 7) === m;
    });
  const accounts = accountSummaries(db, asOf)
    .filter(
      (a) =>
        !a.closedAt &&
        a.openingDate <= asOf &&
        ([
          'checking',
          'cash',
          'savings',
          'credit_card',
          'loan',
          'other_liability',
          'brokerage',
          'crypto',
        ].includes(a.type) ||
          ((a.type === 'p2p' || a.type === 'other_asset') && !holdingAccounts.has(a.id))),
    )
    .map((a) => {
      const manual = a.type === 'p2p' || a.type === 'other_asset';
      const value = manual
        ? db
            .select()
            .from(valuation)
            .where(
              and(
                eq(valuation.accountId, a.id),
                isNull(valuation.deletedAt),
                lte(valuation.date, asOf),
              ),
            )
            .orderBy(desc(valuation.date))
            .get()
        : undefined;
      const reconciled = listReconciliations(db, a.id).some((r) => r.date >= end);
      return {
        ...a,
        manual,
        holdingValued: holdingAccounts.has(a.id),
        valueCents: value?.valueCents ?? a.balanceCents,
        lastValuedOn: value?.date ?? null,
        done: manual ? value?.date === end : reconciled,
      };
    });
  const nextMonth = addMonths(m, 1);
  const plans = context?.plans ?? planMonthViews(db, [m, nextMonth], {}, today);
  const plan = plans[m]!;
  const nextBudget = plans[nextMonth]!;
  const overspent = plan.summary.envelopes.filter((e) => e.overspentCents > 0);
  const work: CloseWork[] = [
    ...inbox.map((e) => ({ step: 1 as const, id: e.id, fingerprint: fingerprint(e) })),
    ...accounts
      .filter((a) => !a.done)
      .map((a) => ({
        step: 2 as const,
        id: a.id,
        fingerprint: fingerprint([
          a.balanceCents,
          a.clearedCents,
          a.lastReconciledOn,
          a.lastValuedOn,
          a.valueCents,
        ]),
      })),
    ...overspent.map((e) => ({
      step: 3 as const,
      id: e.categoryId,
      fingerprint: fingerprint(e.overspentCents),
    })),
  ];
  const steps = closeSteps(work, state.decisions, {
    remainingCents: nextBudget.summary.toBeAssignedCents,
    ...(state.closedOn && { closedOn: state.closedOn }),
  });
  const report = m <= today.slice(0, 7) ? monthOnePager(db, today, m) : null;
  const result = report ? {
    report,
    checkedAccounts: accounts.filter((a) => a.done).length,
    totalAccounts: accounts.length,
    deferredAccounts: work.filter((w) => w.step === 2 && state.decisions.some((d) =>
      d.step === w.step && d.id === w.id && d.fingerprint === w.fingerprint)).length,
    assignedCents: plan.summary.assignedCents,
    overspentCount: overspent.length,
    overspentCents: cents(Number(overspent.reduce((sum, row) => sum + BigInt(row.overspentCents), 0n))),
    carryInCents: nextBudget.summary.carryInCents,
    sourceMonth: m,
    destinationMonth: nextMonth,
  } : null;
  const revisionFacts = {
    // Calendar refreshes alone are not a new close. Historical month values use their real end.
    end, asOf, work, accounts: accounts.map((a) => ({
      id: a.id, balanceCents: a.balanceCents, clearedCents: a.clearedCents,
      lastReconciledOn: a.lastReconciledOn, lastValuedOn: a.lastValuedOn,
      valueCents: a.valueCents, done: a.done,
    })),
    steps: steps.slice(0, 4),
    currentSummary: { assignedCents: plan.summary.assignedCents,
      activityCents: plan.summary.activityCents, availableCents: plan.summary.availableCents,
      toBeAssignedCents: plan.summary.toBeAssignedCents,
      envelopes: plan.summary.envelopes.map((e) => ({ categoryId: e.categoryId,
        carryCents: e.carryCents, assignedCents: e.assignedCents, activityCents: e.activityCents,
        availableCents: e.availableCents, overspentCents: e.overspentCents })),
    },
    nextSummary: { toBeAssignedCents: nextBudget.summary.toBeAssignedCents,
      assignedCents: nextBudget.summary.assignedCents, carryInCents: nextBudget.summary.carryInCents,
    },
    result: result ? {
      ...result, report: { result: report!.result, allocation: report!.allocation,
        plan: report!.plan, pace: report!.pace.figures, top: report!.top },
    } : null,
  };
  return { end, asOf, state, accounts, nextMonth, plan, nextBudget, overspent, work, steps, report, result, inbox, revisionFacts };
}

function completeMonthCloseView(db: Db, m: string, today: string,
  prepared: ReturnType<typeof prepareMonthCloseSource>,
) {
  const { end, asOf, state, accounts, nextMonth, plan, nextBudget, overspent, work, steps, result, inbox } = prepared;
  // Presentation priority must not reorder the established close sourceRevision/work facts.
  const bankFirstAccounts = [...accounts].sort((a, b) =>
    Number(!['checking', 'savings', 'credit_card'].includes(a.type)) - Number(!['checking', 'savings', 'credit_card'].includes(b.type)));
  const unchangedConfirmation = previewMonthCloseReconciliation(db, m, today,
    bankFirstAccounts.map((a) => ({ id: a.id, manual: a.manual, done: a.done, hasHoldings: a.holdingValued })));
  const facts = loadFacts(db, lastDayOfMonth(nextMonth));
  const nextPlan = {
    month: nextMonth,
    payday: nextPayday(`${nextMonth}-01`).day,
    budget: nextBudget,
    previousAssigned: Object.fromEntries(
      plan.summary.envelopes.map((e) => [e.categoryId, e.assignedCents]),
    ),
    history: closePlanHistory(
      nextBudget.categories.map((c) => c.id),
      m,
      today,
      reportTables(db, { today }).months,
    ),
    payments: occurrencesBetween(
      db,
      facts,
      `${nextMonth}-01`,
      lastDayOfMonth(nextMonth),
      today,
      facts.budgetByMonth.get(nextMonth),
    ),
  };
  const sourceRevision = monthCloseSourceRevision(db, m, prepared.revisionFacts, accounts.map((a) => a.id));
  return {
    month: m,
    end,
    asOf,
    state,
    sourceRevision,
    navigation: closeNavigation(steps),
    result,
    close: {
      changedSinceClose: Boolean(state.snapshot && state.snapshot.sourceRevision !== sourceRevision),
      legacyMarker: Boolean(state.closedOn && !state.snapshot),
    },
    work,
    inbox,
    unchangedConfirmation,
    accounts: bankFirstAccounts,
    overspent,
    nextPlan,
    deviations: closeDeviations(
      plan.summary.envelopes.flatMap((e) => {
        const c = plan.categories.find((c) => c.id === e.categoryId);
        return c?.class ? [{ ...e, name: c.name }] : [];
      }),
    ),
    steps,
  };
}
