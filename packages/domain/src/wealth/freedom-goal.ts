import { ageOn } from '../profile/profile';
import { MAX_FREEDOM_MONTHS, requiredMonthlySavingCents, valueAfterMonths } from './freedom';

export interface FreedomGoalDocument {
  schemaVersion: 1;
  goalYear: number | null;
}

/** Personal dates remain server-side; an opaque revision also fences age-dependent writes. */
export interface FreedomGoalState extends FreedomGoalDocument {
  revision: string;
  ageRevision: string;
  ageAvailable: boolean;
  goalAge: number | null;
  unavailable: boolean;
  asOf: string;
}

export type FreedomGoalChange =
  | { kind: 'year'; year: number }
  | { kind: 'age'; age: number; ageRevision: string }
  | { kind: 'clear' };

export interface FreedomGoalWrite extends FreedomGoalState {
  groupId: string;
  changed: boolean;
}

export const isFreedomGoalYear = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1900 && value <= 9999;

/** Unsupported/corrupt settings are unavailable, never an invitation to replace their bytes. */
export function freedomGoalDocument(raw: unknown): FreedomGoalDocument | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (
    Object.keys(value).length !== 2 ||
    value.schemaVersion !== 1 ||
    !(value.goalYear === null || isFreedomGoalYear(value.goalYear))
  )
    return null;
  return { schemaVersion: 1, goalYear: value.goalYear };
}

/** The age reached in the calendar year, not a fabricated birthday-month deadline. */
export function freedomGoalYearFromAge(
  birthDate: string,
  age: number,
  today: string,
): number | null {
  if (ageOn(birthDate, today) === null || !Number.isInteger(age) || age < 0 || age > 200)
    return null;
  const year = Number(birthDate.slice(0, 4)) + age;
  return isFreedomGoalYear(year) ? year : null;
}

export function freedomGoalAge(
  birthDate: string,
  year: number | null,
  today: string,
): number | null {
  if (year === null || ageOn(birthDate, today) === null) return null;
  const age = year - Number(birthDate.slice(0, 4));
  return Number.isInteger(age) && age >= 0 && age <= 200 ? age : null;
}

/** Keep the established January goal-year convention and month-end saving timing. */
export const freedomGoalMonth = (year: number): string => `${String(year).padStart(4, '0')}-01`;

export function freedomGoalMonths(year: number, asOf: string): number {
  return (year - Number(asOf.slice(0, 4))) * 12 + 1 - Number(asOf.slice(5, 7));
}

export interface FreedomGoalRate {
  status: 'unset' | 'unavailable' | 'missed' | 'available';
  monthlySavingCents: number | null;
  months: number | null;
}

/** Availability wrapper only: the existing minimum-cent algorithm and rounding stay unchanged. */
export function freedomGoalRate(input: {
  goalYear: number | null;
  asOf: string;
  investedCents: number | null;
  targetCents: number | null;
  realReturnBp: number;
}): FreedomGoalRate {
  const unavailable: FreedomGoalRate = {
    status: 'unavailable',
    monthlySavingCents: null,
    months: null,
  };
  if (input.goalYear === null) return { ...unavailable, status: 'unset' };
  if (
    !isFreedomGoalYear(input.goalYear) ||
    !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(input.asOf) ||
    input.investedCents === null ||
    input.targetCents === null ||
    ![input.investedCents, input.targetCents, input.realReturnBp].every(Number.isSafeInteger) ||
    input.targetCents <= 0 ||
    input.realReturnBp < 0 ||
    input.realReturnBp > 600 ||
    !Number.isSafeInteger(input.targetCents - input.investedCents)
  )
    return unavailable;
  const months = Math.max(0, freedomGoalMonths(input.goalYear, input.asOf));
  if (months > MAX_FREEDOM_MONTHS) return unavailable;
  try {
    const rate = requiredMonthlySavingCents({
      startCents: input.investedCents,
      targetCents: input.targetCents,
      realReturnBp: input.realReturnBp,
      months,
    });
    if (rate === null) return { status: 'missed', monthlySavingCents: null, months };
    if (!Number.isSafeInteger(rate) || rate < 0) return unavailable;
    // The existing search's upper-bound assumption can fail for signed negative capital.
    // Never publish a non-reaching/nonminimal result or replace that shared algorithm here.
    if (
      valueAfterMonths(input.investedCents, months, input.realReturnBp, rate) < input.targetCents ||
      (rate > 0 &&
        valueAfterMonths(input.investedCents, months, input.realReturnBp, rate - 1) >=
          input.targetCents)
    )
      return unavailable;
    return { status: 'available', monthlySavingCents: rate, months };
  } catch {
    return unavailable;
  }
}
