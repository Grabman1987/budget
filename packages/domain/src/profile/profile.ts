/**
 * Owner profile (Einstellungen › Profil). Purpose: later comparison of income and wealth with
 * Statistik Austria (age, household size, region). All values are optional; the public default is
 * generic and the owner fills in his own data in the app, so no personal data lives in the repo.
 */

/** Bundesländer with ISO 3166-2 codes (Statistik Austria publishes regional figures by these). */
export const REGIONS = [
  { code: 'AT-1', name: 'Burgenland' },
  { code: 'AT-2', name: 'Kärnten' },
  { code: 'AT-3', name: 'Niederösterreich' },
  { code: 'AT-4', name: 'Oberösterreich' },
  { code: 'AT-5', name: 'Salzburg' },
  { code: 'AT-6', name: 'Steiermark' },
  { code: 'AT-7', name: 'Tirol' },
  { code: 'AT-8', name: 'Vorarlberg' },
  { code: 'AT-9', name: 'Wien' },
] as const;
export type RegionCode = (typeof REGIONS)[number]['code'];

export const PROFILE_NAME_MAX = 60;
export const PROFILE_INITIALS_MAX = 3;
export const PROFILE_HOUSEHOLD_MAX = 20;

/** The profile as the app uses it; `null` / empty means "not given". */
export interface Profile {
  name: string;
  initials: string;
  /** `YYYY-MM-DD` or empty. */
  birthDate: string;
  /** Number of persons in the household (including the owner), or `null`. */
  household: number | null;
  region: RegionCode | null;
}

export const EMPTY_PROFILE: Profile = {
  name: '',
  initials: '',
  birthDate: '',
  household: null,
  region: null,
};

/** Fallbacks shown in the shell while no profile is filled in. */
export const GENERIC_PROFILE_NAME = 'Profil';
export const GENERIC_PROFILE_INITIALS = 'NU';

/**
 * Initials from a name: first letter of the first and the last word, upper case ("Anna Muster" →
 * "AM", "Anna" → "A"). Hyphenated first names count once.
 */
export function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const letter = (word: string) => [...word.replace(/^[^\p{L}\p{N}]+/u, '')][0] ?? '';
  const first = letter(words[0]!);
  const last = words.length > 1 ? letter(words[words.length - 1]!) : '';
  return (first + last).toLocaleUpperCase('de-AT');
}

/** What the shell shows: name and initials, with generic fallbacks. */
export function shellIdentity(profile: Profile): { name: string; initials: string } {
  const name = profile.name.trim();
  return {
    name: name || GENERIC_PROFILE_NAME,
    initials: profile.initials.trim() || deriveInitials(name) || GENERIC_PROFILE_INITIALS,
  };
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day not before 1900 and not after `today` (both `YYYY-MM-DD`). */
export function isPlausibleBirthDate(value: string, today: string): boolean {
  const m = ISO_DAY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d)
    return false;
  return y >= 1900 && value <= today;
}

export const isRegionCode = (value: unknown): value is RegionCode =>
  REGIONS.some((r) => r.code === value);

/** Age in full years on `today`, or `null` for an empty or implausible birth date. */
export function ageOn(birthDate: string, today: string): number | null {
  if (!isPlausibleBirthDate(birthDate, today)) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}
