import { roundDivCents } from '../wealth/int';

/**
 * "Vorgestreckt pro Monat": what the owner paid for a contact, what came back and what is still
 * open, per month (pure; integer cents, ISO days). The caller supplies the contact statement's
 * outlays and the settlements the checklist already derives (`contactStatement`), so the
 * settlement logic is not duplicated here.
 */
export interface AdvanceOutlayInput {
  splitId: string;
  date: string;
  /** Positive: money the owner paid for the contact. */
  amountCents: number;
  /** What the advance was for (an expense category); `null` = no purpose recorded. */
  purposeCategoryId: string | null;
}

export interface AdvanceSettlementInput {
  outlaySplitId: string;
  /** The day the amount was settled; one before its outlay counts as the outlay's day. */
  date: string;
  amountCents: number;
  /** A waiver ("Geschenk an Kontakt"): settled, but nothing was repaid. */
  waived: boolean;
}

export interface AdvanceMonth {
  month: string;
  advancedCents: number;
  repaidCents: number;
  waivedCents: number;
  /** Open at the end of the month (of today for the current month). */
  openCents: number;
  /** Advanced in the month by purpose; sums to `advancedCents`. */
  byPurpose: { purposeCategoryId: string | null; cents: number }[];
}

export interface AdvanceReport {
  /** Newest first. */
  months: AdvanceMonth[];
  /** Advanced over the listed months by purpose, largest first (no purpose last). */
  purposeTotals: { purposeCategoryId: string | null; cents: number }[];
  /** Mean days from outlay to the last settlement, over fully settled outlays; `null` without. */
  averageDaysToSettle: number | null;
  settledOutlays: number;
  /** Highest open amount at any time. */
  peakOpenCents: number;
}

const dayNumber = (iso: string) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

function monthsEnding(today: string, count: number): string[] {
  let year = +today.slice(0, 4);
  let month = +today.slice(5, 7);
  const result: string[] = [];
  for (let i = 0; i < count; i += 1) {
    result.push(`${year}-${String(month).padStart(2, '0')}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return result;
}

type PurposeCents = { purposeCategoryId: string | null; cents: number };

const byPurposeOrder = (a: PurposeCents, b: PurposeCents) =>
  (a.purposeCategoryId === null ? 1 : 0) - (b.purposeCategoryId === null ? 1 : 0) ||
  b.cents - a.cents ||
  (a.purposeCategoryId ?? '').localeCompare(b.purposeCategoryId ?? '');

const purposeList = (map: Map<string | null, number>): PurposeCents[] =>
  [...map].map(([purposeCategoryId, cents]) => ({ purposeCategoryId, cents })).sort(byPurposeOrder);

export function summarizeAdvances(input: {
  outlays: readonly AdvanceOutlayInput[];
  settlements: readonly AdvanceSettlementInput[];
  today: string;
  months?: number;
}): AdvanceReport {
  const outlays = input.outlays.filter((o) => o.amountCents > 0 && o.date <= input.today);
  const outlayById = new Map(outlays.map((o) => [o.splitId, o]));
  const settlements = input.settlements
    .filter((s) => s.amountCents > 0 && outlayById.has(s.outlaySplitId))
    .map((s) => {
      const outlayDate = outlayById.get(s.outlaySplitId)!.date;
      return { ...s, date: s.date < outlayDate ? outlayDate : s.date };
    })
    .filter((s) => s.date <= input.today);

  // Peak: replay all events in day order, advances before settlements on the same day.
  const events = [
    ...outlays.map((o) => ({ date: o.date, delta: o.amountCents, order: 0 })),
    ...settlements.map((s) => ({ date: s.date, delta: -s.amountCents, order: 1 })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  let open = 0;
  let peakOpenCents = 0;
  for (const event of events) {
    open += event.delta;
    peakOpenCents = Math.max(peakOpenCents, open);
  }

  // Average days to full settlement.
  const settledBy = new Map<string, { cents: number; last: string }>();
  for (const s of settlements) {
    const entry = settledBy.get(s.outlaySplitId) ?? { cents: 0, last: s.date };
    entry.cents += s.amountCents;
    if (s.date > entry.last) entry.last = s.date;
    settledBy.set(s.outlaySplitId, entry);
  }
  let settledOutlays = 0;
  let totalDays = 0;
  for (const outlay of outlays) {
    const entry = settledBy.get(outlay.splitId);
    if (!entry || entry.cents < outlay.amountCents) continue;
    settledOutlays += 1;
    totalDays += dayNumber(entry.last) - dayNumber(outlay.date);
  }

  const months = monthsEnding(input.today, input.months ?? 12).map((month): AdvanceMonth => {
    const inMonth = (date: string) => date.slice(0, 7) === month;
    const upToMonth = (date: string) => date.slice(0, 7) <= month;
    const purposes = new Map<string | null, number>();
    let advancedCents = 0;
    for (const o of outlays)
      if (inMonth(o.date)) {
        advancedCents += o.amountCents;
        purposes.set(o.purposeCategoryId, (purposes.get(o.purposeCategoryId) ?? 0) + o.amountCents);
      }
    const settled = (waived: boolean) =>
      settlements.reduce(
        (sum, x) => (inMonth(x.date) && x.waived === waived ? sum + x.amountCents : sum),
        0,
      );
    return {
      month,
      advancedCents,
      repaidCents: settled(false),
      waivedCents: settled(true),
      openCents:
        outlays.reduce((sum, o) => (upToMonth(o.date) ? sum + o.amountCents : sum), 0) -
        settlements.reduce((sum, x) => (upToMonth(x.date) ? sum + x.amountCents : sum), 0),
      byPurpose: purposeList(purposes),
    };
  });
  const totals = new Map<string | null, number>();
  for (const m of months)
    for (const p of m.byPurpose)
      totals.set(p.purposeCategoryId, (totals.get(p.purposeCategoryId) ?? 0) + p.cents);
  return {
    months,
    purposeTotals: purposeList(totals),
    averageDaysToSettle: settledOutlays ? roundDivCents(totalDays, settledOutlays) : null,
    settledOutlays,
    peakOpenCents,
  };
}
