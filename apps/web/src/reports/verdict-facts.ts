import { monthConsumption, savingsRateOf, type VerdictFacts } from '@budget/domain';
import type { ReportTables, WholePicture } from '@budget/db';
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
  return {
    reportId: 'heute',
    period: data.stand.today.slice(0, 7),
    partial: true,
    metric: {
      label: 'Sparbetrag',
      value: data.monthResult.savedCents,
      unit: 'money',
      better: 'higher',
    },
  };
}
export function wholeVerdictFacts(row: WholePicture['totals'], estimated = false): VerdictFacts {
  return {
    reportId: 'gesamtuebersicht',
    period: row.month,
    estimated,
    metric: { label: 'Sparbetrag', value: row.savedCents, unit: 'money', better: 'higher' },
    marketCents: row.marketCents,
    netWorth: { currentCents: row.endCents, previousCents: row.startCents },
  };
}
