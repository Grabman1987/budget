import type { CostMethod } from './cost';

/** Input must come from a documented replay at the transfer boundary, never inferred deliveries. */
export interface TransferLotFragment {
  /** Current fragment handle, not an assertion that this lot followed one transfer path. */
  readonly fragmentId: string;
  readonly acquisitionId: string;
  readonly acquiredOn: string;
  /** Explicit stable acquisition order; this preview never chooses a same-day tie winner. */
  readonly acquisitionOrder: number;
  readonly unitsE8: number;
  readonly basisCents: number | null;
  /** A single linear path only. Absent for a reunited lot with multiple contributing paths. */
  readonly transferPairIds?: readonly string[];
  /** Immutable snapshots of the records from which the current economic fragment was derived. */
  readonly derivation?: TransferLotDerivation;
}
export type TransferLotDerivation =
  | { readonly kind: 'reunited'; readonly contributingFragments: readonly TransferLotFragment[] }
  | { readonly kind: 'pooled-basis'; readonly date: string; readonly source: TransferLotFragment }
  | { readonly kind: 'allocated'; readonly date: string; readonly source: TransferLotFragment }
  | { readonly kind: 'sold-remainder'; readonly saleId: string; readonly date: string;
      readonly source: TransferLotFragment }
  | { readonly kind: 'unit-adjusted'; readonly splitId: string; readonly date: string;
      readonly accountId: string; readonly deltaUnitsE8: number; readonly sourceIndex: number;
      readonly splitSources: readonly TransferLotFragment[]; readonly source: TransferLotFragment }
  | { readonly kind: 'received'; readonly pairId: string; readonly outTradeId: string;
      readonly inTradeId: string; readonly date: string; readonly sourceAccountId: string;
      readonly destinationAccountId: string; readonly source: TransferLotFragment };
/** Analytical average ancestry. Split ratios never denote physical E8 trades or lot cents. */
export type AveragePoolProvenance =
  | { readonly kind: 'acquisition'; readonly securityId: string; readonly acquisitionId: string; readonly acquiredOn: string;
      readonly acquisitionOrder: number; readonly accountId: string; readonly unitsE8: number }
  | { readonly kind: 'documented-fragment'; readonly securityId: string; readonly accountId: string;
      readonly fragment: TransferLotFragment }
  | { readonly kind: 'split'; readonly date: string; readonly source: AveragePoolProvenance;
      readonly numerator: number; readonly denominator: number; readonly saleId?: string }
  | { readonly kind: 'unit-adjusted'; readonly date: string; readonly source: AveragePoolProvenance;
      readonly securityId: string; readonly accountId: string; readonly splitId: string;
      readonly beforeUnitsE8: number; readonly afterUnitsE8: number }
  | { readonly kind: 'received'; readonly date: string; readonly securityId: string;
      readonly source: AveragePoolProvenance;
      readonly pairId: string; readonly outTradeId: string; readonly inTradeId: string;
      readonly sourceAccountId: string; readonly destinationAccountId: string }
  | { readonly kind: 'merged'; readonly date: string;
      readonly sources: readonly AveragePoolProvenance[] };
export interface TransferPoolEvidence {
  accountId: string;
  securityId: string;
  currency: string;
  asOf: string;
  boundary: 'immediately-before-transfer' | 'unestablished';
  lineage: 'documented' | 'unknown' | 'legacy-ambiguous';
  locked: boolean;
  unsupportedCorporateAction: boolean;
  fragments: readonly TransferLotFragment[];
  /** Alternative to fragments for a documented average pool with fractional ancestry. */
  averagePool?: { readonly unitsE8: number; readonly provenance: AveragePoolProvenance };
  /**
   * Moving-average basis belongs to the pool. Null fragment bases mean unit provenance only;
   * numeric fragment bases claim current allocated cents and must sum to this declared pool.
   */
  poolBasisCents?: number | null;
}
export interface KnownBasisTransferInput {
  date: string;
  unitsE8: number;
  method: CostMethod;
  source: TransferPoolEvidence;
  destination: TransferPoolEvidence;
}
/** FIFO economic fragments; average ancestry is returned separately as a pool graph. */
export type AllocatedTransferFragment = TransferLotFragment;
export type SecurityTransferPreviewError =
  | 'invalid_input' | 'unsupported_currency' | 'unknown_basis' | 'ambiguous_lineage'
  | 'unestablished_boundary' | 'locked' | 'unsupported_corporate_action'
  | 'insufficient_units' | 'nonrepresentable_allocation' | 'basis_evidence_conflict' | 'provenance_limit';
export type SecurityTransferPreview =
  | { available: false; reason: SecurityTransferPreviewError; message: string }
  | {
      available: true;
      method: CostMethod;
      date: string;
      unitsE8: number;
      transferredBasisCents: number;
      basisAllocation: 'fifo-lots' | 'average-pool';
      moved: AllocatedTransferFragment[];
      sourceRemaining: AllocatedTransferFragment[];
      destinationExisting: AllocatedTransferFragment[];
      /** Exact average ancestry, separate from integer holdings and pooled cents. */
      movedAverageProvenance?: AveragePoolProvenance;
      sourceRemainingAverageProvenance?: AveragePoolProvenance;
      destinationExistingAverageProvenance?: AveragePoolProvenance;
      sourceRemainingBasisCents: number;
      destinationBasisAfterCents: number;
      cashDeltaCents: 0;
      realizedGainDeltaCents: 0;
      /** Computational allocation only; no paired trades or authoritative lineage are persisted. */
      applyAvailable: false;
    };
const MESSAGES: Record<SecurityTransferPreviewError, string> = {
  basis_evidence_conflict: 'Poolbasis und die als aktuell belegten Fragmentkosten widersprechen einander.',
  invalid_input: 'Konten, Wertpapier, Datum, Stückzahl oder belegte Fragmente prüfen.',
  unsupported_currency: 'Diese Vorschau unterstützt nur eine durchgehend belegte Kostenbasis in EUR.',
  unknown_basis: 'Die ursprüngliche Kostenbasis ist nicht vollständig belegt. Bitte manuell prüfen.',
  ambiguous_lineage: 'Herkunft oder Reihenfolge der Anschaffungen ist nicht eindeutig belegt.',
  unestablished_boundary: 'Der belegte Bestand unmittelbar vor diesem Übertrag fehlt.',
  locked: 'Ein beteiligter Bestand ist gesperrt. Zuerst die bestehende Sperre prüfen.',
  unsupported_corporate_action: 'Dieser Bestand enthält eine hier nicht unterstützte Kapitalmaßnahme.',
  insufficient_units: 'Am belegten Übertragszeitpunkt sind nicht genügend Stücke vorhanden.',
  nonrepresentable_allocation: 'Die Stückzahlanteile sind in E8-Einheiten nicht exakt darstellbar.',
  provenance_limit: 'Die exakt belegte Anschaffungsherkunft überschreitet die Rechengrenze.',
};
const unavailable = (reason: SecurityTransferPreviewError): SecurityTransferPreview =>
  ({ available: false, reason, message: MESSAGES[reason] });
const safe = (value: number) => Number.isSafeInteger(value) && value >= 0;
const identity = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128;
const validDay = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
};
const limit = BigInt(Number.MAX_SAFE_INTEGER);
const ordered = (fragments: readonly TransferLotFragment[]) => [...fragments].sort((a, b) =>
  a.acquiredOn.localeCompare(b.acquiredOn) || a.acquisitionOrder - b.acquisitionOrder);

/** Canonical FIFO split allocation, with an exactness guard on Math.round's integer result. */
export function fifoSplitLotUnits(lots: readonly TransferLotFragment[], deltaUnitsE8: number): number[] | null {
  if (!lots.length || lots.length > 2000 || !Number.isSafeInteger(deltaUnitsE8) || deltaUnitsE8 === 0 ||
      lots.some((lot) => !lot || !safe(lot.unitsE8) || lot.unitsE8 === 0)) return null;
  const before = lots.reduce((sum, lot) => sum + BigInt(lot.unitsE8), 0n);
  const after = before + BigInt(deltaUnitsE8);
  if (before > limit || after <= 0n || after > limit) return null;
  const outputs: number[] = [];
  let given = 0n;
  for (let i = 0; i < lots.length; i++) {
    const source = lots[i]!;
    let extra: bigint;
    if (i === lots.length - 1) extra = BigInt(deltaUnitsE8) - given;
    else {
      const numerator = BigInt(deltaUnitsE8) * BigInt(source.unitsE8);
      // floor(x + 1/2), including negative half-ties, exactly matches JS Math.round.
      const shifted = 2n * numerator + before;
      const divisor = 2n * before;
      extra = shifted >= 0n ? shifted / divisor : -((-shifted + divisor - 1n) / divisor);
      if (extra !== BigInt(Math.round((deltaUnitsE8 * source.unitsE8) / Number(before))))
        return null;
    }
    const units = BigInt(source.unitsE8) + extra;
    if (units <= 0n || units > limit) return null;
    outputs.push(Number(units));
    given += extra;
  }
  return outputs.reduce((sum, units) => sum + BigInt(units), 0n) === after ? outputs : null;
}

/** One current FIFO lot per original acquisition, retaining every branch as a snapshot. */
export function normalizeFifoAcquisitionFragments(fragments: readonly TransferLotFragment[]): TransferLotFragment[] {
  const groups = new Map<string, TransferLotFragment[]>();
  for (const fragment of fragments) {
    const group = groups.get(fragment.acquisitionId) ?? [];
    group.push(fragment);
    groups.set(fragment.acquisitionId, group);
  }
  return ordered([...groups.values()].map((group) => {
    if (group.length === 1) return group[0]!;
    const first = group[0]!;
    return {
      fragmentId: first.fragmentId, acquisitionId: first.acquisitionId,
      acquiredOn: first.acquiredOn, acquisitionOrder: first.acquisitionOrder,
      unitsE8: Number(group.reduce((sum, fragment) => sum + BigInt(fragment.unitsE8), 0n)),
      basisCents: Number(group.reduce((sum, fragment) => sum + BigInt(fragment.basisCents!), 0n)),
      // The handle is only a handle: no branch is promoted to the transfer path of the group.
      derivation: { kind: 'reunited' as const, contributingFragments: [...group] },
    };
  }));
}

/** Check caller-supplied ancestry without treating an aggregate as one invented path. */
function validDerivation(root: TransferLotFragment, method: CostMethod, asOf: string, accountId: string,
  work = { remaining: 1000000 }, adjustments = new Map<string, string>()): boolean {
  const active = new Set<TransferLotFragment>(), complete = new Set<TransferLotFragment>();
  const currentAccount = new Map<TransferLotFragment, string | undefined>();
  const latestDate = new Map<TransferLotFragment, string>();
  const stack: { fragment: TransferLotFragment; leaving: boolean }[] = [{ fragment: root, leaving: false }];
  while (stack.length) {
    const { fragment, leaving } = stack.pop()!;
    if (leaving) {
      const derivation = fragment.derivation;
      if (derivation?.kind === 'received') {
        const sourceAccount = currentAccount.get(derivation.source);
        if ((sourceAccount !== undefined && sourceAccount !== derivation.sourceAccountId) ||
            derivation.date < latestDate.get(derivation.source)!) return false;
        currentAccount.set(fragment, derivation.destinationAccountId);
      } else if (derivation?.kind === 'unit-adjusted') {
        const sourceAccount = currentAccount.get(derivation.source);
        if (sourceAccount !== undefined && sourceAccount !== derivation.accountId) return false;
        currentAccount.set(fragment, derivation.accountId);
      } else if (derivation?.kind === 'reunited') {
        const accounts = new Set(derivation.contributingFragments.map((item) => currentAccount.get(item))
          .filter((account): account is string => account !== undefined));
        if (accounts.size > 1) return false;
        currentAccount.set(fragment, accounts.values().next().value);
        latestDate.set(fragment, derivation.contributingFragments.reduce((latest, item) =>
          latest > latestDate.get(item)! ? latest : latestDate.get(item)!, fragment.acquiredOn));
      } else if (derivation) {
        if (derivation.date < latestDate.get(derivation.source)!) return false;
        currentAccount.set(fragment, currentAccount.get(derivation.source));
      }
      if (derivation?.kind !== 'reunited') latestDate.set(fragment, derivation?.date ?? fragment.acquiredOn);
      active.delete(fragment); complete.add(fragment); continue;
    }
    if (active.has(fragment)) return false;
    if (complete.has(fragment)) continue;
    if (active.size + complete.size > 12000 || !identity(fragment.fragmentId) ||
        fragment.acquisitionId !== root.acquisitionId || fragment.acquiredOn !== root.acquiredOn ||
        fragment.acquisitionOrder !== root.acquisitionOrder || !safe(fragment.unitsE8) || fragment.unitsE8 === 0 ||
        (fragment.basisCents === null ? method === 'fifo' : !safe(fragment.basisCents)) ||
        (fragment.transferPairIds !== undefined &&
          (!Array.isArray(fragment.transferPairIds) || fragment.transferPairIds.length > 1000 ||
            fragment.transferPairIds.some((id) => !identity(id)) ||
            new Set(fragment.transferPairIds).size !== fragment.transferPairIds.length))) return false;
    active.add(fragment);
    stack.push({ fragment, leaving: true });
    const derivation = fragment.derivation;
    if (!derivation) continue;
    if (derivation.kind === 'reunited') {
      if (fragment.transferPairIds !== undefined || !Array.isArray(derivation.contributingFragments) ||
          derivation.contributingFragments.length < 2 || derivation.contributingFragments.length > 2000 ||
          derivation.contributingFragments.some((item) => !item || !safe(item.unitsE8) ||
            (method === 'fifo' && !safe(item.basisCents as number))) ||
          new Set(derivation.contributingFragments.map((item) => item.fragmentId)).size !==
            derivation.contributingFragments.length ||
          derivation.contributingFragments.reduce((sum, item) => sum + BigInt(item.unitsE8), 0n) !== BigInt(fragment.unitsE8) ||
          (method === 'fifo' && derivation.contributingFragments.reduce((sum, item) => sum + BigInt(item.basisCents!), 0n) !== BigInt(fragment.basisCents!)))
        return false;
      for (const item of derivation.contributingFragments)
        stack.push({ fragment: item, leaving: false });
    } else if (derivation.kind === 'pooled-basis' || derivation.kind === 'allocated' ||
        derivation.kind === 'sold-remainder' || derivation.kind === 'received' ||
        derivation.kind === 'unit-adjusted') {
      if (!derivation.source ||
          !validDay(derivation.date) || derivation.date < fragment.acquiredOn || derivation.date > asOf ||
          (derivation.kind === 'sold-remainder' && !identity(derivation.saleId)) ||
          (derivation.kind === 'unit-adjusted' &&
            (!identity(derivation.splitId) || !identity(derivation.accountId) ||
              !Number.isSafeInteger(derivation.deltaUnitsE8) || derivation.deltaUnitsE8 === 0 ||
              !Array.isArray(derivation.splitSources) || derivation.splitSources.length > 2000 ||
              !Number.isSafeInteger(derivation.sourceIndex))) ||
          (derivation.kind === 'received' &&
            (!identity(derivation.pairId) || !identity(derivation.outTradeId) || !identity(derivation.inTradeId) ||
              derivation.outTradeId === derivation.inTradeId || !identity(derivation.sourceAccountId) ||
              !identity(derivation.destinationAccountId) ||
              derivation.sourceAccountId === derivation.destinationAccountId)))
        return false;
      const previous = derivation.source;
      if (derivation.kind === 'unit-adjusted') {
        const sources = derivation.splitSources;
        work.remaining -= sources.length;
        if (work.remaining < 0) return false;
        const outputs = fifoSplitLotUnits(sources, derivation.deltaUnitsE8);
        if (!outputs) return false;
        const sorted = ordered(sources);
        if (derivation.sourceIndex < 0 || derivation.sourceIndex >= sources.length ||
            sources[derivation.sourceIndex] !== previous ||
            fragment.unitsE8 !== outputs[derivation.sourceIndex] ||
            fragment.basisCents !== previous.basisCents ||
            new Set(sources.map((item) => item.acquisitionId)).size !== sources.length ||
            new Set(sources.map((item) => `${item.acquiredOn}:${item.acquisitionOrder}`)).size !== sources.length ||
            sources.some((item, index) => !item || !identity(item.acquisitionId) ||
              !validDay(item.acquiredOn) || item.acquiredOn > derivation.date ||
              !safe(item.acquisitionOrder) || !safe(item.basisCents as number) ||
              sorted[index] !== item || fragmentLatestDate(item, work) > derivation.date))
          return false;
        const signature = JSON.stringify([derivation.date, derivation.accountId,
          derivation.deltaUnitsE8, sources.map((item) => [item.fragmentId,
            item.acquisitionId, item.acquiredOn, item.acquisitionOrder,
            item.unitsE8, item.basisCents])]);
        if (adjustments.has(derivation.splitId) && adjustments.get(derivation.splitId) !== signature)
          return false;
        adjustments.set(derivation.splitId, signature);
      }
      if ((derivation.kind === 'received' && (fragment.unitsE8 !== previous.unitsE8 || fragment.basisCents !== previous.basisCents)) ||
          (derivation.kind === 'pooled-basis' && (method !== 'average' || fragment.unitsE8 !== previous.unitsE8 ||
            fragment.basisCents !== null || previous.basisCents === null)) ||
          ((derivation.kind === 'allocated' || derivation.kind === 'sold-remainder') &&
            fragment.unitsE8 >= previous.unitsE8) ||
          (fragment.basisCents !== null && previous.basisCents !== null && fragment.basisCents > previous.basisCents))
        return false;
      const path = derivation.kind === 'received'
        ? previous.transferPairIds === undefined ? undefined : [...previous.transferPairIds, derivation.pairId]
        : previous.transferPairIds;
      if ((path === undefined) !== (fragment.transferPairIds === undefined) ||
          (path !== undefined && (path.length !== fragment.transferPairIds?.length ||
            path.some((pairId, index) => pairId !== fragment.transferPairIds?.[index])))) return false;
      stack.push({ fragment: previous, leaving: false });
    } else return false;
  }
  const establishedAccount = currentAccount.get(root);
  return establishedAccount === undefined || establishedAccount === accountId;
}
function hasTransferAncestry(root: TransferLotFragment): boolean {
  const pending = [root], seen = new Set<TransferLotFragment>();
  while (pending.length) {
    const fragment = pending.pop()!;
    if (seen.has(fragment)) continue;
    seen.add(fragment);
    if (fragment.transferPairIds?.length || fragment.derivation?.kind === 'received') return true;
    const derivation = fragment.derivation;
    if (derivation?.kind === 'reunited') pending.push(...derivation.contributingFragments);
    else if (derivation) pending.push(derivation.source);
  }
  return false;
}
function fragmentLatestDate(root: TransferLotFragment, work?: { remaining: number }): string {
  let latest = root.acquiredOn;
  const pending = [root], seen = new Set<TransferLotFragment>();
  while (pending.length) {
    const fragment = pending.pop()!;
    if (work && --work.remaining < 0) return '\uffff';
    if (!fragment || typeof fragment !== 'object') return '\uffff';
    if (seen.has(fragment)) continue;
    seen.add(fragment);
    const derivation = fragment.derivation;
    if (derivation?.kind === 'reunited') {
      if (!Array.isArray(derivation.contributingFragments)) return '\uffff';
      pending.push(...derivation.contributingFragments);
    }
    else if (derivation) {
      if (!derivation.source || !validDay(derivation.date)) return '\uffff';
      if (derivation.date > latest) latest = derivation.date;
      pending.push(derivation.source);
    }
  }
  return latest;
}

type ExactMass = { numerator: bigint; denominator: bigint; accountId: string; latestDate: string };
type RationalShare = { numerator: bigint; denominator: bigint };
type ValidatedMass = ExactMass & { shares: Map<string, RationalShare> };
const provenanceBits = (value: bigint) => value.toString(2).length <= 4096;
function commonDivisor(a: bigint, b: bigint): bigint {
  while (b) { const next = a % b; a = b; b = next; }
  return a;
}
function exactMass(numerator: bigint, denominator: bigint, accountId: string, latestDate: string): ExactMass | null {
  if (numerator <= 0n || denominator <= 0n) return null;
  const divisor = commonDivisor(numerator, denominator);
  const reducedNumerator = numerator / divisor, reducedDenominator = denominator / divisor;
  return provenanceBits(reducedNumerator) && provenanceBits(reducedDenominator)
    ? { numerator: reducedNumerator, denominator: reducedDenominator, accountId, latestDate } : null;
}
function addMass(a: ExactMass, b: ExactMass, date: string): ExactMass | null {
  const divisor = commonDivisor(a.denominator, b.denominator);
  return exactMass(a.numerator * (b.denominator / divisor) + b.numerator * (a.denominator / divisor),
    a.denominator * (b.denominator / divisor), a.accountId, date);
}
function reducedShare(numerator: bigint, denominator: bigint): RationalShare | null {
  if (numerator <= 0n || denominator <= 0n) return null;
  const divisor = commonDivisor(numerator, denominator);
  const reducedNumerator = numerator / divisor, reducedDenominator = denominator / divisor;
  return provenanceBits(reducedNumerator) && provenanceBits(reducedDenominator)
    ? { numerator: reducedNumerator, denominator: reducedDenominator } : null;
}
function sumShares(a: RationalShare, b: RationalShare): RationalShare | null {
  const divisor = commonDivisor(a.denominator, b.denominator);
  return reducedShare(a.numerator * (b.denominator / divisor) +
    b.numerator * (a.denominator / divisor), a.denominator * (b.denominator / divisor));
}
/** Validate a bounded DAG, not a rounded allocation of its acquisition leaves. */
export function validateAverageProvenance(root: AveragePoolProvenance, unitsE8: number, accountId: string,
  securityId: string, asOf: string, acquisitions = new Map<string, string>(),
  positions = new Map<string, string>(), acquisitionFacts = new Map<string, string>(),
  fragmentHandles = new Map<string, TransferLotFragment>(),
  acquisitionForms = new Map<string, 'acquisition' | 'documented-fragment'>(),
  ownership = new Map<string, RationalShare>(),
  receipts = new Map<string, string>(), legs = new Map<string, string>(),
  sales = new Map<string, string>(),
  adjustments = new Map<string, string>()): 'valid' | 'invalid' | 'limit' {
  if (!root || !safe(unitsE8) || unitsE8 === 0 || !identity(accountId) ||
      !identity(securityId) || !validDay(asOf)) return 'invalid';
  const active = new Set<AveragePoolProvenance>();
  const completed = new Map<AveragePoolProvenance, ValidatedMass>();
  const stack: { node: AveragePoolProvenance; leaving: boolean }[] = [{ node: root, leaving: false }];
  let edges = 0;
  let shareWork = 0;
  while (stack.length) {
    const { node, leaving } = stack.pop()!;
    if (!node || typeof node !== 'object') return 'invalid';
    if (leaving) {
      let mass: ExactMass | null = null;
      let shares: Map<string, RationalShare>;
      if (node.kind === 'acquisition') {
        mass = exactMass(BigInt(node.unitsE8), 1n, node.accountId, node.acquiredOn);
        shares = new Map([[`acquisition:${node.acquisitionId}`, { numerator: 1n, denominator: 1n }]]);
      } else if (node.kind === 'documented-fragment') {
        mass = exactMass(BigInt(node.fragment.unitsE8), 1n, node.accountId, fragmentLatestDate(node.fragment));
        shares = new Map([[`fragment:${node.fragment.fragmentId}`, { numerator: 1n, denominator: 1n }]]);
      } else if (node.kind === 'split') {
        const source = completed.get(node.source)!;
        if (node.date < source.latestDate) return 'invalid';
        mass = exactMass(source.numerator * BigInt(node.numerator),
          source.denominator * BigInt(node.denominator), source.accountId, node.date);
        if (node.saleId) {
          if (!mass || source.denominator !== 1n || source.numerator > limit ||
              mass.denominator !== 1n || mass.numerator > limit) return 'invalid';
          shareWork += source.shares.size;
          if (shareWork > 1000000) return 'limit';
          const signature = JSON.stringify([node.date, source.accountId,
            source.numerator.toString(), mass.numerator.toString(),
            node.numerator, node.denominator,
            [...source.shares].sort(([a], [b]) => a.localeCompare(b))
              .map(([key, share]) => [key, share.numerator.toString(), share.denominator.toString()])]);
          if (sales.has(node.saleId) && sales.get(node.saleId) !== signature) return 'invalid';
          sales.set(node.saleId, signature);
        }
        shares = new Map();
        shareWork += source.shares.size;
        if (shareWork > 1000000) return 'limit';
        for (const [key, share] of source.shares) {
          const reduced = reducedShare(share.numerator * BigInt(node.numerator),
            share.denominator * BigInt(node.denominator));
          if (!reduced) return 'limit';
          shares.set(key, reduced);
        }
        if (node.saleId) {
          const key = `sale:${node.saleId}`;
          if (shares.has(key)) return 'invalid';
          shares.set(key, { numerator: 1n, denominator: 1n });
        }
      } else if (node.kind === 'unit-adjusted') {
        const source = completed.get(node.source)!;
        if (source.accountId !== node.accountId || node.date < source.latestDate ||
            source.denominator !== 1n || source.numerator !== BigInt(node.beforeUnitsE8))
          return 'invalid';
        mass = exactMass(BigInt(node.afterUnitsE8), 1n, node.accountId, node.date);
        if (!mass) return 'limit';
        shareWork += source.shares.size;
        if (shareWork > 1000000) return 'limit';
        const signature = JSON.stringify([node.date, node.securityId, node.accountId,
          node.beforeUnitsE8, node.afterUnitsE8,
          [...source.shares].sort(([a], [b]) => a.localeCompare(b))
            .map(([key, share]) => [key, share.numerator.toString(), share.denominator.toString()])]);
        if (adjustments.has(node.splitId) && adjustments.get(node.splitId) !== signature)
          return 'invalid';
        adjustments.set(node.splitId, signature);
        const key = `unit-adjustment:${node.splitId}`;
        if (source.shares.has(key)) return 'invalid';
        shares = new Map(source.shares);
        shares.set(key, { numerator: 1n, denominator: 1n });
      } else if (node.kind === 'received') {
        const source = completed.get(node.source)!;
        if (source.accountId !== node.sourceAccountId || node.date < source.latestDate) return 'invalid';
        if (source.denominator !== 1n || source.numerator > limit) return 'invalid';
        shareWork += source.shares.size;
        if (shareWork > 1000000) return 'limit';
        const signature = JSON.stringify([node.outTradeId, node.inTradeId, node.date,
          node.sourceAccountId, node.destinationAccountId, node.securityId,
          source.numerator.toString(), [...source.shares].sort(([a], [b]) => a.localeCompare(b))
            .map(([key, share]) => [key, share.numerator.toString(), share.denominator.toString()])]);
        if ((receipts.has(node.pairId) && receipts.get(node.pairId) !== signature) ||
            (legs.has(node.outTradeId) && legs.get(node.outTradeId) !== node.pairId) ||
            (legs.has(node.inTradeId) && legs.get(node.inTradeId) !== node.pairId)) return 'invalid';
        receipts.set(node.pairId, signature);
        legs.set(node.outTradeId, node.pairId); legs.set(node.inTradeId, node.pairId);
        mass = { ...source, accountId: node.destinationAccountId, latestDate: node.date };
        const key = `receipt:${node.pairId}`;
        if (source.shares.has(key)) return 'invalid';
        shares = new Map(source.shares);
        shares.set(key, { numerator: 1n, denominator: 1n });
      } else if (node.kind === 'merged') {
        shares = new Map();
        for (const item of node.sources) {
          const source = completed.get(item)!;
          if (node.date < source.latestDate || (mass && mass.accountId !== source.accountId)) return 'invalid';
          mass = mass ? addMass(mass, source, node.date) : { ...source, latestDate: node.date };
          if (!mass) return 'limit';
          shareWork += source.shares.size;
          if (shareWork > 1000000) return 'limit';
          for (const [key, share] of source.shares) {
            const prior = shares.get(key);
            const combined = prior ? sumShares(prior, share) : share;
            if (!combined) return 'limit';
            if (combined.numerator > combined.denominator) return 'invalid';
            shares.set(key, combined);
          }
        }
      } else return 'invalid';
      if (!mass) return 'limit';
      completed.set(node, { ...mass, shares }); active.delete(node); continue;
    }
    if (active.has(node)) return 'invalid';
    if (completed.has(node)) continue;
    if (active.size + completed.size >= 12000 || edges > 12000) return 'limit';
    let sources: readonly AveragePoolProvenance[] = [];
    if (node.kind === 'acquisition') {
      if (!identity(node.acquisitionId) || !validDay(node.acquiredOn) || node.acquiredOn > asOf ||
          !safe(node.acquisitionOrder) || !safe(node.unitsE8) || node.unitsE8 === 0 ||
          !identity(node.accountId) || node.securityId !== securityId) return 'invalid';
      const position = `${node.acquiredOn}:${node.acquisitionOrder}`;
      const previous = acquisitions.get(node.acquisitionId);
      if ((previous !== undefined && previous !== position) ||
          (positions.has(position) && positions.get(position) !== node.acquisitionId)) return 'invalid';
      if (acquisitionForms.has(node.acquisitionId) &&
          acquisitionForms.get(node.acquisitionId) !== 'acquisition') return 'invalid';
      const facts = JSON.stringify([node.acquiredOn, node.acquisitionOrder,
        node.accountId, node.unitsE8]);
      if (acquisitionFacts.has(node.acquisitionId) && acquisitionFacts.get(node.acquisitionId) !== facts)
        return 'invalid';
      acquisitions.set(node.acquisitionId, position);
      positions.set(position, node.acquisitionId);
      acquisitionFacts.set(node.acquisitionId, facts);
      acquisitionForms.set(node.acquisitionId, 'acquisition');
    } else if (node.kind === 'documented-fragment') {
      const fragment = node.fragment;
      if (!identity(node.accountId) || node.securityId !== securityId || !fragment ||
          !identity(fragment.acquisitionId) || !validDay(fragment.acquiredOn) || fragment.acquiredOn > asOf ||
          !safe(fragment.acquisitionOrder) || !safe(fragment.unitsE8) || fragment.unitsE8 === 0 ||
          (fragment.basisCents !== null && !safe(fragment.basisCents)) ||
          !validDerivation(fragment, 'average', asOf, node.accountId)) return 'invalid';
      const position = `${fragment.acquiredOn}:${fragment.acquisitionOrder}`;
      const previous = acquisitions.get(fragment.acquisitionId);
      if ((previous !== undefined && previous !== position) ||
          (positions.has(position) && positions.get(position) !== fragment.acquisitionId)) return 'invalid';
      if (acquisitionForms.has(fragment.acquisitionId) &&
          acquisitionForms.get(fragment.acquisitionId) !== 'documented-fragment') return 'invalid';
      if (fragmentHandles.has(fragment.fragmentId) && fragmentHandles.get(fragment.fragmentId) !== fragment)
        return 'invalid';
      acquisitions.set(fragment.acquisitionId, position);
      positions.set(position, fragment.acquisitionId);
      fragmentHandles.set(fragment.fragmentId, fragment);
      acquisitionForms.set(fragment.acquisitionId, 'documented-fragment');
    } else if (node.kind === 'split') {
      if (!validDay(node.date) || node.date > asOf || !safe(node.numerator) ||
          !safe(node.denominator) || node.numerator === 0 || node.numerator >= node.denominator ||
          (node.saleId !== undefined && !identity(node.saleId)) ||
          commonDivisor(BigInt(node.numerator), BigInt(node.denominator)) !== 1n) return 'invalid';
      sources = [node.source];
    } else if (node.kind === 'unit-adjusted') {
      if (!validDay(node.date) || node.date > asOf || node.securityId !== securityId ||
          !identity(node.accountId) || !identity(node.splitId) ||
          !safe(node.beforeUnitsE8) || node.beforeUnitsE8 === 0 ||
          !safe(node.afterUnitsE8) || node.afterUnitsE8 === 0 ||
          node.afterUnitsE8 === node.beforeUnitsE8) return 'invalid';
      sources = [node.source];
    } else if (node.kind === 'received') {
      if (!validDay(node.date) || node.date > asOf || node.securityId !== securityId ||
          !identity(node.pairId) || !identity(node.outTradeId) || !identity(node.inTradeId) ||
          node.outTradeId === node.inTradeId || !identity(node.sourceAccountId) ||
          !identity(node.destinationAccountId) || node.sourceAccountId === node.destinationAccountId)
        return 'invalid';
      sources = [node.source];
    } else if (node.kind === 'merged') {
      if (!validDay(node.date) || node.date > asOf || !Array.isArray(node.sources) ||
          node.sources.length < 2 || node.sources.length > 2000 ||
          new Set(node.sources).size !== node.sources.length) return 'invalid';
      sources = node.sources;
    } else return 'invalid';
    active.add(node); stack.push({ node, leaving: true });
    edges += sources.length;
    if (edges > 12000) return 'limit';
    for (const source of sources) stack.push({ node: source, leaving: false });
  }
  const mass = completed.get(root);
  if (!mass || mass.accountId !== accountId ||
      mass.numerator !== BigInt(unitsE8) * mass.denominator) return 'invalid';
  for (const [key, share] of mass.shares) {
    const prior = ownership.get(key);
    const combined = prior ? sumShares(prior, share) : share;
    if (!combined) return 'limit';
    if (combined.numerator > combined.denominator) return 'invalid';
  }
  for (const [key, share] of mass.shares) {
    const prior = ownership.get(key);
    ownership.set(key, prior ? sumShares(prior, share)! : share);
  }
  return 'valid';
}
export function splitAverageProvenance(source: AveragePoolProvenance, date: string, numerator: bigint,
  denominator: bigint, saleId?: string): AveragePoolProvenance | null {
  if (!source || !validDay(date) || numerator <= 0n || denominator <= numerator ||
      denominator > limit || (saleId !== undefined && !identity(saleId))) return null;
  const divisor = commonDivisor(numerator, denominator);
  return { kind: 'split', date, source, numerator: Number(numerator / divisor),
    denominator: Number(denominator / divisor), ...(saleId ? { saleId } : {}) };
}
export function mergeAverageProvenance(date: string, roots: readonly (AveragePoolProvenance | undefined)[]):
  AveragePoolProvenance | undefined {
  const sources = roots.filter((root): root is AveragePoolProvenance => root !== undefined);
  return sources.length > 1 ? { kind: 'merged', date, sources } : sources[0];
}

/**
 * Stage-A preparation with the approved source-residual policy: transfer floor(exact cents),
 * retaining residual cents at source until its eventual full transfer. Actual E8 units stay exact.
 * This does not replay trades, establish evidence, or authorize apply.
 */
export function previewKnownBasisSecurityTransfer(input: KnownBasisTransferInput): SecurityTransferPreview {
  const { source, destination, date, unitsE8, method } = input;
  if (!source || !destination || !validDay(date) || !safe(unitsE8) || unitsE8 === 0 ||
      (method !== 'fifo' && method !== 'average') || !identity(source.accountId) || !identity(destination.accountId) ||
      source.accountId === destination.accountId || !identity(source.securityId) ||
      source.securityId !== destination.securityId ||
      typeof source.locked !== 'boolean' || typeof destination.locked !== 'boolean' ||
      typeof source.unsupportedCorporateAction !== 'boolean' || typeof destination.unsupportedCorporateAction !== 'boolean' ||
      !Array.isArray(source.fragments) ||
      !Array.isArray(destination.fragments) || source.fragments.length + destination.fragments.length > 2000)
    return unavailable('invalid_input');
  if (source.currency !== 'EUR' || destination.currency !== 'EUR') return unavailable('unsupported_currency');
  if (source.locked || destination.locked) return unavailable('locked');
  if (source.unsupportedCorporateAction || destination.unsupportedCorporateAction)
    return unavailable('unsupported_corporate_action');
  if (source.lineage === 'unknown' || destination.lineage === 'unknown') return unavailable('unknown_basis');
  if (source.lineage !== 'documented' || destination.lineage !== 'documented')
    return unavailable('ambiguous_lineage');
  if (source.boundary !== 'immediately-before-transfer' || destination.boundary !== 'immediately-before-transfer' ||
      source.asOf !== date || destination.asOf !== date) return unavailable('unestablished_boundary');
  const ids = new Set<string>();
  const order = new Map<string, TransferLotFragment>();
  const acquisitions = new Map<string, string>();
  const graphPositions = new Map<string, string>();
  const acquisitionFacts = new Map<string, string>();
  const fragmentHandles = new Map<string, TransferLotFragment>();
  const acquisitionForms = new Map<string, 'acquisition' | 'documented-fragment'>();
  const ownership = new Map<string, RationalShare>();
  const receipts = new Map<string, string>(), legs = new Map<string, string>();
  const sales = new Map<string, string>();
  const adjustments = new Map<string, string>();
  const splitValidationWork = { remaining: 1000000 };
  const fifoAdjustments = new Map<string, string>();
  let sourceUnits = 0n, sourceBasis = 0n, destinationBasis = 0n, destinationUnits = 0n;
  for (const pool of [source, destination]) {
    if (pool.averagePool !== undefined) {
      if (method !== 'average' || pool.fragments.length !== 0 || !pool.averagePool ||
          !safe(pool.averagePool.unitsE8) || pool.averagePool.unitsE8 === 0 ||
          !safe(pool.poolBasisCents as number)) return unavailable('invalid_input');
      const status = validateAverageProvenance(pool.averagePool.provenance, pool.averagePool.unitsE8,
        pool.accountId, pool.securityId, date, acquisitions, graphPositions,
        acquisitionFacts, fragmentHandles, acquisitionForms, ownership, receipts, legs, sales,
        adjustments);
      if (status !== 'valid') return unavailable(status === 'limit' ? 'provenance_limit' : 'ambiguous_lineage');
      if (pool === source) { sourceUnits = BigInt(pool.averagePool.unitsE8); sourceBasis = BigInt(pool.poolBasisCents!); }
      else { destinationUnits = BigInt(pool.averagePool.unitsE8); destinationBasis = BigInt(pool.poolBasisCents!); }
      continue;
    }
    let allFragmentBasisKnown = true;
    let anyFragmentBasisKnown = false;
    let fragmentBasis = 0n;
    for (const fragment of pool.fragments) {
      if (!fragment || !identity(fragment.fragmentId) || !identity(fragment.acquisitionId) || !validDay(fragment.acquiredOn) ||
          fragment.acquiredOn > date || !safe(fragment.acquisitionOrder) ||
          !safe(fragment.unitsE8) || fragment.unitsE8 === 0) return unavailable('invalid_input');
      if (fragment.basisCents === null) {
        if (method === 'fifo') return unavailable('unknown_basis');
        allFragmentBasisKnown = false;
      } else {
        if (!safe(fragment.basisCents)) return unavailable('invalid_input');
        anyFragmentBasisKnown = true;
        fragmentBasis += BigInt(fragment.basisCents);
      }
      if (fragment.transferPairIds !== undefined &&
          (!Array.isArray(fragment.transferPairIds) || fragment.transferPairIds.length > 1000 ||
          fragment.transferPairIds.some((id) => !identity(id)) ||
          new Set(fragment.transferPairIds).size !== fragment.transferPairIds.length))
        return unavailable('ambiguous_lineage');
      if (fragment.derivation !== undefined && !validDerivation(fragment, method, date,
        pool.accountId, splitValidationWork, fifoAdjustments))
        return unavailable('ambiguous_lineage');
      const position = `${fragment.acquiredOn}:${fragment.acquisitionOrder}`;
      const previous = order.get(position);
      const acquisitionPosition = acquisitions.get(fragment.acquisitionId);
      if (ids.has(fragment.fragmentId) || (acquisitionPosition !== undefined && acquisitionPosition !== position))
        return unavailable('ambiguous_lineage');
      if (graphPositions.has(position) && graphPositions.get(position) !== fragment.acquisitionId)
        return unavailable('ambiguous_lineage');
      if (acquisitionForms.has(fragment.acquisitionId) &&
          acquisitionForms.get(fragment.acquisitionId) !== 'documented-fragment')
        return unavailable('ambiguous_lineage');
      if (previous && (previous.acquisitionId !== fragment.acquisitionId ||
          !(hasTransferAncestry(previous) || hasTransferAncestry(fragment))))
        return unavailable('ambiguous_lineage');
      ids.add(fragment.fragmentId);
      order.set(position, fragment);
      acquisitions.set(fragment.acquisitionId, position);
      graphPositions.set(position, fragment.acquisitionId);
      if (fragmentHandles.has(fragment.fragmentId)) return unavailable('ambiguous_lineage');
      fragmentHandles.set(fragment.fragmentId, fragment);
      acquisitionForms.set(fragment.acquisitionId, 'documented-fragment');
      if (method === 'average') ownership.set(`fragment:${fragment.fragmentId}`,
        { numerator: 1n, denominator: 1n });
      if (pool === source) sourceUnits += BigInt(fragment.unitsE8);
      else destinationUnits += BigInt(fragment.unitsE8);
    }
    let poolBasis = fragmentBasis;
    if (method === 'average') {
      if (pool.poolBasisCents === null || (pool.poolBasisCents === undefined && !allFragmentBasisKnown))
        return unavailable('unknown_basis');
      if (pool.poolBasisCents !== undefined) {
        if (!safe(pool.poolBasisCents)) return unavailable('invalid_input');
        poolBasis = BigInt(pool.poolBasisCents);
        if ((allFragmentBasisKnown && fragmentBasis !== poolBasis) ||
            (!allFragmentBasisKnown && anyFragmentBasisKnown))
          return unavailable('basis_evidence_conflict');
      }
    }
    const poolUnits = pool === source ? sourceUnits : destinationUnits;
    if (poolUnits === 0n && poolBasis !== 0n) return unavailable('invalid_input');
    if (pool === source) sourceBasis = poolBasis;
    else destinationBasis = poolBasis;
  }
  if (sourceUnits > limit || destinationUnits + BigInt(unitsE8) > limit || sourceBasis + destinationBasis > limit) return unavailable('invalid_input');
  const requested = BigInt(unitsE8);
  if (requested > sourceUnits) return unavailable('insufficient_units');
  if (method === 'average') {
    const fromEvidence = (pool: TransferPoolEvidence): AveragePoolProvenance | undefined =>
      pool.averagePool?.provenance ?? mergeAverageProvenance(date, pool.fragments.map((fragment) =>
        ({ kind: 'documented-fragment' as const, securityId: pool.securityId,
          accountId: pool.accountId, fragment })));
    const sourceRoot = fromEvidence(source)!;
    const destinationRoot = fromEvidence(destination);
    const movedRoot = requested === sourceUnits ? sourceRoot
      : splitAverageProvenance(sourceRoot, date, requested, sourceUnits);
    const remainingRoot = requested === sourceUnits ? undefined
      : splitAverageProvenance(sourceRoot, date, sourceUnits - requested, sourceUnits);
    if (!movedRoot || remainingRoot === null) return unavailable('invalid_input');
    const movedStatus = validateAverageProvenance(movedRoot, unitsE8, source.accountId,
      source.securityId, date);
    const remainingStatus = remainingRoot ? validateAverageProvenance(remainingRoot,
      Number(sourceUnits - requested), source.accountId, source.securityId, date) : 'valid';
    if (movedStatus !== 'valid' || remainingStatus !== 'valid')
      return unavailable(movedStatus === 'limit' || remainingStatus === 'limit'
        ? 'provenance_limit' : 'ambiguous_lineage');
    const transferred = sourceBasis * requested / sourceUnits;
    return {
      available: true, method, date, unitsE8, transferredBasisCents: Number(transferred),
      basisAllocation: 'average-pool', moved: [], sourceRemaining: [], destinationExisting: [],
      movedAverageProvenance: movedRoot,
      ...(remainingRoot ? { sourceRemainingAverageProvenance: remainingRoot } : {}),
      ...(destinationRoot ? { destinationExistingAverageProvenance: destinationRoot } : {}),
      sourceRemainingBasisCents: Number(sourceBasis - transferred),
      destinationBasisAfterCents: Number(destinationBasis + transferred),
      cashDeltaCents: 0, realizedGainDeltaCents: 0, applyAvailable: false,
    };
  }
  const moved: AllocatedTransferFragment[] = [], remaining: AllocatedTransferFragment[] = [];
  let left = requested, transferred = 0n;
  for (const fragment of normalizeFifoAcquisitionFragments(source.fragments)) {
    const units = BigInt(fragment.unitsE8);
    const take = left < units ? left : units;
    const basis = BigInt(fragment.basisCents!);
    // Each FIFO lot retains its own fractional cent until all of that lot leaves.
    const carry = basis * take / units;
    if (take > 0n) moved.push({ ...fragment, unitsE8: Number(take), basisCents: Number(carry),
      ...(take < units ? { derivation: { kind: 'allocated' as const, date, source: fragment } } : {}) });
    if (units > take) remaining.push({ ...fragment, unitsE8: Number(units - take), basisCents: Number(basis - carry),
      ...(take > 0n ? { derivation: { kind: 'allocated' as const, date, source: fragment } } : {}) });
    transferred += carry;
    left -= take;
  }
  return {
    available: true, method, date, unitsE8, transferredBasisCents: Number(transferred),
    basisAllocation: 'fifo-lots',
    moved, sourceRemaining: remaining,
    destinationExisting: normalizeFifoAcquisitionFragments(destination.fragments),
    sourceRemainingBasisCents: Number(sourceBasis - transferred),
    destinationBasisAfterCents: Number(destinationBasis + transferred),
    cashDeltaCents: 0, realizedGainDeltaCents: 0, applyAvailable: false,
  };
}

export interface ExplicitSecurityTransferPair {
  id: string;
  out: { id: string; accountId: string; securityId: string; date: string; unitsE8: number; currency: string };
  incoming: { id: string; accountId: string; securityId: string; date: string; unitsE8: number; currency: string };
}
/** Only an explicitly identified pair can be classified; similar independent deliveries never qualify. */
export function previewSecurityTransferScope(
  pair: ExplicitSecurityTransferPair,
  accountIds: readonly string[],
  valuation?: { date: string; securityId: string; unitsE8: number; currency: string; valueCents: number },
): { available: true; internal: boolean; externalContributionCents: number } |
   { available: false; message: string } {
  const out = pair?.out, incoming = pair?.incoming;
  if (!identity(pair?.id) || !identity(out?.id) || !identity(incoming?.id) || out.id === incoming.id ||
      !identity(out.accountId) || !identity(incoming.accountId) || out.accountId === incoming.accountId ||
      !identity(out.securityId) || out.securityId !== incoming.securityId || !validDay(out.date) ||
      out.date !== incoming.date || !Number.isSafeInteger(out.unitsE8) || out.unitsE8 >= 0 ||
      incoming.unitsE8 !== -out.unitsE8 || !Array.isArray(accountIds) ||
      accountIds.some((id) => typeof id !== 'string' || !id))
    return { available: false, message: 'Ein eindeutig belegtes Paar mit beiden Übertragsseiten fehlt.' };
  if (out.currency !== 'EUR' || incoming.currency !== 'EUR')
    return { available: false, message: 'Diese Vorschau unterstützt nur belegte Übertragsseiten und Bewertungen in EUR.' };
  const sourceIncluded = accountIds.includes(out.accountId), destinationIncluded = accountIds.includes(incoming.accountId);
  if (sourceIncluded && destinationIncluded) return { available: true, internal: true, externalContributionCents: 0 };
  if (!sourceIncluded && !destinationIncluded) return { available: true, internal: false, externalContributionCents: 0 };
  if (!valuation || valuation.date !== out.date || valuation.securityId !== out.securityId ||
      valuation.unitsE8 !== incoming.unitsE8 || valuation.currency !== 'EUR' || !safe(valuation.valueCents))
    return { available: false, message: 'Für diese einseitige Auswahl fehlt die belegte Bewertung am Übertragstag.' };
  return { available: true, internal: false,
    externalContributionCents: destinationIncluded ? valuation.valueCents : -valuation.valueCents };
}
