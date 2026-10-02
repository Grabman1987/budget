import { mulDivRound, ratioBp } from '../wealth/int';
import { wholePercents } from './period';

export type SpendClass = 'need' | 'want' | 'future';

export interface SpendCategory {
  id: string;
  name: string;
  groupName: string;
  class: SpendClass;
  /** Category kind (`periodic`, `fixed`, `variable` …) where the source knows it. */
  kind?: string;
}

/** Net spending per month and category in positive cents (a refund lowers it). */
export type SpendByMonth = Readonly<Record<string, Readonly<Record<string, number>>>>;

export interface SpendRow {
  id: string;
  name: string;
  groupName: string;
  class: SpendClass;
  cents: number;
  /** Same category in the equally long previous window; `null` without such a window. */
  previousCents: number | null;
}

export interface SpendMove extends SpendRow {
  changeCents: number;
}

export interface SpendHeatRow {
  id: string;
  name: string;
  class: SpendClass;
  /** One value per month of `heatMonths`, in cents (0 = nothing spent). */
  values: number[];
  totalCents: number;
}

export interface SpendingAnalysis {
  months: string[];
  previousMonths: string[] | null;
  /** Bedarf + Wunsch. */
  consumptionCents: number;
  needCents: number;
  wantCents: number;
  /** Money that went into Zukunft categories: it stays in the wealth. */
  futureCents: number;
  averagePerMonthCents: number;
  previousConsumptionCents: number | null;
  changeCents: number | null;
  /** Change of the consumption in basis points of the previous window; `null` without base. */
  changeBp: number | null;
  /** Whole percentages of Bedarf, Wunsch, Zukunft: add up to 100 (or all 0 without spending). */
  classShares: { need: number; want: number; future: number };
  rows: SpendRow[];
  moves: SpendMove[];
  heatMonths: string[];
  heatRows: SpendHeatRow[];
}

function sum(spend: SpendByMonth, months: ReadonlyArray<string>, ids: ReadonlyArray<string>) {
  let total = 0;
  for (const m of months) {
    const row = spend[m];
    if (!row) continue;
    for (const id of ids) total += row[id] ?? 0;
  }
  if (!Number.isSafeInteger(total)) throw new RangeError('Spending exceeds safe integer cents');
  return total;
}

/**
 * Ausgabenanalyse (2.1) from net category spending per month. Consumption is Bedarf plus Wunsch;
 * Zukunft is shown next to it but never counted as consumption. The comparison window is the
 * equally long window before, if the ledger reaches back that far.
 */
export function analyseSpending(input: {
  categories: ReadonlyArray<SpendCategory>;
  spend: SpendByMonth;
  months: ReadonlyArray<string>;
  previousMonths: ReadonlyArray<string> | null;
  /** All full months, ascending: the heatmap shows the last 12 of them when the window is shorter. */
  available: ReadonlyArray<string>;
}): SpendingAnalysis {
  const { categories, spend, months, previousMonths } = input;
  const idsOf = (cls: SpendClass) => categories.filter((c) => c.class === cls).map((c) => c.id);
  const needCents = sum(spend, months, idsOf('need'));
  const wantCents = sum(spend, months, idsOf('want'));
  const futureCents = sum(spend, months, idsOf('future'));
  const consumptionCents = needCents + wantCents;
  const consumptionIds = [...idsOf('need'), ...idsOf('want')];
  const previousConsumptionCents = previousMonths
    ? sum(spend, previousMonths, consumptionIds)
    : null;

  const rowOf = (c: SpendCategory): SpendRow => ({
    id: c.id,
    name: c.name,
    groupName: c.groupName,
    class: c.class,
    cents: sum(spend, months, [c.id]),
    previousCents: previousMonths ? sum(spend, previousMonths, [c.id]) : null,
  });
  const all = categories.filter((c) => c.class !== 'future').map(rowOf);
  const rows = all
    .filter((r) => r.cents > 0)
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name, 'de'));
  const moves: SpendMove[] = previousMonths
    ? all
        .map((r) => ({ ...r, changeCents: r.cents - (r.previousCents ?? 0) }))
        .filter((r) => r.changeCents !== 0)
        .sort(
          (a, b) =>
            Math.abs(b.changeCents) - Math.abs(a.changeCents) || a.name.localeCompare(b.name, 'de'),
        )
        .slice(0, 6)
    : [];

  const heatMonths = months.length >= 12 ? months.slice(-12) : input.available.slice(-12);
  const heatRows: SpendHeatRow[] = rows.map((r) => {
    const values = heatMonths.map((m) => spend[m]?.[r.id] ?? 0);
    return {
      id: r.id,
      name: r.name,
      class: r.class,
      values,
      totalCents: values.reduce((a, b) => a + b, 0),
    };
  });

  const [need, want, future] = wholePercents([needCents, wantCents, futureCents]) as [
    number,
    number,
    number,
  ];
  return {
    months: [...months],
    previousMonths: previousMonths ? [...previousMonths] : null,
    consumptionCents,
    needCents,
    wantCents,
    futureCents,
    averagePerMonthCents: months.length ? mulDivRound(consumptionCents, 1, months.length) : 0,
    previousConsumptionCents,
    changeCents:
      previousConsumptionCents === null ? null : consumptionCents - previousConsumptionCents,
    changeBp:
      previousConsumptionCents !== null && previousConsumptionCents > 0
        ? ratioBp(consumptionCents - previousConsumptionCents, previousConsumptionCents)
        : null,
    classShares: { need, want, future },
    rows,
    moves,
    heatMonths,
    heatRows,
  };
}
