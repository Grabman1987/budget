import { z } from 'zod';
import { addMonths, lastDayOfMonth } from './date';
import { percentShares, type BudgetClass } from './ledger/alloc';
import { mulDivRound } from './wealth/int';
import { cents } from './money/cents';
import type { TableMonth } from './report-tables/tables';
import type { MonthResult } from './reports/month';

export const closeDecisionSchema = z.strictObject({
  step: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  id: z.string().min(1).max(150),
  fingerprint: z.string().min(1).max(100),
  reason: z.string().trim().min(1).max(500),
});
export const monthCloseStateSchema = z.strictObject({
  currentStep: z.int().min(1).max(5).default(1),
  decisions: z.array(closeDecisionSchema).max(1000).default([]),
  closedOn: z.iso.date().optional(),
});
export type CloseDecision = z.infer<typeof closeDecisionSchema>;
export type MonthCloseState = z.infer<typeof monthCloseStateSchema>;
export type CloseWork = Pick<CloseDecision, 'step' | 'id' | 'fingerprint'>;
export const CLOSE_TITLES = [
  'Posteingang leeren',
  'Konten abgleichen',
  'Überzogenes ausgleichen',
  'Nächsten Monat planen',
  'Rückblick',
] as const;
export function closeSteps(
  work: CloseWork[],
  decisions: CloseDecision[],
  plan?: { remainingCents: number; closedOn?: string },
) {
  return CLOSE_TITLES.map((title, i) => {
    const step = i + 1;
    const items = work.filter((w) => w.step === step);
    const accepted = items.flatMap((w) =>
      decisions.filter(
        (d) => d.step === w.step && d.id === w.id && d.fingerprint === w.fingerprint,
      ),
    );
    const openCount = items.length - accepted.length;
    return {
      step,
      title,
      openCount: step === 4 && plan ? Number(plan.remainingCents !== 0) : openCount,
      reasons: [...new Set(accepted.map((d) => d.reason))],
      status:
        step === 4 && plan
          ? plan.remainingCents === 0
            ? ('done' as const)
            : ('open' as const)
          : step === 5 && plan
            ? plan.closedOn
              ? ('done' as const)
              : ('open' as const)
            : step > 3
              ? ('following' as const)
              : openCount > 0
                ? ('open' as const)
                : accepted.length > 0
                  ? ('skipped' as const)
                  : ('done' as const),
    };
  });
}
export type CloseStep = ReturnType<typeof closeSteps>[number];

/** Tracked zero-spend months count; partial and pre-tracking months never dilute the mean. */
export function closePlanHistory(
  ids: readonly string[],
  month: string,
  today: string,
  history: readonly Pick<TableMonth, 'month' | 'spending'>[],
) {
  const last = lastDayOfMonth(month) <= today ? month : addMonths(month, -1);
  const from = addMonths(last, -11);
  const closed = history.filter((m) => m.month >= from && m.month <= last);
  const actual = history.find((m) => m.month === month);
  return ids.map((categoryId) => ({
    categoryId,
    actualCents: actual ? (actual.spending[categoryId] ?? 0) : null,
    averageCents: closed.length
      ? cents(
          mulDivRound(
            closed.reduce((sum, m) => sum + BigInt(cents(m.spending[categoryId] ?? 0)), 0n),
            1,
            closed.length,
          ),
        )
      : null,
    historyCount: closed.length,
  }));
}

/** Monthly assignments already include the monthly saving for periodic obligations. */
export function closePlanProjection(
  remainingCents: number,
  incomeCents: number,
  rows: readonly { categoryId: string; class: BudgetClass | null; assignedCents: number }[],
  draft: Readonly<Record<string, number>>,
) {
  let addedCents = 0n;
  const totals = { need: 0n, want: 0n, future: 0n };
  for (const r of rows) {
    const value = BigInt(cents(draft[r.categoryId] ?? r.assignedCents));
    addedCents += value - BigInt(cents(r.assignedCents));
    if (r.class) totals[r.class] += value;
  }
  const monthly = {
    needCents: cents(Number(totals.need)),
    wantCents: cents(Number(totals.want)),
    futureCents: cents(Number(totals.future)),
    incomeCents: cents(incomeCents),
  };
  return {
    remainingCents: cents(Number(BigInt(cents(remainingCents)) - addedCents)),
    allocation: {
      ...monthly,
      restCents: cents(
        Number(BigInt(monthly.incomeCents) - totals.need - totals.want - totals.future),
      ),
      shares: percentShares(monthly),
    },
  };
}

export function closeDeviations(
  rows: readonly {
    categoryId: string;
    name: string;
    carryCents: number;
    assignedCents: number;
    activityCents: number;
  }[],
) {
  return rows
    .map((r) => {
      const planCents = cents(r.carryCents + r.assignedCents);
      const actualCents = cents(-r.activityCents);
      return {
        categoryId: r.categoryId,
        name: r.name,
        planCents,
        actualCents,
        deltaCents: cents(actualCents - planCents),
      };
    })
    .filter((r) => r.deltaCents !== 0)
    .sort(
      (a, b) =>
        Math.abs(b.deltaCents) - Math.abs(a.deltaCents) || a.categoryId.localeCompare(b.categoryId),
    )
    .slice(0, 3);
}

/** Factual fallback shared by the One-Pager and close review until Job E is available. */
export function monthCloseVerdict(
  result: Pick<MonthResult, 'earnedCents' | 'consumptionCents' | 'savedCents'>,
  money: (value: number) => string,
) {
  return result.savedCents >= 0
    ? `Von ${money(result.earnedCents)} Einnahmen bleiben nach ${money(result.consumptionCents)} Konsum ${money(result.savedCents)} gespart.`
    : `Bei ${money(result.earnedCents)} Einnahmen und ${money(result.consumptionCents)} Konsum wurden ${money(-result.savedCents)} aus Guthaben verwendet.`;
}
/** First five days close the previous month; last five days prepare the current one. */
export function closeEntryMonth(today: string): string | null {
  const month = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  return day <= 5
    ? addMonths(month, -1)
    : day >= Number(lastDayOfMonth(month).slice(8, 10)) - 4
      ? month
      : null;
}
