import { monthConsumption, savingsRateOf, type VerdictFacts } from '@budget/domain';
import type { AssetsDebtsHistory, NetWorthHistory, ReportTables, WholePicture } from '@budget/db';
import type { OnePagerData } from './month-api';
import type { Heute } from '../heute/api';

export function tableVerdictFacts(
  reportId: string,
  tables: ReportTables,
  end: string,
): VerdictFacts {
  const months = tables.months.filter((m) => m.month <= end);
  const latest = months.at(-1);
  const rate = reportId === 'sparquote';
  const valueOf = (m: ReportTables['months'][number]) =>
    rate ? savingsRateOf([m], tables).rateBp : monthConsumption(m, tables);
  return {
    reportId,
    period: end,
    partial: end > (tables.lastFullMonth ?? ''),
    historyScope: 'all',
    metric: {
      label: rate ? 'Sparquote' : 'Konsum',
      value: latest ? valueOf(latest) : null,
      unit: rate ? 'percent' : 'money',
      better: rate ? 'higher' : 'lower',
    },
    history: months.map((m) => ({ month: m.month, value: valueOf(m) })),
    savingsRates: rate
      ? months.map((m) => ({ month: m.month, value: savingsRateOf([m], tables).rateBp }))
      : [],
    savingsTargetBp: tables.targets.savingsRateBp,
    // Month result of the plan: minus the overspending of every category that had a plan. Zero
    // means no category went over, so a streak or "first month in plan" needs no new calculation.
    budgetMargins: months.map((m) => ({
      month: m.month,
      value:
        0 -
        tables.categories.reduce((sum, c) => {
          const planned = m.assigned[c.id] ?? 0;
          return planned > 0 ? sum + Math.max(0, (m.spending[c.id] ?? 0) - planned) : sum;
        }, 0),
    })),
    categoryStreaks: tables.categories
      .filter((c) => months.some((m) => (m.assigned[c.id] ?? 0) > 0 && (m.spending[c.id] ?? 0) > 0))
      .map((c) => ({
        category: c.name,
        margins: months.map((m) => ({
          month: m.month,
          value: (m.assigned[c.id] ?? 0) - (m.spending[c.id] ?? 0),
        })),
      })),
    comparisons:
      months.length >= 2 ? [{ reference: 'Vormonat', value: valueOf(months.at(-2)!) }] : [],
  };
}
export function onePagerVerdictFacts(data: OnePagerData): VerdictFacts {
  const net = 'unavailable' in data.netWorth ? null : data.netWorth;
  return {
    reportId: 'onepager',
    period: data.month,
    partial: data.partial,
    estimated: Boolean(data.incomplete?.length),
    unavailable: data.beforeRecords,
    metric: { label: 'Sparbetrag', value: data.result.savedCents, unit: 'money', better: 'higher' },
    ...(data.partial && data.asOf.slice(0, 7) === data.month
      ? {
          monthProgress: {
            asOf: data.asOf,
            pendingIncome: data.expectedIncomeProgress
              ? {
                  count: data.expectedIncomeProgress.pendingCount,
                  cents: data.expectedIncomeProgress.pendingCents,
                  from: data.expectedIncomeProgress.fromDueDate,
                  through: data.expectedIncomeProgress.throughDueDate,
                }
              : null,
          },
        }
      : {}),
    equivalents: data.top
      .slice(0, 1)
      .map((c) => ({ category: c.name, costCents: c.cents, unit: 'Monatsbeträgen' })),
    ...(net
      ? {
          marketCents: net.marketCents,
          ownCents: net.ownCents,
          netWorth: { currentCents: net.cents, previousCents: net.previousMonthEndCents },
        }
      : {}),
  };
}
export function heuteVerdictFacts(data: Heute): VerdictFacts {
  const salary = data.balance.salary;
  const currentMonth = data.stand.today.slice(0, 7);
  const pendingSalary =
    salary && salary.day > data.stand.today && salary.day.slice(0, 7) === currentMonth
      ? salary
      : null;
  return {
    reportId: 'heute',
    period: currentMonth,
    partial: true,
    metric: {
      label: 'Sparbetrag',
      value: data.monthResult.savedCents,
      unit: 'money',
      better: 'higher',
    },
    monthProgress: {
      asOf: data.stand.today,
      pendingIncome: pendingSalary
        ? {
            count: 1,
            cents: pendingSalary.cents,
            from: pendingSalary.day,
            through: pendingSalary.day,
          }
        : null,
    },
  };
}
export function wholeVerdictFacts(
  row: WholePicture['totals'],
  estimated = false,
  rows: WholePicture['rows'] = [],
): VerdictFacts {
  const end = row.month.match(/\d{4}-\d{2}/g)?.at(-1) ?? '';
  return {
    reportId: 'gesamtuebersicht',
    period: row.month,
    estimated,
    metric: { label: 'Sparbetrag', value: row.savedCents, unit: 'money', better: 'higher' },
    // The old line said "gespart, Markt, Nettovermögen": the sentence names what it wins on, the
    // details add the rest of those three figures.
    details: [
      {
        label: 'Gespart',
        value: row.savedCents,
        skipFor: ['summary', 'negative', 'record-high', 'record-low', 'equivalent'],
      },
      { label: 'Markt', value: row.marketCents, skipFor: ['market-up', 'market-down', 'effort'] },
      { label: 'Nettovermögen', value: row.endCents - row.startCents },
    ],
    marketCents: row.marketCents,
    netWorth: { currentCents: row.endCents, previousCents: row.startCents },
    wealthChanges: rows
      .filter((r) => r.month <= end)
      .map((r) => ({ month: r.month, value: r.deltaCents })),
  };
}
/** Month-end values of a daily series: the change per month against the previous month end. */
function monthlyChanges(startCents: number, daily: { date: string; netWorthCents: number }[]) {
  const ends = new Map<string, number>();
  for (const d of daily) ends.set(d.date.slice(0, 7), d.netWorthCents);
  let previous = startCents;
  return [...ends].map(([month, value]) => {
    const change = { month, value: value - previous };
    previous = value;
    return change;
  });
}
export function wealthHistoryVerdictFacts(
  reportId: string,
  history: NetWorthHistory & { incomplete?: readonly unknown[] },
): VerdictFacts {
  return {
    reportId,
    period: `${history.from}..${history.to}`,
    estimated: Boolean(history.incomplete?.length),
    metric: {
      label: 'Nettovermögensänderung',
      value: history.chain.deltaCents,
      unit: 'money',
      better: 'higher',
    },
    marketCents: history.chain.marketCents,
    ownCents: history.chain.ownCents,
    netWorth: { currentCents: history.chain.nowCents, previousCents: history.chain.startCents },
    wealthChanges: monthlyChanges(history.chain.startCents, history.daily),
  };
}
export function assetsDebtsVerdictFacts(
  reportId: string,
  history: AssetsDebtsHistory,
): VerdictFacts {
  const months = history.months;
  const last = months.at(-1);
  const before = months.at(-2);
  return {
    reportId,
    period: `${history.from}..${history.to}`,
    estimated: months.some((m) => m.incomplete),
    metric: {
      label: 'Nettovermögensänderung',
      value: history.change.deltaCents,
      unit: 'money',
      better: 'higher',
    },
    wealthChanges: months.slice(1).map((m, i) => ({
      month: m.month,
      value: m.netCents - months[i]!.netCents,
    })),
    // Debts are stored negative; compare the open amounts of the last two month ends.
    ...(last && before
      ? { debt: { currentCents: -last.debtsCents, previousCents: -before.debtsCents } }
      : {}),
  };
}
