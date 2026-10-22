import type { CostMethod } from './cost';

/** Input must come from a documented replay at the transfer boundary, never inferred deliveries. */
export interface TransferLotFragment {
  fragmentId: string;
  acquisitionId: string;
  acquiredOn: string;
  /** Explicit stable acquisition order; this preview never chooses a same-day tie winner. */
  acquisitionOrder: number;
  unitsE8: number;
  basisCents: number | null;
  /** Explicit traversed transfer identities, supplied by documented replay; never inferred. */
  transferPairIds?: readonly string[];
}
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
/** Average fragments carry acquisition provenance/units only; pooled cents are returned separately. */
export type AllocatedTransferFragment = TransferLotFragment;
export type SecurityTransferPreviewError =
  | 'invalid_input' | 'unsupported_currency' | 'unknown_basis' | 'ambiguous_lineage'
  | 'unestablished_boundary' | 'locked' | 'unsupported_corporate_action'
  | 'insufficient_units' | 'nonrepresentable_allocation' | 'basis_evidence_conflict';
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

/**
 * Stage-A preparation with the approved source-residual policy: transfer floor(exact cents),
 * retaining residual cents at source until its eventual full transfer. E8 fragments stay exact.
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
  const order = new Map<string, { accountId: string; fragment: TransferLotFragment }>();
  const acquisitions = new Map<string, string>();
  let sourceUnits = 0n, sourceBasis = 0n, destinationBasis = 0n, destinationUnits = 0n;
  for (const pool of [source, destination]) {
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
      const position = `${fragment.acquiredOn}:${fragment.acquisitionOrder}`;
      const previous = order.get(position);
      const acquisitionPosition = acquisitions.get(fragment.acquisitionId);
      if (ids.has(fragment.fragmentId) || (acquisitionPosition !== undefined && acquisitionPosition !== position))
        return unavailable('ambiguous_lineage');
      if (previous && ((pool === source && method === 'fifo' && previous.accountId === pool.accountId) ||
          previous.fragment.acquisitionId !== fragment.acquisitionId ||
          !(previous.fragment.transferPairIds?.length || fragment.transferPairIds?.length)))
        return unavailable('ambiguous_lineage');
      ids.add(fragment.fragmentId);
      order.set(position, { accountId: pool.accountId, fragment });
      acquisitions.set(fragment.acquisitionId, position);
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
  const moved: AllocatedTransferFragment[] = [], remaining: AllocatedTransferFragment[] = [];
  let left = requested, transferred = 0n;
  for (const fragment of ordered(source.fragments)) {
    const units = BigInt(fragment.unitsE8);
    const numerator = method === 'fifo' ? (left < units ? left : units) : units * requested;
    const denominator = method === 'fifo' ? 1n : sourceUnits;
    if (numerator % denominator !== 0n) return unavailable('nonrepresentable_allocation');
    const take = numerator / denominator;
    if (method === 'fifo') {
      const basis = BigInt(fragment.basisCents!);
      // Each FIFO lot retains its own fractional cent until all of that lot leaves.
      const carry = basis * take / units;
      if (take > 0n) moved.push({ ...fragment, unitsE8: Number(take), basisCents: Number(carry) });
      if (units > take) remaining.push({ ...fragment, unitsE8: Number(units - take), basisCents: Number(basis - carry) });
      transferred += carry;
      left -= take;
    } else {
      // Do not assign pooled basis to acquisition fragments or floor each fragment separately.
      if (take > 0n) moved.push({ ...fragment, unitsE8: Number(take), basisCents: null });
      if (units > take) remaining.push({ ...fragment, unitsE8: Number(units - take), basisCents: null });
    }
  }
  // Average uses ONE pool-level division. Per-fragment floors would retain extra cents.
  if (method === 'average') transferred = sourceBasis * requested / sourceUnits;
  return {
    available: true, method, date, unitsE8, transferredBasisCents: Number(transferred),
    basisAllocation: method === 'fifo' ? 'fifo-lots' : 'average-pool',
    moved, sourceRemaining: remaining,
    destinationExisting: ordered(destination.fragments).map((fragment) => ({ ...fragment, basisCents: method === 'fifo' ? fragment.basisCents : null })),
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
