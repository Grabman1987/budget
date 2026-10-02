/** Read-only calendar-year projection of already calculated envelope months. */
export interface PlanYearAmounts {
  assignedCents: number;
  activityCents: number;
  availableCents: number;
}

export interface PlanYearMonth {
  month: string;
  envelopes: ReadonlyArray<PlanYearAmounts & { categoryId: string }>;
}

export interface PlanYearRow {
  id: string;
  months: PlanYearAmounts[];
  /** Assigned/activity are flows; available is December's balance, never twelve balances added. */
  year: PlanYearAmounts;
}

export function planYearMonths(year: number): string[] {
  if (!Number.isInteger(year) || year < 1900 || year > 9999)
    throw new RangeError('Invalid calendar year');
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

const empty = (): PlanYearAmounts => ({ assignedCents: 0, activityCents: 0, availableCents: 0 });

/** Missing/duplicate months are an error, not an apparent zero year. Input order is irrelevant. */
export function planYearRows(year: number, source: ReadonlyArray<PlanYearMonth>): PlanYearRow[] {
  const months = planYearMonths(year);
  const byMonth = new Map(source.map((month) => [month.month, month]));
  if (source.length !== 12 || byMonth.size !== 12 || months.some((m) => !byMonth.has(m)))
    throw new RangeError('A calendar year needs all twelve distinct months');
  const cells = months.map((m) => {
    const envelopes = byMonth.get(m)!.envelopes;
    const map = new Map(envelopes.map((e) => [e.categoryId, e]));
    if (map.size !== envelopes.length) throw new RangeError('Duplicate envelope');
    return map;
  });
  const ids = new Set(cells.flatMap((month) => [...month.keys()]));
  return [...ids].map((id) => {
    const values = cells.map((month) => {
      const e = month.get(id);
      return e
        ? { assignedCents: e.assignedCents, activityCents: e.activityCents, availableCents: e.availableCents }
        : empty();
    });
    return { id, months: values, year: yearAmounts(values) };
  });
}

function yearAmounts(months: ReadonlyArray<PlanYearAmounts>): PlanYearAmounts {
  return {
    assignedCents: months.reduce((sum, m) => sum + m.assignedCents, 0),
    activityCents: months.reduce((sum, m) => sum + m.activityCents, 0),
    availableCents: months[11]!.availableCents,
  };
}

/** Group and grand totals use exactly the same envelope figures as their detail rows. */
export function sumPlanYearRows(rows: ReadonlyArray<PlanYearRow>): PlanYearRow {
  const months = Array.from({ length: 12 }, (_, index) => rows.reduce((sum, row) => {
    const cell = row.months[index]!;
    return {
      assignedCents: sum.assignedCents + cell.assignedCents,
      activityCents: sum.activityCents + cell.activityCents,
      availableCents: sum.availableCents + cell.availableCents,
    };
  }, empty()));
  return { id: 'total', months, year: yearAmounts(months) };
}
