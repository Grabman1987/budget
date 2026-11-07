import type { CostMethod } from './cost';
import { sumValuationCents } from './invest';
import { mulDivRound } from '../wealth/int';

interface DatedEvent {
  id: string;
  date: string;
  /** Explicit source order, unique within a day; array order is never evidence. */
  sequence: number;
  securityId: string;
  currency: string;
}

export interface SecurityTransferLeg {
  id: string;
  accountId: string;
  securityId: string;
  currency: string;
  date: string;
  /** Signed E8 units: outgoing negative, incoming positive, exactly 1:1. */
  unitsE8: number;
}

export type SecurityReplayEvent = DatedEvent &
  (
    | { kind: 'acquisition'; accountId: string; unitsE8: number; basisCents: number | null }
    | { kind: 'sale'; accountId: string; unitsE8: number; netProceedsCents: number }
    | { kind: 'transfer'; outgoing: SecurityTransferLeg; incoming: SecurityTransferLeg }
    | { kind: 'snapshot' | 'delivery_in' | 'delivery_out' | 'split' | 'merger' | 'spinoff' }
  );

export interface SecurityReplayInput {
  securityId: string;
  /** Stage A only supports documented EUR basis, without FX or conversion assumptions. */
  currency: string;
  accounts: readonly { id: string; currency: string }[];
  through: string;
  /** Complete documented acquisitions from zero; never an inferred legacy opening. */
  events: readonly SecurityReplayEvent[];
}

export interface SecurityAcquisitionFragment {
  acquisitionId: string;
  acquiredOn: string;
  acquisitionOrder: number;
  unitsE8: number;
  /** FIFO only. Average basis belongs to the pool, never to invented individual lots. */
  basisCents: number | null;
}

export interface ReplayedSecurityHolding {
  accountId: string;
  unitsE8: number;
  basisCents: number;
  realizedGainCents: number;
  fragments: SecurityAcquisitionFragment[];
}

export interface ReplayedSecurityTransfer {
  id: string;
  date: string;
  outgoing: SecurityTransferLeg;
  incoming: SecurityTransferLeg;
  basisCents: number;
  fragments: SecurityAcquisitionFragment[];
  cashDeltaCents: 0;
  realizedGainDeltaCents: 0;
}

export type SecurityReplayFailure =
  | 'invalid_input'
  | 'unsupported_currency'
  | 'security_mismatch'
  | 'unsupported_event'
  | 'unknown_basis'
  | 'ambiguous_order'
  | 'invalid_pair'
  | 'duplicate_identity'
  | 'same_day_cycle'
  | 'insufficient_units'
  | 'nonrepresentable_units'
  | 'arithmetic_limit';

export type SecurityReplayResult =
  | { ok: true; holdings: ReplayedSecurityHolding[]; transfers: ReplayedSecurityTransfer[] }
  | { ok: false; reason: SecurityReplayFailure; eventId: string | null };

const nonnegative = (n: number) => Number.isSafeInteger(n) && n >= 0;
const positive = (n: number) => nonnegative(n) && n > 0;
const identity = (s: string) => typeof s === 'string' && s.trim().length > 0;
const validDay = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(`${s}T00:00:00Z`)) &&
  new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const fail = (
  reason: SecurityReplayFailure,
  eventId: string | null = null,
): SecurityReplayResult => ({ ok: false, reason, eventId });
const orderFragments = (a: SecurityAcquisitionFragment, b: SecurityAcquisitionFragment) =>
  a.acquiredOn.localeCompare(b.acquiredOn) || a.acquisitionOrder - b.acquisitionOrder;

/** Reunite branches of one original acquisition before FIFO rounding on a later sale. */
function reunite(fragments: readonly SecurityAcquisitionFragment[]): SecurityAcquisitionFragment[] {
  const lots = new Map<string, SecurityAcquisitionFragment>();
  for (const fragment of fragments) {
    const previous = lots.get(fragment.acquisitionId);
    lots.set(
      fragment.acquisitionId,
      previous
        ? {
            ...previous,
            unitsE8: sumValuationCents([previous.unitsE8, fragment.unitsE8]),
            basisCents:
              previous.basisCents === null
                ? null
                : sumValuationCents([previous.basisCents, fragment.basisCents!]),
          }
        : { ...fragment },
    );
  }
  return [...lots.values()].sort(orderFragments);
}

/**
 * Pure Stage A proof, deliberately not wired into live cost readers or writers.
 * Replay every dated fact from zero. Failure returns no partial holdings or transfers.
 * Acquisitions supply documented basis including already capitalized purchase fees;
 * sales supply actual net proceeds. Neither fees nor tax withholding is invented here.
 */
export function replaySecurityTransfers(
  input: SecurityReplayInput,
  method: CostMethod = 'average',
): SecurityReplayResult {
  if (
    !identity(input.securityId) ||
    !validDay(input.through) ||
    (method !== 'fifo' && method !== 'average')
  )
    return fail('invalid_input');
  if (input.currency !== 'EUR' || input.accounts.some((a) => a.currency !== 'EUR'))
    return fail('unsupported_currency');
  const states = new Map<string, ReplayedSecurityHolding>();
  for (const account of input.accounts) {
    if (!identity(account.id) || states.has(account.id)) return fail('invalid_input');
    states.set(account.id, {
      accountId: account.id,
      unitsE8: 0,
      basisCents: 0,
      realizedGainCents: 0,
      fragments: [],
    });
  }
  if (input.events.some((e) => !validDay(e.date))) return fail('invalid_input');
  const events = input.events
    .filter((e) => e.date <= input.through)
    .sort((a, b) => a.date.localeCompare(b.date) || a.sequence - b.sequence);
  const identities = new Set<string>();
  const ordering = new Set<string>();
  const transfers: ReplayedSecurityTransfer[] = [];
  let graphDay = '';
  const edges = new Map<string, Set<string>>();
  let currentId: string | null = null;
  try {
    for (const event of events) {
      currentId = event.id;
      if (!identity(event.id) || !nonnegative(event.sequence))
        return fail('invalid_input', event.id);
      if (identities.has(event.id)) return fail('duplicate_identity', event.id);
      identities.add(event.id);
      if (event.securityId !== input.securityId) return fail('security_mismatch', event.id);
      if (event.currency !== input.currency) return fail('unsupported_currency', event.id);
      const position = `${event.date}:${event.sequence}`;
      if (ordering.has(position)) return fail('ambiguous_order', event.id);
      ordering.add(position);

      if (event.kind === 'acquisition') {
        const state = states.get(event.accountId);
        if (!state || !positive(event.unitsE8)) return fail('invalid_input', event.id);
        if (event.basisCents === null) return fail('unknown_basis', event.id);
        if (!nonnegative(event.basisCents)) return fail('invalid_input', event.id);
        state.unitsE8 = sumValuationCents([state.unitsE8, event.unitsE8]);
        state.basisCents = sumValuationCents([state.basisCents, event.basisCents]);
        state.fragments.push({
          acquisitionId: event.id,
          acquiredOn: event.date,
          acquisitionOrder: event.sequence,
          unitsE8: event.unitsE8,
          basisCents: method === 'fifo' ? event.basisCents : null,
        });
        continue;
      }
      if (event.kind !== 'sale' && event.kind !== 'transfer')
        return fail('unsupported_event', event.id);

      let source: ReplayedSecurityHolding;
      let destination: ReplayedSecurityHolding | undefined;
      let quantity: number;
      if (event.kind === 'transfer') {
        const out = event.outgoing,
          incoming = event.incoming;
        const from = states.get(out.accountId),
          to = states.get(incoming.accountId);
        if (
          !from ||
          !to ||
          from === to ||
          !positive(incoming.unitsE8) ||
          out.unitsE8 !== -incoming.unitsE8 ||
          [out, incoming].some(
            (leg) =>
              !identity(leg.id) ||
              leg.date !== event.date ||
              leg.securityId !== event.securityId ||
              leg.currency !== event.currency,
          )
        )
          return fail('invalid_pair', event.id);
        for (const leg of [out, incoming]) {
          if (identities.has(leg.id)) return fail('duplicate_identity', event.id);
          identities.add(leg.id);
        }
        // Conservative Stage A boundary: no circular account graph on one day,
        // even if seed units could fund it. No inferred same-day ordering/lineage.
        if (graphDay !== event.date) {
          edges.clear();
          graphDay = event.date;
        }
        const pending = [incoming.accountId],
          seen = new Set<string>();
        while (pending.length) {
          const account = pending.pop()!;
          if (account === out.accountId) return fail('same_day_cycle', event.id);
          if (seen.has(account)) continue;
          seen.add(account);
          pending.push(...(edges.get(account) ?? []));
        }
        const targets = edges.get(out.accountId) ?? new Set<string>();
        targets.add(incoming.accountId);
        edges.set(out.accountId, targets);
        source = from;
        destination = to;
        quantity = incoming.unitsE8;
      } else {
        const state = states.get(event.accountId);
        if (
          !state ||
          !Number.isSafeInteger(event.unitsE8) ||
          event.unitsE8 >= 0 ||
          !nonnegative(event.netProceedsCents)
        )
          return fail('invalid_input', event.id);
        source = state;
        quantity = -event.unitsE8;
      }
      if (quantity > source.unitsE8) return fail('insufficient_units', event.id);
      const moving: SecurityAcquisitionFragment[] = [];
      const remaining: SecurityAcquisitionFragment[] = [];
      let basis = 0;
      let left = quantity;
      for (const fragment of reunite(source.fragments)) {
        let take: number;
        if (method === 'average') {
          const numerator = BigInt(fragment.unitsE8) * BigInt(quantity);
          // Never round unit lineage. A rational-provenance extension is a later stage.
          if (numerator % BigInt(source.unitsE8) !== 0n)
            return fail('nonrepresentable_units', event.id);
          take = Number(numerator / BigInt(source.unitsE8));
        } else take = Math.min(left, fragment.unitsE8);
        const cost =
          method === 'average'
            ? null
            : event.kind === 'transfer'
              ? // Owner #520: the non-divisible cent stays in the source remainder.
                Number((BigInt(fragment.basisCents!) * BigInt(take)) / BigInt(fragment.unitsE8))
              : mulDivRound(fragment.basisCents!, take, fragment.unitsE8);
        if (take > 0) moving.push({ ...fragment, unitsE8: take, basisCents: cost });
        if (take < fragment.unitsE8)
          remaining.push({
            ...fragment,
            unitsE8: fragment.unitsE8 - take,
            basisCents: cost === null ? null : fragment.basisCents! - cost,
          });
        if (cost !== null) basis = sumValuationCents([basis, cost]);
        left -= take;
      }
      if (method === 'average')
        basis =
          event.kind === 'transfer'
            ? Number((BigInt(source.basisCents) * BigInt(quantity)) / BigInt(source.unitsE8))
            : mulDivRound(source.basisCents, quantity, source.unitsE8);
      source.unitsE8 -= quantity;
      source.basisCents -= basis;
      source.fragments = remaining;
      if (event.kind === 'sale') {
        source.realizedGainCents = sumValuationCents([
          source.realizedGainCents,
          event.netProceedsCents,
          -basis,
        ]);
      } else if (destination) {
        destination.unitsE8 = sumValuationCents([destination.unitsE8, quantity]);
        destination.basisCents = sumValuationCents([destination.basisCents, basis]);
        destination.fragments = reunite([...destination.fragments, ...moving]);
        transfers.push({
          id: event.id,
          date: event.date,
          outgoing: { ...event.outgoing },
          incoming: { ...event.incoming },
          basisCents: basis,
          fragments: moving,
          cashDeltaCents: 0,
          realizedGainDeltaCents: 0,
        });
      }
    }
    return { ok: true, holdings: [...states.values()], transfers };
  } catch (error) {
    if (error instanceof RangeError) return fail('arithmetic_limit', currentId);
    throw error;
  }
}

/** Only an explicitly replayed pair can be internal; basis is never a boundary valuation. */
export function securityTransferScopeFlow(
  transfer: ReplayedSecurityTransfer,
  accountIds: readonly string[],
  valuation: { date: string; valueCents: number } | null,
): { kind: 'internal' | 'outside' | 'external'; flowCents: number } | { kind: 'unavailable' } {
  const outgoing = accountIds.includes(transfer.outgoing.accountId);
  const incoming = accountIds.includes(transfer.incoming.accountId);
  if (outgoing && incoming) return { kind: 'internal', flowCents: 0 };
  if (!outgoing && !incoming) return { kind: 'outside', flowCents: 0 };
  if (!valuation || valuation.date !== transfer.date || !nonnegative(valuation.valueCents))
    return { kind: 'unavailable' };
  return { kind: 'external', flowCents: incoming ? valuation.valueCents : -valuation.valueCents };
}
