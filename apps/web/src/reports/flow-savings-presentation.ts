import {
  cents,
  reportPeriodMonths,
  savingsOverview,
  type MoneyFlow,
  type Period,
} from '@budget/domain';
import type { ReportTables } from './table-reports-api';
import type { ReportCalculation } from './report-frame';

/** Compact header from the reader's own totals; the complete class chain stays in the detail. */
export function flowCalculation(flow: MoneyFlow): ReportCalculation {
  return {
    label: 'Berechnung Geldfluss',
    signed: true,
    terms: [
      { label: 'Einnahmen', value: cents(flow.earnedCents) },
      ...(flow.capitalCents > 0
        ? [{ op: '+' as const, label: 'Kapitalerträge', value: cents(flow.capitalCents) }]
        : []),
      { op: '-', label: 'Ausgaben inkl. Zukunft', value: cents(flow.spentCents) },
    ],
    result: {
      label: `${flow.chain.at(-1)?.label ?? 'Rest'} · nach Zukunft`,
      value: flow.restCents,
      unit: 'money',
    },
  };
}

/** Exactly the existing savings window and overview; money age keeps its independent history. */
export function savingsPresentation(data: ReportTables, period: Period) {
  const window =
    data.firstMonth && (data.lastFullMonth || period.includes('..'))
      ? reportPeriodMonths(
          period,
          period.includes('..') ? data.currentMonth : data.lastFullMonth!,
          data.firstMonth,
        )
      : [];
  const overview = savingsOverview(
    data.months,
    data,
    window,
    period.includes('..') ? data.currentMonth : data.lastFullMonth,
  );
  const { incomeCents, savedCents, rateBp } = overview.window;
  const calculation: ReportCalculation = {
    label: 'Berechnung Sparquote im Zeitraum',
    terms: window.length
      ? [
          { label: 'Gespart', value: cents(savedCents) },
          { label: '÷ Haushaltseinnahmen', value: cents(incomeCents) },
        ]
      : [],
    result: {
      label: 'Sparquote im Zeitraum · ohne Kapitalerträge',
      value: window.length ? rateBp : null,
      unit: 'percent',
    },
  };
  return { window, overview, calculation };
}
