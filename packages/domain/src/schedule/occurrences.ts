import { addDays, monthOf } from '../date';
import { dayDistance, dueDates, type Rhythm, type ScheduleRule } from './due-dates';

/**
 * `missed` (ausgefallen) is a warning: it should have come. `skipped` (gestrichen) is a deliberate
 * plan change: the occurrence is out of the forecast and is never matched, without a warning.
 */
export type OccurrenceStatus = 'expected' | 'received' | 'deviating' | 'missed' | 'skipped';
export type ExpectedKind = 'outflow' | 'inflow';

/** An expected payment as far as the schedule is concerned. */
export interface SchedulePayment extends ScheduleRule {
  kind: ExpectedKind;
  /** Basis points of each amount that is paid for the payment's contact (receivable). */
  contactShareBp: number;
}

/** Amount of a payment from `validFrom` on (positive cents; the kind gives the sign). */
export interface ScheduleVersion {
  validFrom: string;
  amountCents: number;
  amountMaxCents: number | null;
}

/** One due date with its amounts. Signed: outflows negative; `amountMaxCents` has the larger size. */
export interface Occurrence {
  dueDate: string;
  amountCents: number;
  amountMaxCents: number | null;
  /** The part paid for the contact, same sign as the amount. */
  contactShareCents: number;
}

/** The version in force on `day`: the latest one that has started. Undefined before the first. */
export function versionOn<V extends { validFrom: string }>(
  versions: readonly V[],
  day: string,
): V | undefined {
  let best: V | undefined;
  for (const v of versions) {
    if (v.validFrom <= day && (!best || v.validFrom > best.validFrom)) best = v;
  }
  return best;
}

/**
 * The contact's part of `amountCents`: `bp` basis points, rounded to whole cents half away from
 * zero (so a share never depends on the sign), with the sign of the amount. BigInt keeps the
 * product exact. Shares are rounded per occurrence, not per total.
 */
export function shareOf(amountCents: number, bp: number): number {
  const size = BigInt(Math.abs(amountCents)) * BigInt(bp);
  const rounded = Number((size + 5000n) / 10000n);
  return amountCents < 0 && rounded !== 0 ? -rounded : rounded;
}

/** The occurrences of `payment` in `from`..`to`; due dates before its first version are skipped. */
export function occurrences(
  payment: SchedulePayment,
  versions: readonly ScheduleVersion[],
  from: string,
  to: string,
): Occurrence[] {
  const sign = payment.kind === 'outflow' ? -1 : 1;
  const out: Occurrence[] = [];
  for (const dueDate of dueDates(payment, from, to)) {
    const v = versionOn(versions, dueDate);
    if (!v) continue;
    const amountCents = sign * v.amountCents;
    out.push({
      dueDate,
      amountCents,
      amountMaxCents: v.amountMaxCents === null ? null : sign * v.amountMaxCents,
      contactShareCents: shareOf(amountCents, payment.contactShareBp),
    });
  }
  return out;
}

const PER_YEAR: Record<Rhythm, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  yearly: 1,
};

/** Yearly equivalent of one payment of `amountCents` (keeps the sign). */
export const yearlyEquivalent = (rhythm: Rhythm, amountCents: number): number =>
  amountCents * PER_YEAR[rhythm];

/** Monthly equivalent: the yearly one over 12, rounded to whole cents half away from zero. */
export function monthlyEquivalent(rhythm: Rhythm, amountCents: number): number {
  const yearly = yearlyEquivalent(rhythm, amountCents);
  const rounded = Math.floor((Math.abs(yearly) * 2 + 12) / 24);
  return yearly < 0 && rounded !== 0 ? -rounded : rounded;
}

// ---------------------------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------------------------

/** What identifies a payment in the ledger. */
export interface MatchTarget {
  accountId: string | null;
  payeeId: string | null;
  contactId: string | null;
  categoryId: string | null;
  incomeTypeId: string | null;
}

/** What a booking shows of itself (its splits give the categories and income types). */
export interface BookingFacts {
  accountId: string;
  payeeId: string | null;
  payeeContactId: string | null;
  categoryIds: readonly string[];
  incomeTypeIds: readonly string[];
}

/**
 * A booking can belong to a payment when it is on the payment's account and its payee (or the
 * payee's contact), a split category or a split income type is the payment's. A payment that
 * names none of them fits nothing (link it by hand).
 */
export function candidateFits(target: MatchTarget, booking: BookingFacts): boolean {
  if (target.accountId !== null && booking.accountId !== target.accountId) return false;
  return (
    (target.payeeId !== null && booking.payeeId === target.payeeId) ||
    (target.contactId !== null && booking.payeeContactId === target.contactId) ||
    (target.categoryId !== null && booking.categoryIds.includes(target.categoryId)) ||
    (target.incomeTypeId !== null && booking.incomeTypeIds.includes(target.incomeTypeId))
  );
}

/** A booking in the running for an occurrence. */
export interface MatchCandidate {
  id: string;
  date: string;
  /** Signed, in the currency of the payment's versions. */
  amountCents: number;
}

export interface Match {
  status: 'received' | 'deviating';
  candidate: MatchCandidate;
  dayDelta: number;
  amountDelta: number;
}

/** Size of the gap between a booked amount and the occurrence's range, 0 inside it. */
export function amountGap(occ: Occurrence, amountCents: number): number {
  const a = Math.abs(occ.amountCents);
  const b = Math.abs(occ.amountMaxCents ?? occ.amountCents);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const size = Math.abs(amountCents);
  if (size < lo) return lo - size;
  if (size > hi) return size - hi;
  return 0;
}

const sameSign = (a: number, b: number) => Math.sign(a) === Math.sign(b);

/** Candidates in the window with the same sign, nearest day first, then nearest amount, then id. */
function rank(occ: Occurrence, candidates: readonly MatchCandidate[], windowDays: number) {
  return candidates
    .filter(
      (c) =>
        sameSign(c.amountCents, occ.amountCents) && dayDistance(c.date, occ.dueDate) <= windowDays,
    )
    .map((c) => ({
      candidate: c,
      dayDelta: dayDistance(c.date, occ.dueDate),
      amountDelta: amountGap(occ, c.amountCents),
    }))
    .sort(
      (x, y) =>
        x.dayDelta - y.dayDelta ||
        x.amountDelta - y.amountDelta ||
        x.candidate.id.localeCompare(y.candidate.id),
    );
}

const statusOf = (amountDelta: number, toleranceCents: number): Match['status'] =>
  amountDelta <= toleranceCents ? 'received' : 'deviating';

/**
 * The best booking for an occurrence: same sign, at most `windowDays` from the due date, nearest
 * day first, then nearest amount. `received` when the amount is inside the range plus
 * `toleranceCents`, `deviating` when it is outside. Null when nothing is in the window.
 */
export function matchOccurrence(
  occ: Occurrence,
  candidates: readonly MatchCandidate[],
  toleranceCents: number,
  windowDays: number,
): Match | null {
  const best = rank(occ, candidates, windowDays)[0];
  if (!best) return null;
  return { ...best, status: statusOf(best.amountDelta, toleranceCents) };
}

export interface AssignInput {
  key: string;
  /** A `skipped` (gestrichen) occurrence is never matched, not even by a booking that fits. */
  status?: OccurrenceStatus;
  occurrence: Occurrence;
  /** Bookings that fit the payment (see `candidateFits`). */
  candidates: readonly MatchCandidate[];
  toleranceCents: number;
  windowDays: number;
}

/**
 * Match many occurrences at once so that a booking belongs to at most one of them. Two passes:
 * first only fits inside the tolerance (`received`), then deviating ones from what is left. Inside
 * a pass the closest pairs go first (nearest day, then nearest amount, then due date and key), so
 * a booking goes to the occurrence it is closest to, not to the earliest one. `claimed` (bookings
 * that already belong to an occurrence) is respected and not changed.
 */
export function assignMatches(
  inputs: readonly AssignInput[],
  claimed: ReadonlySet<string>,
): Map<string, Match> {
  const taken = new Set(claimed);
  const result = new Map<string, Match>();
  const pairs = inputs
    .filter((input) => input.status !== 'skipped')
    .flatMap((input) =>
      rank(input.occurrence, input.candidates, input.windowDays).map((r) => ({
        input,
        match: { ...r, status: statusOf(r.amountDelta, input.toleranceCents) },
      })),
    );
  pairs.sort(
    (x, y) =>
      x.match.dayDelta - y.match.dayDelta ||
      x.match.amountDelta - y.match.amountDelta ||
      x.input.occurrence.dueDate.localeCompare(y.input.occurrence.dueDate) ||
      x.input.key.localeCompare(y.input.key) ||
      x.match.candidate.id.localeCompare(y.match.candidate.id),
  );
  for (const pass of ['received', 'deviating'] as const) {
    for (const { input, match } of pairs) {
      if (match.status !== pass || result.has(input.key) || taken.has(match.candidate.id)) continue;
      result.set(input.key, match);
      taken.add(match.candidate.id);
    }
  }
  return result;
}

/**
 * Status of an occurrence: from its match; else `missed` once the window has passed, `expected`
 * until then.
 */
export function occurrenceStatus(input: {
  dueDate: string;
  windowDays: number;
  today: string;
  match: { status: 'received' | 'deviating' } | null;
}): OccurrenceStatus {
  if (input.match) return input.match.status;
  return input.today > addDays(input.dueDate, input.windowDays) ? 'missed' : 'expected';
}

/** A price change the owner may accept: from `fromMonth` on the payment costs `amountCents`. */
export interface VersionSuggestion {
  paymentId: string;
  fromMonth: string;
  amountCents: number;
}

/** Suggestion for a deviating occurrence: the booked amount (positive), from the occurrence's month. */
export function versionSuggestion(
  paymentId: string,
  occ: Occurrence,
  booked: MatchCandidate,
): VersionSuggestion {
  return { paymentId, fromMonth: monthOf(occ.dueDate), amountCents: Math.abs(booked.amountCents) };
}
