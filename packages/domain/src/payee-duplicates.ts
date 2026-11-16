import { bankAliasKey } from './assignment-rules';

/** Possible duplicate payees (Empfänger) and alias matching. Pure; suggestions only, nothing merges. */

export interface PayeeCandidate {
  id: string;
  name: string;
  bookingCount?: number;
}

export interface PayeeDuplicateGroup {
  /** Members in display order, the suggested main payee first. */
  members: PayeeCandidate[];
  /** Why they were grouped: identical after normalising, or merely similar. */
  reason: 'equal' | 'similar';
}

/** Alias source id meaning "every bank source": aliases written by a payee merge use it. */
export const PAYEE_ALIAS_ALL_SOURCES = '*';

/** Payment-processor / wallet prefixes that are not part of the merchant name. */
const PREFIXES = [
  /^payment\s+for\s+/,
  /^payment\s+to\s+/,
  /^zahlung\s+an\s+/,
  /^zahlung\s+bei\s+/,
  /^zahlung\s+fur\s+/,
  /^paypal\s*\*\s*/,
  /^pp\s*\*\s*/,
  /^sumup\s*\*\s*/,
  /^sq\s*\*\s*/,
];

/** Trailing noise: reference numbers and store numbers. */
const TRAILING = [/[\s#*-]+\d[\d./-]*$/];

/** Small set of generic location tokens that bank lines append to a merchant. */
const LOCATIONS = new Set([
  'wien',
  'graz',
  'linz',
  'salzburg',
  'innsbruck',
  'klagenfurt',
  'vienna',
]);

const stripMarks = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '');

/**
 * Comparison key of a payee name: case, diacritics, punctuation and whitespace are ignored, known
 * prefixes ("Payment for", "Zahlung an", "PAYPAL *") and trailing location/reference tokens go.
 * A name is never reduced to nothing.
 */
export function payeeNameKey(name: string): string {
  let text = stripMarks(bankAliasKey(name)).replace(/ß/g, 'ss');
  text = text
    .replace(/[.,;:!?'"`()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (let again = true; again;) {
    again = false;
    for (const re of PREFIXES) {
      const next = text.replace(re, '').trim();
      if (next !== text && next !== '') {
        text = next;
        again = true;
      }
    }
  }
  for (let again = true; again;) {
    again = false;
    for (const re of TRAILING) {
      const next = text.replace(re, '').trim();
      if (next !== text && next !== '') {
        text = next;
        again = true;
      }
    }
    const words = text.split(' ');
    const last = words[words.length - 1] ?? '';
    if (words.length > 1 && LOCATIONS.has(last)) {
      text = words.slice(0, -1).join(' ');
      again = true;
    }
  }
  return text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Levenshtein distance with an early exit above `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let low = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      row.push(value);
      if (value < low) low = value;
    }
    if (low > max) return max + 1;
    prev = row;
  }
  return prev[b.length]!;
}

/** Allowed edit distance by key length: short names must be identical. */
const tolerance = (length: number): number => (length >= 12 ? 2 : length >= 5 ? 1 : 0);

/**
 * Groups of payees that probably are the same merchant. Equal keys always group; otherwise a small
 * edit distance does (not for short names). Singletons are not returned. The suggested main payee
 * is the one with most bookings, then the shortest name.
 */
export function findPayeeDuplicateGroups(payees: readonly PayeeCandidate[]): PayeeDuplicateGroup[] {
  const items = payees.map((p) => ({ p, key: payeeNameKey(p.name) })).filter((x) => x.key !== '');
  const parent = items.map((_, i) => i);
  const root = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    return r;
  };
  for (let i = 0; i < items.length; i += 1)
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i]!.key;
      const b = items[j]!.key;
      if (a !== b && editDistance(a, b, 2) > tolerance(Math.min(a.length, b.length))) continue;
      const ri = root(i);
      const rj = root(j);
      if (ri !== rj) parent[rj] = ri;
    }
  const byRoot = new Map<number, number[]>();
  items.forEach((_, i) => byRoot.set(root(i), [...(byRoot.get(root(i)) ?? []), i]));
  const order = (x: PayeeCandidate, y: PayeeCandidate) =>
    (y.bookingCount ?? 0) - (x.bookingCount ?? 0) ||
    x.name.length - y.name.length ||
    x.name.localeCompare(y.name, 'de-AT') ||
    x.id.localeCompare(y.id);
  return [...byRoot.values()]
    .filter((idx) => idx.length > 1)
    .map((idx) => {
      const keys = new Set(idx.map((i) => items[i]!.key));
      return {
        members: idx.map((i) => items[i]!.p).sort(order),
        reason: keys.size === 1 ? ('equal' as const) : ('similar' as const),
      };
    })
    .sort((x, y) => order(x.members[0]!, y.members[0]!));
}

/** Alias keys stored for a merged payee name: the exact bank key and the cleaned comparison key. */
export function payeeAliasKeys(name: string): string[] {
  return [...new Set([bankAliasKey(name), payeeNameKey(name)].filter((k) => k !== ''))];
}

export interface PayeeAliasEntry {
  rawKey: string;
  payeeId: string;
}

/**
 * The alias entry for some bank text. `candidates` are the raw counterparty first, then the
 * cleaned label; each is tried by exact bank key and by cleaned comparison key, first hit wins.
 */
export function matchPayeeAlias(
  aliases: readonly PayeeAliasEntry[],
  candidates: readonly string[],
): PayeeAliasEntry | undefined {
  for (const raw of candidates) {
    for (const key of [bankAliasKey(raw), payeeNameKey(raw)]) {
      if (key === '') continue;
      const hit = aliases.find((a) => a.rawKey === key);
      if (hit) return hit;
    }
  }
  return undefined;
}
