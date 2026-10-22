import type { CostMethod } from './cost';
import { averageCost, fifoCost, type CostTrade } from './invest';
import { moneyRuleViolation, unitsRuleViolation } from './trade-rules';
import {
  previewKnownBasisSecurityTransfer,
  fifoSplitLotUnits,
  normalizeFifoAcquisitionFragments,
  mergeAverageProvenance,
  splitAverageProvenance,
  validateAverageProvenance,
  type AveragePoolProvenance,
  type SecurityTransferPreview,
  type SecurityTransferPreviewError,
  type TransferLotFragment,
  type TransferPoolEvidence,
} from './security-transfer-preview';

interface EventIdentity { id: string; date: string; sequence: number; securityId: string; currency: string }
export type KnownSecurityReplayEvent =
  | (EventIdentity & { kind: 'buy' | 'sell'; accountId: string; unitsE8: number; amountCents: number; feeCents: number; taxCents: number })
  | (EventIdentity & { kind: 'split'; accountId: string; unitsE8: number; amountCents: number; feeCents: number; taxCents: number })
  | (EventIdentity & { kind: 'transfer'; sourceAccountId: string; destinationAccountId: string; unitsE8: number; outTradeId: string; inTradeId: string })
  | (EventIdentity & { kind: 'delivery_in' | 'delivery_out' | 'snapshot' | 'merger' | 'spinoff' });
export interface KnownSecurityReplayInput {
  securityId: string;
  method: CostMethod;
  /** Analytical zero seed of the recorded app ledger, not a claim about broker opening holdings. */
  opening: 'recorded-ledger-zero-seed';
  accountIds: readonly string[];
  lockedAccountIds: readonly string[];
  /** Every recorded unit fact in this scope through this day was read and classified. */
  coverage: { kind: 'all-supported-recorded-facts'; through: string };
  events: readonly KnownSecurityReplayEvent[];
}
export interface ReplayedSecurityAccount {
  accountId: string;
  unitsE8: number;
  basisCents: number;
  realizedGainCents: number;
  fragments: TransferLotFragment[];
  /** Exact analytical ancestry for average; current holdings remain integer units/cents. */
  averageProvenance: AveragePoolProvenance | null;
}
export interface ReplayedSecurityTransfer {
  pairId: string;
  outTradeId: string;
  inTradeId: string;
  preview: Extract<SecurityTransferPreview, { available: true }>;
  incomingFragments: TransferLotFragment[];
  incomingAverageProvenance?: AveragePoolProvenance;
}
const MESSAGES = {
  unestablished_history: 'Der Umfang der aufgezeichneten, unterstützten Buchungen ist nicht eindeutig belegt.',
  ambiguous_event: 'Ereignis, Wertpapier, Währung oder Reihenfolge ist nicht eindeutig.',
  ambiguous_order: 'Die Reihenfolge am selben Tag ist nicht belegt.',
  duplicate_leg: 'Eine Übertragsseite fehlt oder wird mehrfach verwendet.',
  invalid_trade: 'Kauf oder Verkauf ist nicht vollständig und gültig belegt.',
  arithmetic_limit: 'Stückzahl, Kostenbasis oder Zwischensaldo überschreitet die exakte Rechengrenze.',
  ambiguous_disposal: 'Verkaufsbestand oder die Reihenfolge verbleibender Fragmente ist nicht eindeutig.',
  nonrepresentable_allocation: 'Die verbleibende Anschaffungsherkunft ist in E8-Einheiten nicht exakt darstellbar.',
  unknown_basis: 'Die FIFO-Lotbasis fehlt.',
  invalid_pair: 'Beide unterschiedlichen Übertragskonten und die positive Stückzahl fehlen.',
  lineage_cycle: 'Die Übertragsbeziehungen desselben Tages enthalten einen Kreis.',
  unsupported_event: 'Ungepaarte Lieferungen, Snapshots und Kapitalmaßnahmen benötigen manuelle Prüfung.',
  scope_limit: 'Der begrenzte Replay-Umfang wurde überschritten.',
} as const;
export type KnownSecurityReplayError = keyof typeof MESSAGES | SecurityTransferPreviewError;
export type KnownSecurityReplayResult =
  | { available: false; eventId: string | null; code: KnownSecurityReplayError; reason: string }
  | { available: true; accounts: ReplayedSecurityAccount[]; transfers: ReplayedSecurityTransfer[]; applyAvailable: false };
const fail = (code: keyof typeof MESSAGES, eventId: string | null = null): KnownSecurityReplayResult =>
  ({ available: false, eventId, code, reason: MESSAGES[code] });
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 80;
const safe = (value: number) => Number.isSafeInteger(value) && value >= 0;
const day = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const ordered = (fragments: readonly TransferLotFragment[]) => [...fragments].sort((a, b) =>
  a.acquiredOn.localeCompare(b.acquiredOn) || a.acquisitionOrder - b.acquisitionOrder);
const totalUnits = (fragments: readonly TransferLotFragment[]) => fragments.reduce((sum, f) => sum + BigInt(f.unitsE8), 0n);
const limit = BigInt(Number.MAX_SAFE_INTEGER);
const roundedBasis = (basis: number, taken: bigint, units: bigint) =>
  (2n * BigInt(basis) * taken + units) / (2n * units);
function unambiguous(fragments: readonly TransferLotFragment[]): boolean {
  return new Set(fragments.map((f) => `${f.acquiredOn}:${f.acquisitionOrder}`)).size === fragments.length;
}
/**
 * Pure dated replay for one security, an app-ledger zero seed, and explicit EUR buy/sell/split/pair
 * events. It does not query, pair old deliveries, mutate rows, establish input evidence, or
 * assert that the recorded ledger is complete against an external broker.
 * Full-batch failure returns no partial plan. Caller-supplied event order must be authoritative.
 */
export function replayKnownSecurityTransfers(input: KnownSecurityReplayInput): KnownSecurityReplayResult {
  if (!id(input.securityId) || (input.method !== 'fifo' && input.method !== 'average') ||
      input.opening !== 'recorded-ledger-zero-seed' ||
      input.coverage?.kind !== 'all-supported-recorded-facts' || !day(input.coverage.through) ||
      !Array.isArray(input.events) || input.events.length > 1000 ||
      !Array.isArray(input.accountIds) || !input.accountIds.length || input.accountIds.length > 50 ||
      input.accountIds.some((account) => !id(account)) || new Set(input.accountIds).size !== input.accountIds.length ||
      !Array.isArray(input.lockedAccountIds) || input.lockedAccountIds.length > 50 ||
      new Set(input.lockedAccountIds).size !== input.lockedAccountIds.length ||
      input.lockedAccountIds.some((account) => !input.accountIds.includes(account)))
    return fail('unestablished_history');
  const states = new Map<string, ReplayedSecurityAccount>(input.accountIds.map((accountId) => [accountId, {
    accountId, unitsE8: 0, basisCents: 0, realizedGainCents: 0,
    fragments: [], averageProvenance: null,
  }]));
  const identities = new Set<string>(), positions = new Set<string>();
  for (const event of input.events) {
    if (!event || !id(event.id) || !day(event.date) || !safe(event.sequence) ||
        event.date > input.coverage.through || event.securityId !== input.securityId ||
        event.currency !== 'EUR' || identities.has(event.id))
      return fail('ambiguous_event', event && id(event.id) ? event.id : null);
    const position = `${event.date}:${event.sequence}`;
    if (positions.has(position)) return fail('ambiguous_order', event.id);
    identities.add(event.id); positions.add(position);
  }
  // Pair leg identities are explicit and cannot be reused by any other event or pair.
  for (const event of input.events) if (event.kind === 'transfer') {
    if (!id(event.outTradeId) || !id(event.inTradeId) || event.outTradeId === event.inTradeId ||
        identities.has(event.outTradeId) || identities.has(event.inTradeId))
      return fail('duplicate_leg', event.id);
    identities.add(event.outTradeId); identities.add(event.inTradeId);
  }
  const transfers: ReplayedSecurityTransfer[] = [];
  let graphDay = '';
  const edges = new Map<string, Set<string>>();
  const reaches = (from: string, target: string, visited = new Set<string>()): boolean => {
    if (from === target) return true;
    if (visited.has(from)) return false;
    visited.add(from);
    return [...(edges.get(from) ?? [])].some((next) => reaches(next, target, visited));
  };
  for (const event of [...input.events].sort((a, b) => a.date.localeCompare(b.date) || a.sequence - b.sequence)) {
    if (event.date !== graphDay) { graphDay = event.date; edges.clear(); }
    if (event.kind === 'split') {
      const state = states.get(event.accountId);
      if (!state || unitsRuleViolation('split', event.unitsE8) || moneyRuleViolation(event))
        return fail('invalid_trade', event.id);
      const before = BigInt(state.unitsE8), after = before + BigInt(event.unitsE8);
      if (before <= 0n || after <= 0n || after > limit)
        return fail('nonrepresentable_allocation', event.id);
      const split: CostTrade = { kind: 'split', unitsE8: event.unitsE8,
        amountCents: 0, feeCents: 0, taxCents: 0 };
      if (input.method === 'fifo') {
        const lots = normalizeFifoAcquisitionFragments(state.fragments);
        if (!unambiguous(lots) || totalUnits(lots) !== before ||
            lots.some((lot) => lot.basisCents === null))
          return fail('ambiguous_disposal', event.id);
        const outputs = fifoSplitLotUnits(lots, event.unitsE8);
        if (!outputs) return fail('nonrepresentable_allocation', event.id);
        const canonical = fifoCost({ unitsE8: 0, costBasisCents: 0 }, [
          ...lots.map((lot): CostTrade => ({ kind: 'buy', unitsE8: lot.unitsE8,
            amountCents: lot.basisCents!, feeCents: 0, taxCents: 0 })), split,
        ]);
        if (canonical.unitsE8 !== Number(after) || canonical.costBasisCents !== state.basisCents ||
            canonical.realizedGainCents !== 0) return fail('arithmetic_limit', event.id);
        state.fragments = lots.map((lot, index) => ({
          fragmentId: `split:${event.id}:${index}`, acquisitionId: lot.acquisitionId,
          acquiredOn: lot.acquiredOn, acquisitionOrder: lot.acquisitionOrder,
          unitsE8: outputs[index]!, basisCents: lot.basisCents,
          ...(lot.transferPairIds === undefined ? {} : { transferPairIds: lot.transferPairIds }),
          derivation: { kind: 'unit-adjusted' as const, splitId: event.id,
            date: event.date, accountId: event.accountId, deltaUnitsE8: event.unitsE8,
            sourceIndex: index, splitSources: lots, source: lot },
        }));
      } else {
        if (!state.averageProvenance) return fail('ambiguous_disposal', event.id);
        const canonical = averageCost({ unitsE8: state.unitsE8,
          costBasisCents: state.basisCents }, [split]);
        if (canonical.unitsE8 !== Number(after) || canonical.costBasisCents !== state.basisCents ||
            canonical.realizedGainCents !== 0) return fail('arithmetic_limit', event.id);
        state.averageProvenance = { kind: 'unit-adjusted', date: event.date,
          source: state.averageProvenance, securityId: input.securityId,
          accountId: event.accountId, splitId: event.id,
          beforeUnitsE8: state.unitsE8, afterUnitsE8: Number(after) };
      }
      state.unitsE8 = Number(after);
    } else if (event.kind === 'buy' || event.kind === 'sell') {
      const state = states.get(event.accountId);
      if (!state || unitsRuleViolation(event.kind, event.unitsE8) || moneyRuleViolation(event))
        return fail('invalid_trade', event.id);
      if (event.kind === 'buy') {
        if (!safe(state.unitsE8 + event.unitsE8) || !safe(state.basisCents + event.amountCents + event.feeCents))
          return fail('arithmetic_limit', event.id);
        if (input.method === 'average') {
          state.averageProvenance = mergeAverageProvenance(event.date, [
            state.averageProvenance ?? undefined,
            { kind: 'acquisition', securityId: input.securityId, acquisitionId: event.id,
              acquiredOn: event.date, acquisitionOrder: event.sequence,
              accountId: event.accountId, unitsE8: event.unitsE8 },
          ])!;
        } else {
          state.fragments.push({ fragmentId: `buy:${event.id}`, acquisitionId: event.id,
            acquiredOn: event.date, acquisitionOrder: event.sequence, unitsE8: event.unitsE8,
            basisCents: event.amountCents + event.feeCents, transferPairIds: [] });
        }
        state.unitsE8 += event.unitsE8;
        state.basisCents += event.amountCents + event.feeCents;
      } else {
        const quantity = BigInt(-event.unitsE8);
        const beforeUnits = input.method === 'average' ? BigInt(state.unitsE8) : totalUnits(state.fragments);
        const fifoLots = input.method === 'fifo' ? normalizeFifoAcquisitionFragments(state.fragments) : [];
        if (quantity > beforeUnits || (input.method === 'fifo' && !unambiguous(fifoLots)))
          return fail('ambiguous_disposal', event.id);
        const remaining: TransferLotFragment[] = [];
        if (input.method === 'average') {
          if (!state.averageProvenance) return fail('ambiguous_disposal', event.id);
        } else {
          let left = quantity;
          for (const fragment of fifoLots) {
            const units = BigInt(fragment.unitsE8), taken = left < units ? left : units;
            if (fragment.basisCents === null) return fail('unknown_basis', event.id);
            const cost = fifoCost({ unitsE8: fragment.unitsE8, costBasisCents: fragment.basisCents }, [{
              kind: 'sell', unitsE8: -Number(taken), amountCents: 0, feeCents: 0, taxCents: 0,
            }]);
            if (cost.costBasisCents !== Number(BigInt(fragment.basisCents) - roundedBasis(fragment.basisCents, taken, units)))
              return fail('arithmetic_limit', event.id);
            if (cost.unitsE8 > 0) remaining.push({ ...fragment, unitsE8: cost.unitsE8,
              basisCents: cost.costBasisCents,
              ...(taken > 0n ? { derivation: { kind: 'sold-remainder' as const,
                saleId: event.id, date: event.date, source: fragment } } : {}) });
            left -= taken;
          }
        }
        const sale: CostTrade = { kind: 'sell', unitsE8: event.unitsE8, amountCents: event.amountCents,
          feeCents: event.feeCents, taxCents: event.taxCents };
        const cost = input.method === 'average'
          ? averageCost({ unitsE8: state.unitsE8, costBasisCents: state.basisCents }, [sale])
          : fifoCost({ unitsE8: 0, costBasisCents: 0 }, [
              ...fifoLots.map((f): CostTrade => ({ kind: 'buy', unitsE8: f.unitsE8,
                amountCents: f.basisCents!, feeCents: 0, taxCents: 0 })), sale,
            ]);
        // Reuse canonical disposal semantics; reject a floating-point result that disagrees
        // with exact half-up cents rather than silently introducing different sale economics.
        const expectedBasis = input.method === 'average'
          ? BigInt(state.basisCents) - roundedBasis(state.basisCents, quantity, beforeUnits)
          : remaining.reduce((sum, fragment) => sum + BigInt(fragment.basisCents!), 0n);
        const expectedGain = BigInt(event.amountCents) - BigInt(event.feeCents) - BigInt(event.taxCents) -
          (BigInt(state.basisCents) - expectedBasis);
        if (cost.unitsE8 !== Number(beforeUnits - quantity) || cost.costBasisCents !== Number(expectedBasis) ||
            cost.realizedGainCents !== Number(expectedGain) ||
            !Number.isSafeInteger(state.realizedGainCents + cost.realizedGainCents))
          return fail('arithmetic_limit', event.id);
        state.fragments = remaining; state.unitsE8 = cost.unitsE8; state.basisCents = cost.costBasisCents;
        if (input.method === 'average') {
          const source = state.averageProvenance!;
          state.averageProvenance = cost.unitsE8 === 0 ? null
            : splitAverageProvenance(source, event.date, beforeUnits - quantity, beforeUnits, event.id);
          if (cost.unitsE8 > 0 && !state.averageProvenance) return fail('arithmetic_limit', event.id);
        }
        state.realizedGainCents += cost.realizedGainCents;
      }
    } else if (event.kind === 'transfer') {
      const source = states.get(event.sourceAccountId), destination = states.get(event.destinationAccountId);
      if (!source || !destination || source === destination || !safe(event.unitsE8) || !event.unitsE8)
        return fail('invalid_pair', event.id);
      if (reaches(event.destinationAccountId, event.sourceAccountId))
        return fail('lineage_cycle', event.id);
      const evidence = (state: ReplayedSecurityAccount): TransferPoolEvidence => ({
        accountId: state.accountId, securityId: input.securityId, currency: 'EUR', asOf: event.date,
        boundary: 'immediately-before-transfer', lineage: 'documented',
        locked: input.lockedAccountIds.includes(state.accountId), unsupportedCorporateAction: false,
        fragments: state.fragments, ...(input.method === 'average' ? {
          poolBasisCents: state.basisCents,
          ...(state.averageProvenance ? { averagePool: { unitsE8: state.unitsE8,
            provenance: state.averageProvenance } } : {}),
        } : {}),
      });
      const preview = previewKnownBasisSecurityTransfer({ date: event.date, unitsE8: event.unitsE8,
        method: input.method, source: evidence(source), destination: evidence(destination) });
      if (!preview.available)
        return { available: false, eventId: event.id, code: preview.reason, reason: preview.message };
      // Keep historical previews independent of later buys that append to this account.
      source.fragments = [...preview.sourceRemaining];
      source.unitsE8 -= event.unitsE8; source.basisCents = preview.sourceRemainingBasisCents;
      if (input.method === 'average') source.averageProvenance = preview.sourceRemainingAverageProvenance ?? null;
      const incomingFragments = preview.moved.map((fragment, index) => ({ ...fragment,
        fragmentId: `in:${event.inTradeId}:${index}`,
        transferPairIds: fragment.transferPairIds === undefined
          ? undefined : [...fragment.transferPairIds, event.id],
        derivation: { kind: 'received' as const, pairId: event.id,
          outTradeId: event.outTradeId, inTradeId: event.inTradeId, date: event.date,
          sourceAccountId: event.sourceAccountId, destinationAccountId: event.destinationAccountId,
          source: fragment },
      }));
      destination.fragments.push(...incomingFragments);
      destination.unitsE8 += event.unitsE8; destination.basisCents = preview.destinationBasisAfterCents;
      let incomingAverageProvenance: AveragePoolProvenance | undefined;
      if (input.method === 'average') {
        incomingAverageProvenance = {
          kind: 'received', date: event.date, securityId: input.securityId,
          pairId: event.id, outTradeId: event.outTradeId, inTradeId: event.inTradeId,
          sourceAccountId: event.sourceAccountId, destinationAccountId: event.destinationAccountId,
          source: preview.movedAverageProvenance!,
        };
        destination.averageProvenance = mergeAverageProvenance(event.date, [
          preview.destinationExistingAverageProvenance, incomingAverageProvenance,
        ])!;
      }
      edges.set(event.sourceAccountId, new Set([...(edges.get(event.sourceAccountId) ?? []), event.destinationAccountId]));
      transfers.push({ pairId: event.id, outTradeId: event.outTradeId, inTradeId: event.inTradeId,
        preview, incomingFragments, ...(incomingAverageProvenance ? { incomingAverageProvenance } : {}) });
    } else return fail('unsupported_event', event.id);
    const totalBasis = [...states.values()].reduce((sum, state) => sum + BigInt(state.basisCents), 0n);
    if (totalBasis > limit || [...states.values()].some((state) => state.fragments.length > 2000))
      return fail('scope_limit', event.id);
    if (input.method === 'average' && [...states.values()].some((state) =>
      state.averageProvenance && validateAverageProvenance(state.averageProvenance,
        state.unitsE8, state.accountId, input.securityId, event.date) !== 'valid'))
      return fail('scope_limit', event.id);
  }
  return { available: true, accounts: [...states.values()].map((state) => ({ ...state, fragments: ordered(state.fragments) })),
    transfers, applyAvailable: false };
}
