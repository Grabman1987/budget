import {
  addDays,
  historyDays,
  netWorthWindow,
  periodWindow,
  STRUCTURE_GROUPS,
  structureOf,
  structureRows,
  structureTotal,
  type NetWorthWindow,
  type Period,
  type Structure,
  type StructureGroup,
  type StructureRow,
} from '@budget/domain';
import { account } from '../schema';
import { earliestAccountDate, netWorthAsOf, netWorthDaily } from './portfolio';
import type { Executor } from './types';

/**
 * Report 3.3 Vermögensverläufe: the net worth of a period exactly as the Vermögen pages show it
 * (same window, same daily series, same chain Anfang + Eigenleistung + Markt = jetzt), plus the
 * structure by account type at the start, at every week or month end and today. Every structure is
 * read with `netWorthAsOf`, so the types add up to the net worth of the same day.
 */

export interface NetWorthHistory {
  period: Period;
  /** Start day: its close is the first point and the chain's start. */
  from: string;
  to: string;
  chain: NetWorthWindow;
  daily: { date: string; netWorthCents: number }[];
  /** Structure by account type on `from`, on week or month ends, and on `to`. */
  points: { date: string; structure: Structure }[];
  unit: 'week' | 'month';
  /** Types that hold a balance on at least one point, in display order. */
  groups: StructureGroup[];
  rows: StructureRow[];
}

export function netWorthHistory(db: Executor, today: string, period: Period): NetWorthHistory {
  const earliest = earliestAccountDate(db) ?? today;
  const window = periodWindow(period, today, earliest);
  const to = window.to;
  const from = window.from < earliest ? (earliest < to ? earliest : to) : window.from;
  const startCents = netWorthAsOf(db, from).totalCents;
  const rows = from < to ? netWorthDaily(db, addDays(from, 1), to) : [];
  const chain = netWorthWindow(rows, startCents);
  const nowCents = netWorthAsOf(db, to).totalCents;
  if (chain.nowCents !== nowCents) throw new Error('Net worth series and netWorthAsOf disagree');

  const typeById = new Map(
    db
      .select({ id: account.id, type: account.type })
      .from(account)
      .all()
      .map((a) => [a.id, a.type as string]),
  );
  const unit = period === '1M' || period === '3M' ? 'week' : 'month';
  const points = historyDays(from, to, unit).map((date) => {
    const structure = structureOf(netWorthAsOf(db, date).byAccount, (id) => typeById.get(id));
    return { date, structure };
  });
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (structureTotal(first.structure) !== startCents || structureTotal(last.structure) !== nowCents)
    throw new Error('Structure and net worth disagree');

  const present = new Set(points.flatMap((p) => Object.keys(p.structure)));
  const known = new Set(STRUCTURE_GROUPS.map((g) => g.key));
  const groups: StructureGroup[] = [
    ...STRUCTURE_GROUPS.filter((g) => present.has(g.key)),
    ...[...present]
      .filter((k) => !known.has(k))
      .sort()
      .map((key) => ({ key, label: key, liability: false })),
  ];
  return {
    period,
    from,
    to,
    chain,
    daily: [
      { date: from, netWorthCents: startCents },
      ...rows.map((r) => ({ date: r.date, netWorthCents: r.netWorthCents })),
    ],
    points,
    unit,
    groups,
    rows: structureRows(first.structure, last.structure),
  };
}
