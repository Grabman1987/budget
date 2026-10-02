import { daysBetween } from '@budget/domain';

/**
 * Matching of the money that crossed a platform's boundary, PP against the app (YNAB transfers).
 * Both sides are lists of signed cents on days. The passes run from the strictest to the loosest
 * and each flow is used once, so what is left is really missing on one side:
 *
 * 1. `exact`: same amount within a few days (a bank transfer that PP dates by its own day);
 * 2. `dateShifted`: same amount, further apart (up to 45 days);
 * 3. `split`: several flows on one side add up to one flow on the other (a savings plan that PP
 *    books per execution and YNAB as one transfer), same sign, within a few days;
 * 4. `roundTrips`: a deposit and a removal of the same amount a few days apart on one side that
 *    cancel each other (PP books both for a savings plan that settles through the account);
 * 5. `aggregate`: what is left of a calendar month adds up to the same amount on both sides;
 * 6. `appBeforePp`: app flows dated before PP has any history of the platform (PP is incomplete
 *    there, nothing is wrong with the app);
 * 7. `ppOnly` / `appOnly`: nothing explains it.
 */

export interface FlowItem {
  date: string;
  cents: number;
  /** Caller's handle, carried through to the result (a booking id, a statement row). */
  ref?: string;
}

export interface FlowMatchOptions {
  exactDays?: number;
  shiftDays?: number;
  splitDays?: number;
  /** Largest number of candidates searched for a sum (2^n subsets). */
  maxCandidates?: number;
  /** Days within which a deposit and a removal of the same amount cancel. */
  roundTripDays?: number;
  /** First day PP knows the platform; app flows before it are PP gaps, not differences. */
  ppFrom?: string;
  /** Leave out the monthly-sum pass (matching that needs every flow named, not summed). */
  aggregate?: boolean;
}

export interface FlowMatchResult {
  exact: number;
  /** The pairs behind `exact`. */
  exactPairs: { pp: FlowItem; app: FlowItem; days: number }[];
  dateShifted: { pp: FlowItem; app: FlowItem; days: number }[];
  split: { pp: FlowItem[]; app: FlowItem[] }[];
  roundTrips: { side: 'pp' | 'app'; out: FlowItem; back: FlowItem }[];
  appBeforePp: FlowItem[];
  aggregate: { month: string; pp: FlowItem[]; app: FlowItem[] }[];
  ppOnly: FlowItem[];
  appOnly: FlowItem[];
}

const sum = (xs: readonly FlowItem[]) => xs.reduce((a, x) => a + x.cents, 0);

/** The smallest group of at least two items adding up to `target` (DFS, items sorted by size). */
function subsetSum(items: readonly FlowItem[], target: number): number[] | null {
  let best: number[] | null = null;
  const order = items.map((_, i) => i);
  const walk = (from: number, picked: number[], total: number) => {
    if (best && picked.length >= best.length) return;
    if (total === target && picked.length >= 2) {
      best = [...picked];
      return;
    }
    for (let k = from; k < order.length; k++) {
      const i = order[k] as number;
      picked.push(i);
      walk(k + 1, picked, total + (items[i] as FlowItem).cents);
      picked.pop();
    }
  };
  walk(0, [], 0);
  return best;
}

export function matchFlows(
  ppIn: readonly FlowItem[],
  appIn: readonly FlowItem[],
  options: FlowMatchOptions = {},
): FlowMatchResult {
  const {
    exactDays = 3,
    shiftDays = 45,
    splitDays = 5,
    maxCandidates = 14,
    roundTripDays = 7,
    ppFrom,
    aggregate = true,
  } = options;
  const pp = [...ppIn].sort((a, b) => a.date.localeCompare(b.date) || a.cents - b.cents);
  const app = [...appIn].sort((a, b) => a.date.localeCompare(b.date) || a.cents - b.cents);
  const usedPp = new Set<number>();
  const usedApp = new Set<number>();
  const result: FlowMatchResult = {
    exact: 0,
    exactPairs: [],
    dateShifted: [],
    split: [],
    roundTrips: [],
    appBeforePp: [],
    aggregate: [],
    ppOnly: [],
    appOnly: [],
  };

  // 1 and 2: same amount, the closest day first.
  const pairs: { p: number; a: number; gap: number }[] = [];
  pp.forEach((f, p) =>
    app.forEach((g, a) => {
      if (f.cents !== g.cents) return;
      const gap = Math.abs(daysBetween(g.date, f.date));
      if (gap <= shiftDays) pairs.push({ p, a, gap });
    }),
  );
  pairs.sort((x, y) => x.gap - y.gap || x.p - y.p || x.a - y.a);
  for (const { p, a, gap } of pairs) {
    if (usedPp.has(p) || usedApp.has(a)) continue;
    usedPp.add(p);
    usedApp.add(a);
    if (gap <= exactDays) {
      result.exact += 1;
      result.exactPairs.push({ pp: pp[p] as FlowItem, app: app[a] as FlowItem, days: gap });
    } else result.dateShifted.push({ pp: pp[p] as FlowItem, app: app[a] as FlowItem, days: gap });
  }

  // 3: several flows of one side are one flow of the other.
  const split = (
    one: readonly FlowItem[],
    oneUsed: Set<number>,
    many: readonly FlowItem[],
    manyUsed: Set<number>,
    asPp: boolean,
  ) => {
    const order = one
      .map((_, i) => i)
      .sort((x, y) => Math.abs((one[y] as FlowItem).cents) - Math.abs((one[x] as FlowItem).cents));
    for (const i of order) {
      if (oneUsed.has(i)) continue;
      const f = one[i] as FlowItem;
      const candidates = many
        .map((g, j) => ({ g, j }))
        .filter(
          ({ g, j }) =>
            !manyUsed.has(j) &&
            Math.sign(g.cents) === Math.sign(f.cents) &&
            Math.abs(daysBetween(g.date, f.date)) <= splitDays &&
            Math.abs(g.cents) < Math.abs(f.cents),
        )
        .sort(
          (x, y) =>
            Math.abs(daysBetween(x.g.date, f.date)) - Math.abs(daysBetween(y.g.date, f.date)),
        )
        .slice(0, maxCandidates);
      const found = subsetSum(
        candidates.map((c) => c.g),
        f.cents,
      );
      if (!found) continue;
      oneUsed.add(i);
      const group = found.map((k) => candidates[k] as { g: FlowItem; j: number });
      for (const c of group) manyUsed.add(c.j);
      result.split.push(
        asPp ? { pp: [f], app: group.map((c) => c.g) } : { pp: group.map((c) => c.g), app: [f] },
      );
    }
  };
  split(app, usedApp, pp, usedPp, false); // one app flow = several PP flows
  split(pp, usedPp, app, usedApp, true); // one PP flow = several app flows

  // 4: a deposit and a removal of the same amount that cancel on one side.
  const cancel = (list: readonly FlowItem[], used: Set<number>, side: 'pp' | 'app') => {
    for (let i = 0; i < list.length; i++) {
      const f = list[i] as FlowItem;
      if (used.has(i) || f.cents >= 0) continue;
      for (let j = 0; j < list.length; j++) {
        const g = list[j] as FlowItem;
        if (used.has(j) || i === j || g.cents !== -f.cents) continue;
        if (Math.abs(daysBetween(f.date, g.date)) > roundTripDays) continue;
        used.add(i);
        used.add(j);
        result.roundTrips.push({ side, out: f, back: g });
        break;
      }
    }
  };
  cancel(pp, usedPp, 'pp');
  cancel(app, usedApp, 'app');

  // 5: app flows before PP's history.
  if (ppFrom !== undefined)
    app.forEach((g, a) => {
      if (usedApp.has(a) || g.date >= ppFrom) return;
      usedApp.add(a);
      result.appBeforePp.push(g);
    });

  // 6: what is left of a month adds up.
  const left = (list: readonly FlowItem[], used: Set<number>) =>
    list.filter((_, i) => !used.has(i));
  const ppLeft = left(pp, usedPp);
  const appLeft = left(app, usedApp);
  const months = new Set([...ppLeft, ...appLeft].map((f) => f.date.slice(0, 7)));
  const ppRest: FlowItem[] = [];
  const appRest: FlowItem[] = [];
  for (const month of [...months].sort()) {
    const a = ppLeft.filter((f) => f.date.startsWith(month));
    const b = appLeft.filter((f) => f.date.startsWith(month));
    if (aggregate && a.length > 0 && b.length > 0 && sum(a) === sum(b))
      result.aggregate.push({ month, pp: a, app: b });
    else {
      ppRest.push(...a);
      appRest.push(...b);
    }
  }
  result.ppOnly = ppRest;
  result.appOnly = appRest;
  return result;
}
