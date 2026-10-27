import { sumValuationCents, ValuationLimitError } from '../invest/invest';
import type { ValuationQuality } from '../invest/series';
import { mulDivRound } from '../wealth/int';

/** Already-rounded producer terms, never account-total-minus-holdings residuals. */
export interface NetWorthComponent {
  accountId: string;
  securityId: string | null;
  kind: 'cash' | 'manual' | 'holding';
  valueCents: number | null;
  quality: ValuationQuality;
  missing: 'price' | 'fx' | null;
}

export interface CompositionAccount {
  accountId: string;
  name: string;
  type: string;
  role: string;
  referenceAccountId: string | null;
}

export const ASSET_COMPOSITION_GROUPS = [
  { key: 'cash', label: 'Konten & Bargeld' },
  { key: 'securities', label: 'Wertpapiere' },
  { key: 'depot_cash', label: 'Depot-Bargeld' },
  { key: 'crypto', label: 'Krypto' },
  { key: 'other', label: 'P2P/Sonstiges' },
  { key: 'debt', label: 'Schulden' },
  { key: 'unclassified', label: 'Nicht zugeordnet' },
] as const;
export type AssetCompositionKey = (typeof ASSET_COMPOSITION_GROUPS)[number]['key'];

export interface CompositionAmount {
  /** Null for an unvalued component; the known subtotal remains explicit. */
  valueCents: number | null;
  knownCents: number | null;
  unavailable: 'missing_value' | 'result_limit' | null;
  shareBp: number | null;
}
export interface AssetCompositionGroup extends CompositionAmount {
  key: AssetCompositionKey;
  label: string;
  accounts: Array<CompositionAmount & { accountId: string; name: string }>;
}
export interface AssetCompositionPoint {
  asOf: string;
  pointKind: 'month_end' | 'period_start' | 'as_of';
  unavailable: 'calculation_limit' | null;
  totalCents: number | null;
  knownCents: number | null;
  /** Quality, not just stored coverage: stale/estimated values also suppress shares. */
  complete: boolean;
  groups: AssetCompositionGroup[];
  accounts: Array<CompositionAmount & { accountId: string; name: string }>;
  gaps: Array<{
    accountId: string;
    securityId: string | null;
    quality: ValuationQuality;
    missing: NetWorthComponent['missing'];
  }>;
}

function groupOf(
  component: NetWorthComponent,
  account: CompositionAccount | undefined,
  securityKind: string | undefined,
  referenceCash: ReadonlySet<string>,
): AssetCompositionKey {
  // Unknown values have no proven sign. Keep a gap rather than guessing an asset or debt.
  if (component.valueCents === null) return 'unclassified';
  if (component.valueCents < 0) return 'debt';
  if (component.kind === 'holding') {
    if (securityKind === 'crypto') return 'crypto';
    if (securityKind === 'p2p' || securityKind === 'other') return 'other';
    if (['etf', 'stock', 'fund', 'bond', 'commodity'].includes(securityKind ?? ''))
      return 'securities';
    return 'unclassified';
  }
  if (!account) return 'unclassified';
  if (['brokerage', 'crypto'].includes(account.type) || referenceCash.has(account.accountId))
    return 'depot_cash';
  if (component.kind === 'manual' || account.type === 'receivable' || account.role === 'receivable')
    return 'other';
  if (['checking', 'cash', 'savings', 'credit_card', 'loan', 'other_liability', 'p2p', 'other_asset'].includes(account.type))
    return 'cash';
  return 'unclassified';
}

/** Display projection only; inputs come from the shared valuation and current metadata. */
export function projectAssetComposition(input: {
  asOf: string;
  pointKind: AssetCompositionPoint['pointKind'];
  components: readonly NetWorthComponent[];
  accounts: readonly CompositionAccount[];
  securityKinds: ReadonlyMap<string, string>;
  totalCents: number | null;
  byAccount: Readonly<Record<string, number | null>>;
}): AssetCompositionPoint {
  const metadata = new Map(input.accounts.map((a) => [a.accountId, a]));
  const referenceCash = new Set(input.accounts
    .filter((a) => ['brokerage', 'crypto'].includes(a.type))
    .flatMap((a) => a.referenceAccountId ? [a.referenceAccountId] : []));
  const complete = input.totalCents !== null && input.components.every((c) =>
    c.valueCents !== null && c.quality === 'exact');
  const shares = complete && input.totalCents !== null && input.totalCents >= 10_000;
  let displayLimited = false;
  const amount = (components: readonly NetWorthComponent[]): CompositionAmount => {
    let knownCents: number;
    try {
      knownCents = sumValuationCents(components.flatMap((c) => c.valueCents === null ? [] : [c.valueCents]));
    } catch (error) {
      if (!(error instanceof ValuationLimitError) || error.boundary !== 'result') throw error;
      // A new display group may overflow even though cancelling legacy account/net totals are safe.
      displayLimited = true;
      return { valueCents: null, knownCents: null, shareBp: null, unavailable: 'result_limit' };
    }
    const valueCents = components.some((c) => c.valueCents === null) ? null : knownCents;
    return {
      valueCents, knownCents, unavailable: valueCents === null ? 'missing_value' : null,
      shareBp: shares && valueCents !== null && input.totalCents !== null
        ? mulDivRound(valueCents, 10_000, input.totalCents) : null,
    };
  };
  const grouped = new Map<AssetCompositionKey, NetWorthComponent[]>();
  for (const component of input.components) {
    const key = groupOf(component, metadata.get(component.accountId),
      component.securityId === null ? undefined : input.securityKinds.get(component.securityId), referenceCash);
    const terms = grouped.get(key) ?? [];
    terms.push(component);
    grouped.set(key, terms);
  }
  const groups = ASSET_COMPOSITION_GROUPS.flatMap((group): AssetCompositionGroup[] => {
    const terms = grouped.get(group.key) ?? [];
    if (group.key === 'unclassified' && terms.length === 0) return [];
    const ids = [...new Set(terms.map((c) => c.accountId))];
    return [{ ...group, ...amount(terms), accounts: ids.map((accountId) => ({
      accountId, name: metadata.get(accountId)?.name ?? 'Unbekanntes Konto',
      ...amount(terms.filter((c) => c.accountId === accountId)),
    })) }];
  });
  const accounts = Object.entries(input.byAccount).map(([accountId, whole]): AssetCompositionPoint['accounts'][number] => {
    const terms = input.components.filter((c) => c.accountId === accountId);
    const projected = amount(terms);
    // Preserve the authoritative account value, but never relabel an unpriced position as zero.
    const valueCents = projected.valueCents === null ? null : whole;
    return { accountId, name: metadata.get(accountId)?.name ?? 'Unbekanntes Konto',
      valueCents, knownCents: projected.knownCents,
      unavailable: valueCents === null ? projected.unavailable ?? 'missing_value' : null,
      shareBp: shares && valueCents !== null && input.totalCents !== null
        ? mulDivRound(valueCents, 10_000, input.totalCents) : null };
  });
  const knownCents = amount(input.components).knownCents;
  const totalCents = input.components.some((c) => c.valueCents === null) ? null : input.totalCents;
  if (displayLimited) {
    for (const group of groups) {
      group.shareBp = null;
      for (const account of group.accounts) account.shareBp = null;
    }
    for (const account of accounts) account.shareBp = null;
  }
  return { asOf: input.asOf, pointKind: input.pointKind, totalCents, knownCents,
    complete: complete && !displayLimited,
    unavailable: displayLimited ? 'calculation_limit' : null, groups, accounts, gaps: input.components
      .filter((c) => c.valueCents === null || c.quality !== 'exact')
      .map(({ accountId, securityId, quality, missing }) => ({ accountId, securityId, quality, missing })) };
}
