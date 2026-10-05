export type BudgetClass = 'need' | 'want' | 'future';

export interface AllocItem {
  class: BudgetClass;
  /** Cents of the month, or of the whole year when `annual` is set. */
  cents: number;
  /** Counts as one twelfth per month (periodic costs, windfall transfers). */
  annual?: boolean;
}

export interface AllocMonth {
  /** Regular income of the month in cents. */
  incomeCents: number;
  /** Income that arrives once or twice a year (special payments), whole year in cents: counts as twelfths. */
  annualIncomeCents: number;
  items: ReadonlyArray<AllocItem>;
}

export interface Allocation {
  needCents: number;
  wantCents: number;
  futureCents: number;
  incomeCents: number;
  /** Income minus the three classes; negative = spending from savings ("aus Guthaben"). */
  restCents: number;
  /** Whole percent of income; need + want + future + rest is always 100. */
  shares: { need: number; want: number; future: number; rest: number };
}

/**
 * Whole percentages of income that add up to exactly 100 (largest-remainder rounding, SPEC §6
 * "dimension chains must add up"): need, want and future of income, the rest is the difference
 * (negative = spent from savings). Without income there is nothing to divide: the rest is 100 %.
 */
export function percentShares(input: {
  needCents: number;
  wantCents: number;
  futureCents: number;
  incomeCents: number;
}): { need: number; want: number; future: number; rest: number } {
  if (input.incomeCents <= 0) return { need: 0, want: 0, future: 0, rest: 100 };
  const restCents = input.incomeCents - input.needCents - input.wantCents - input.futureCents;
  const exact = [input.needCents, input.wantCents, input.futureCents, restCents].map(
    (v) => (v / input.incomeCents) * 100,
  );
  const floors = exact.map(Math.floor);
  let missing = 100 - floors.reduce((a, v) => a + v, 0);
  const byRemainder = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of byRemainder) {
    if (missing <= 0) break;
    floors[i] = (floors[i] as number) + 1;
    missing -= 1;
  }
  const [need, want, future, rest] = floors as [number, number, number, number];
  return { need, want, future, rest };
}

/**
 * 50/30/20 on assigned money over one or several months. Annual items and annual income are
 * summed in twelfths without rounding and converted to cents once at the end, so nothing drifts.
 * Port of `alloc` in `design/prototype/reports-core.js`.
 */
export function allocation(months: ReadonlyArray<AllocMonth>): Allocation {
  // Work in twelfths of a cent: monthly amounts x 12, annual amounts x 1.
  const t = { need: 0, want: 0, future: 0, income: 0 };
  for (const m of months) {
    t.income += m.incomeCents * 12 + m.annualIncomeCents;
    for (const item of m.items) t[item.class] += item.annual ? item.cents : item.cents * 12;
  }
  const c = (twelfths: number) => Math.round(twelfths / 12);
  const needCents = c(t.need);
  const wantCents = c(t.want);
  const futureCents = c(t.future);
  const incomeCents = c(t.income);
  return {
    needCents,
    wantCents,
    futureCents,
    incomeCents,
    restCents: incomeCents - needCents - wantCents - futureCents,
    shares: percentShares({ needCents, wantCents, futureCents, incomeCents }),
  };
}

export interface AssignedCategory {
  class: BudgetClass;
  /**
   * `regular`: what was booked counts. `periodic`: the planned annual amount counts as twelfths.
   * `windfall`: the monthly rule amount counts, plus `windfallShare` of the annual special payments as twelfths.
   */
  kind: 'regular' | 'periodic' | 'windfall';
  actualCents: number;
  annualPlannedCents?: number;
  regularCents?: number;
  windfallShare?: number;
}

/** Turns the facts of one month into what counts for 50/30/20. */
export function assignedMonth(input: {
  regularIncomeCents: number;
  specialIncomeAnnualCents: number;
  categories: ReadonlyArray<AssignedCategory>;
}): AllocMonth {
  const items: AllocItem[] = [];
  for (const c of input.categories) {
    if (c.kind === 'regular') items.push({ class: c.class, cents: c.actualCents });
    else if (c.kind === 'periodic')
      items.push({ class: c.class, cents: c.annualPlannedCents ?? 0, annual: true });
    else {
      items.push({ class: c.class, cents: c.regularCents ?? 0 });
      items.push({
        class: c.class,
        cents: Math.round(input.specialIncomeAnnualCents * (c.windfallShare ?? 0)),
        annual: true,
      });
    }
  }
  return {
    incomeCents: input.regularIncomeCents,
    annualIncomeCents: input.specialIncomeAnnualCents,
    items,
  };
}

/** Geometry on an income scale: withdrawals never shrink the spending stack. */
export function allocationBar(
  a: Pick<Allocation, 'incomeCents' | 'needCents' | 'wantCents' | 'futureCents' | 'restCents'>,
) {
  const need = Math.max(0, a.needCents);
  const want = Math.max(0, a.wantCents);
  const future = Math.max(0, a.futureCents);
  const spent = need + want + future;
  const rest = Math.max(0, Math.min(a.restCents, a.incomeCents - spent));
  const scale = Math.max(1, a.incomeCents, spent);
  return {
    need,
    want,
    future,
    rest,
    scale,
    overflowCents: Math.max(0, need + want - a.incomeCents),
    overflowBp:
      a.incomeCents > 0
        ? Math.round((Math.max(0, need + want - a.incomeCents) * 10000) / a.incomeCents)
        : null,
  };
}
