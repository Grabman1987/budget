import { addDays, addMonths, lastDayOfMonth, monthOf } from '../date';

/**
 * Structure of the net worth by account type (report 3.3 Vermögensverläufe): what each type adds
 * above and below the zero line on a day. Port of `structure()` in `design/prototype/reports-core.js`
 * for the app's account types. Pure: the per-account values come from `netWorthAsOf`, the same
 * function the Vermögen pages use, so the types always add up to the net worth.
 */

export interface StructureGroup {
  /** Account type key (`account.type`). */
  key: string;
  label: string;
  /** Liabilities: shown as debt, not part of the asset shares. */
  liability: boolean;
}

/** Display order: assets from the most invested to the most liquid, then the liabilities. */
export const STRUCTURE_GROUPS: ReadonlyArray<StructureGroup> = [
  { key: 'brokerage', label: 'Depot', liability: false },
  { key: 'crypto', label: 'Krypto', liability: false },
  { key: 'p2p', label: 'P2P-Kredite', liability: false },
  { key: 'receivable', label: 'Forderungen', liability: false },
  { key: 'other_asset', label: 'Sonstiges Vermögen', liability: false },
  { key: 'savings', label: 'Tagesgeld', liability: false },
  { key: 'checking', label: 'Giro', liability: false },
  { key: 'cash', label: 'Bargeld', liability: false },
  { key: 'loan', label: 'Kredit', liability: true },
  { key: 'credit_card', label: 'Kreditkarte', liability: true },
  { key: 'other_liability', label: 'Sonstige Verbindlichkeit', liability: true },
];

/** What one type holds on a day: positive balances above zero, negative ones below (negative). */
export interface StructureValue {
  assetsCents: number;
  debtsCents: number;
}

export type Structure = Record<string, StructureValue>;

/** Sum of the account values per type; unknown types are kept under their own key. */
export function structureOf(
  byAccount: Readonly<Record<string, number>>,
  typeOf: (accountId: string) => string | undefined,
): Structure {
  const out: Structure = {};
  for (const [id, value] of Object.entries(byAccount)) {
    const key = typeOf(id);
    if (key === undefined) throw new RangeError(`Account ${id} has no type`);
    const row = (out[key] ??= { assetsCents: 0, debtsCents: 0 });
    if (value >= 0) row.assetsCents += value;
    else row.debtsCents += value;
  }
  return out;
}

/** Total of a structure: equals the net worth of the same day. */
export const structureTotal = (s: Structure): number =>
  Object.values(s).reduce((a, v) => a + v.assetsCents + v.debtsCents, 0);

export interface StructureRow {
  key: string;
  label: string;
  liability: boolean;
  startCents: number;
  nowCents: number;
  deltaCents: number;
  /** Share of the type in all asset balances today, in basis points; `null` for liabilities. */
  shareBp: number | null;
}

const net = (s: Structure, key: string): number =>
  (s[key]?.assetsCents ?? 0) + (s[key]?.debtsCents ?? 0);

/**
 * The structure table: per type its value at the start and now, the change and the share in the
 * assets today. Types without any balance on either day are left out.
 */
export function structureRows(start: Structure, now: Structure): StructureRow[] {
  const known = new Set(STRUCTURE_GROUPS.map((g) => g.key));
  const groups = [
    ...STRUCTURE_GROUPS,
    ...[...new Set([...Object.keys(start), ...Object.keys(now)])]
      .filter((k) => !known.has(k))
      .sort()
      .map((key): StructureGroup => ({ key, label: key, liability: false })),
  ];
  const assetsNow = Object.values(now).reduce((a, v) => a + v.assetsCents, 0);
  return groups
    .filter((g) => net(start, g.key) !== 0 || net(now, g.key) !== 0)
    .map((g) => {
      const n = net(now, g.key);
      return {
        key: g.key,
        label: g.label,
        liability: g.liability,
        startCents: net(start, g.key),
        nowCents: n,
        deltaCents: n - net(start, g.key),
        shareBp:
          g.liability || assetsNow <= 0
            ? null
            : Math.round(((now[g.key]?.assetsCents ?? 0) * 10_000) / assetsNow),
      };
    });
}

/**
 * The days at which the structure is read: `from`, then every 7 days (short periods) or every month
 * end (longer ones), and always `to`. Strictly increasing, no day twice.
 */
export function historyDays(from: string, to: string, unit: 'week' | 'month'): string[] {
  const out = [from];
  const push = (day: string) => {
    if (day > (out[out.length - 1] as string) && day <= to) out.push(day);
  };
  if (unit === 'week') {
    for (let d = addDays(from, 7); d < to; d = addDays(d, 7)) push(d);
  } else {
    for (let m = monthOf(from); m <= monthOf(to); m = addMonths(m, 1)) push(lastDayOfMonth(m));
  }
  push(to);
  return out;
}
