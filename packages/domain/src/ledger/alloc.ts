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

/** Percentages of income: the three classes rounded, the rest absorbs rounding so the sum is 100. */
export function percentShares(input: {
  needCents: number;
  wantCents: number;
  futureCents: number;
  incomeCents: number;
}): { need: number; want: number; future: number; rest: number } {
  if (input.incomeCents <= 0) return { need: 0, want: 0, future: 0, rest: 0 };
  const pct = (v: number) => Math.round((v / input.incomeCents) * 100);
  const need = pct(input.needCents);
  const want = pct(input.wantCents);
  const future = pct(input.futureCents);
  return { need, want, future, rest: 100 - need - want - future };
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
