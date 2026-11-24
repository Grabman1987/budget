import { addDays, daysBetween, todayInVienna } from './date/date';
import {
  internalTransferKeys,
  isInternalStakeType,
  isStakeMovement,
  sourceInteger,
  sourceOperationUnreadableField,
  type SourceMapping,
  type SourceOperation,
} from './read-source';
import { summarizeOperation } from './read-source-explain';

/**
 * Reconciliation of read-source operations against the existing ledger (Abgleich). Pure and
 * read-only: it never proposes or creates ledger rows, it only says whether a counterpart exists.
 *
 * Tolerances, all documented in docs/crypto-read-source.md:
 * - trades: same mapped account and instrument, +-2 days, units within 1e-8 (tier 1), else amount
 *   within 1 cent (tier 2), else amount and units both within 0.5 % (tier 3);
 * - cash: mapped cash account, +-3 days, exact cents (a stated fee may be added or subtracted);
 * - every ledger row serves at most one source movement (best match first, deterministic).
 */
export const MATCH_TRADE_DAYS = 2;
export const MATCH_CASH_DAYS = 3;
export const MATCH_UNITS_E8 = 1;
export const MATCH_AMOUNT_CENTS = 1;
export const MATCH_RELATIVE_PER_MILLE = 5;
/** Savings plans: bank debit, platform reservation and execution lie on different days. */
export const MATCH_SAVINGS_PLAN_DAYS = 10;

export interface SourceMatchTrade {
  id: string;
  accountId: string;
  securityId: string;
  date: string;
  kind: string;
  unitsE8: number;
  amountCents: number;
  feeCents: number;
  taxCents: number;
  /** Import key of the ledger row; keys written by the source rebuild carry provider operation ids. */
  importKey?: string | null;
}
export interface SourceMatchBooking {
  id: string;
  accountId: string;
  date: string;
  amountCents: number;
}
export interface SourceMatchLedger {
  trades: SourceMatchTrade[];
  bookings: SourceMatchBooking[];
}
export interface SourceMatchRef {
  type: 'trade' | 'booking';
  id: string;
  kind: string;
  date: string;
}
export type OperationVerdict =
  | { status: 'matched'; refs: SourceMatchRef[]; by?: 'id' }
  | { status: 'informational'; reason: 'internal' | 'no_movement' | 'ignored' }
  | {
      status: 'missing';
      ambiguous?: number;
      refs?: SourceMatchRef[];
      missingLegs?: Array<{
        key: string;
        incoming: boolean;
        day: string | null;
        cents: number | null;
      }>;
    }
  | { status: 'unmapped'; keys: string[] }
  | { status: 'unreadable'; field: string };

const REF_LABELS: Record<string, string> = {
  buy: 'Kauf',
  sell: 'Verkauf',
  delivery_in: 'Einlieferung',
  delivery_out: 'Auslieferung',
  dividend: 'Dividende',
  interest: 'Zinsen',
  booking: 'Buchung',
};
const germanDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
/** Short German description of a matched ledger row, for the inbox resolution text. */
export function describeMatchRef(ref: SourceMatchRef): string {
  return `${REF_LABELS[ref.type === 'booking' ? 'booking' : ref.kind] ?? 'Trade'} ${germanDay(ref.date)}`;
}
/** Resolution text of matched items; also the prefix the re-evaluation recognises as automatic. */
export const MATCHED_RESOLUTION = 'Bereits in der App erfasst';
export const INFORMATIONAL_RESOLUTION = 'Informativ';
export function matchedResolution(refs: SourceMatchRef[]): string {
  const labels = refs.slice(0, 2).map(describeMatchRef);
  if (refs.length > 2) labels.push(`+${refs.length - 2} weitere`);
  return `${MATCHED_RESOLUTION} (${labels.join(', ')})`;
}
export function informationalResolution(reason: 'internal' | 'no_movement' | 'ignored'): string {
  if (reason === 'ignored')
    return `${INFORMATIONAL_RESOLUTION}: Bewusst nicht abgebildet, die Wallet ist in den Einstellungen als „Nicht abbilden“ markiert.`;
  return reason === 'internal'
    ? `${INFORMATIONAL_RESOLUTION}: Stake/Unstake bzw. Umbuchung verschiebt Bestände innerhalb der Plattform, keine Auswirkung auf das Hauptbuch.`
    : `${INFORMATIONAL_RESOLUTION}: Nur Gebühr, Steuer oder Nullbetrag, keine eigene Buchung nötig.`;
}
/**
 * Resolutions that the automatic matching (or the documented operator cut-off cleanup) may revise:
 * only the exact generated texts, so an owner's free text that starts alike is never overwritten.
 */
const REF_WORDS = Object.values(REF_LABELS).concat('Trade').join('|');
const DAY_REF = String.raw`(?:${REF_WORDS}) \d{2}\.\d{2}\.\d{4}`;
const MATCHED_RE = new RegExp(
  String.raw`^${MATCHED_RESOLUTION} \(${DAY_REF}(?:, ${DAY_REF})?(?:, \+\d+ weitere)?\)$`,
);
const CLEANUP_RE =
  /^Vor dem Übernahme-Stichtag \d{2}\.\d{2}\.\d{4}: Bestände stammen aus der Übernahme\.$/;
const START_DAY_RESOLUTION = 'Vor dem Startdatum – bereits in der App erfasst.';
export const isAutomaticResolution = (resolution: string | null) =>
  resolution !== null &&
  (MATCHED_RE.test(resolution) ||
    CLEANUP_RE.test(resolution) ||
    resolution === START_DAY_RESOLUTION ||
    resolution === informationalResolution('internal') ||
    resolution === informationalResolution('no_movement') ||
    resolution === informationalResolution('ignored'));

type Tx = SourceOperation['transactions'][number];
/** Fee, tax and platform-internal legs accompany a movement but are none themselves. */
const SECONDARY = new Set(['fee', 'tax', 'stake', 'unstake']);
/** Only the exact stake/unstake types are platform-internal; `staking_reward` is a reward. */
export { internalTransferKeys, isInternalStakeType } from './read-source';
const SAVINGS_PLAN_TYPE = /(^|_)savings_plan(_|$)/;
const PAIRED_TYPES = /^(buy|sell|reward|staking_reward|savings_plan)$/;

/**
 * Provider operation ids a ledger row's import key names, by the exact formats the source rebuild
 * writes: `rebuild:<operation-id>:<leg-index>` / `…:merger:in|out` (one operation) and
 * `rebuild:…:source:[<ids>]` (an aggregate that covers exactly its listed ids). Anything else
 * links nothing. `exclusive` rows serve their one operation only.
 */
export function linkedSourceIds(importKey: string | null | undefined): {
  ids: string[];
  exclusive: boolean;
} {
  if (!importKey?.startsWith('rebuild:')) return { ids: [], exclusive: false };
  const list = /:source:(\[[^\]]*\])(?::(?:div|buy))?$/.exec(importKey);
  if (list) {
    try {
      const ids: unknown = JSON.parse(list[1]!);
      if (Array.isArray(ids) && ids.every((i) => typeof i === 'string'))
        return { ids: ids as string[], exclusive: false };
    } catch {
      /* Not a readable list: links nothing. */
    }
    return { ids: [], exclusive: false };
  }
  const single = /^rebuild:([^:]+):(?:\d+|merger:(?:in|out))(?::cash.*)?$/.exec(importKey);
  return single ? { ids: [single[1]!], exclusive: true } : { ids: [], exclusive: false };
}

const dayOf = (iso: string): string | null => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : todayInVienna(new Date(ms));
};
const keyOf = (amount: Tx['amount']) =>
  amount.assetId ? 'asset:' + amount.assetId : 'currency:' + amount.currencyId;

interface Leg {
  day: string | null;
  /** Trade date window (inclusive ISO days), empty strings when the day is unknown. */
  from: string;
  to: string;
  /** `asset:` / `currency:` key of the primary leg. */
  key: string;
  asset: boolean;
  incoming: boolean;
  unitsE8: number | null;
  /** Fee in the same asset (reward commission): the ledger usually records units net of it. */
  unitFee: number;
  cents: number | null;
  /** Signed adjustments (fee, tax in cents) that may explain a difference to the ledger amount. */
  fees: number[];
  taxes: number[];
  /** Reward-like legs without cash counterpart prefer deliveries over buys. */
  reward: boolean;
  /** An explicit token reward matches by delivered units, regardless of the shown source value. */
  tokenReward: boolean;
  /** Savings-plan leg: cash may be booked up to MATCH_SAVINGS_PLAN_DAYS away (second pass only). */
  plan: boolean;
  funding: boolean;
  executionDay: string | null;
}

const abs = (n: number | null) => (n === null ? null : Math.abs(n));

/** Split an operation into primary legs (trade groups collapse their cash and asset legs). */
function legsOf(op: SourceOperation, summary: ReturnType<typeof summarizeOperation>): Leg[] {
  const day = (txs: Tx[]) => {
    const days = txs.map((t) => dayOf(t.creditedAt)).filter((d): d is string => d !== null);
    return days.length ? days.sort().at(-1)! : null;
  };
  const internal = internalTransferKeys(op);
  const primary = op.transactions.filter(
    (t) => !SECONDARY.has(t.type) && !(t.type === 'transfer' && internal.has(keyOf(t.amount))),
  );
  const secondary = op.transactions.filter((t) => t.type === 'fee' || t.type === 'tax');
  // Only fiat fees in the leg's own currency may explain a cash difference; a fee in another
  // asset (platform token) reduces that token's holding and never widens a tolerance.
  const fees = (txs: Tx[], currencyId: string | null) =>
    txs.flatMap((t) =>
      [t.tradeFee, t.fee].map((f) =>
        f && !f.assetId && f.currencyId === currencyId ? abs(f.cents) : null,
      ),
    );
  const centsOf = (txs: Tx[], type: string, currencyId: string | null) =>
    txs
      .filter(
        (t) =>
          t.type === type &&
          !t.amount.assetId &&
          t.amount.currencyId === currencyId &&
          t.amount.cents !== null,
      )
      .map((t) => Math.abs(t.amount.cents!));
  const legs: Leg[] = [];
  const groups = new Map<string, Tx[]>();
  const plan = SAVINGS_PLAN_TYPE.test(op.type);
  const isFunding = (tx: Tx) =>
    plan && tx.type === 'deposit' && !tx.amount.assetId && tx.flow === 'INCOMING';
  const executions = primary.filter((t) => t.amount.assetId && t.flow === 'INCOMING');
  const unlinkedTrade = primary.filter((t) => !t.tradeId && PAIRED_TYPES.test(t.type));
  const unlinkedPair =
    unlinkedTrade.length === 2 &&
    Boolean(unlinkedTrade[0]!.amount.assetId) !== Boolean(unlinkedTrade[1]!.amount.assetId) &&
    (unlinkedTrade[0]!.flow !== unlinkedTrade[1]!.flow || summary.class === 'reward');
  for (const tx of primary) {
    const group =
      !isFunding(tx) && tx.tradeId
        ? `trade:${tx.tradeId}`
        : unlinkedPair && unlinkedTrade.includes(tx)
          ? 'pair'
          : `single:${tx.id}`;
    groups.set(group, [...(groups.get(group) ?? []), tx]);
  }
  for (const txs of groups.values()) {
    const assets = txs.filter((t) => t.amount.assetId);
    const cash = txs.filter((t) => !t.amount.assetId);
    const cashTx =
      assets.length === 1 &&
      cash.length === 1 &&
      (cash[0]!.flow !== assets[0]!.flow || summary.class === 'reward')
        ? cash[0]!
        : null;
    for (const tx of txs) {
      if (cashTx && !tx.amount.assetId) continue; // The cash leg is part of its asset leg.
      const asset = Boolean(tx.amount.assetId);
      const pair = asset && assets.length === 1 ? cashTx : null;
      const feeCurrency = asset ? (pair?.amount.currencyId ?? null) : tx.amount.currencyId;
      const sameAsset = primary.filter((t) => t.amount.assetId === tx.amount.assetId);
      const unitFee =
        asset && sameAsset.length === 1
          ? (summary.assets.find((a) => a.assetId === tx.amount.assetId)?.feeE8 ?? 0)
          : asset && tx.fee?.assetId === tx.amount.assetId
            ? abs(sourceInteger(tx.fee.value, 8))
            : 0;
      const exactUnits = asset ? sourceInteger(tx.amount.value, 8) : null;
      const movementDay = dayOf(tx.creditedAt);
      const funding = isFunding(tx);
      legs.push({
        day: movementDay,
        from: movementDay ? addDays(movementDay, -MATCH_TRADE_DAYS) : '',
        to: movementDay ? addDays(movementDay, MATCH_TRADE_DAYS) : '',
        key: keyOf(tx.amount),
        asset,
        incoming: tx.flow === 'INCOMING',
        // An unreadable fee makes the units unknown: never treated as zero.
        unitsE8: unitFee === null ? null : exactUnits,
        unitFee: unitFee ?? 0,
        cents: asset ? (pair?.amount.cents ?? null) : tx.amount.cents,
        fees: [
          ...fees([tx, ...(pair ? [pair] : [])], feeCurrency),
          ...centsOf(secondary, 'fee', feeCurrency),
        ].filter((n): n is number => n !== null && n > 0),
        taxes: centsOf(secondary, 'tax', feeCurrency).filter((n) => n > 0),
        reward: asset && (summary.class === 'reward' || !tx.tradeId),
        tokenReward: asset && summary.class === 'reward',
        plan,
        funding,
        executionDay: funding
          ? day(tx.tradeId ? executions.filter((t) => t.tradeId === tx.tradeId) : executions)
          : null,
      });
    }
  }
  return legs.filter((l) => (l.asset ? l.unitsE8 !== 0 : l.cents !== 0));
}

const within = (a: number, b: number) => Math.abs(a - b) <= MATCH_AMOUNT_CENTS;
/** |a - b| <= 0.5 % of |scale|, in integers (MATCH_RELATIVE_PER_MILLE = 5). */
const relative = (a: number, b: number, scale: number) =>
  scale !== 0 && Math.abs(a - b) * 1000 <= Math.abs(scale) * MATCH_RELATIVE_PER_MILLE;

/** Ledger cash values of a trade that may correspond to the source cash amount. */
function tradeValues(t: SourceMatchTrade): number[] {
  const out = [t.amountCents];
  const net = t.kind === 'sell' ? t.amountCents - t.feeCents - t.taxCents : null;
  const gross = t.kind === 'buy' ? t.amountCents + t.feeCents + t.taxCents : null;
  if (net !== null) out.push(net);
  if (gross !== null) out.push(gross);
  return out;
}
const valueCache = new WeakMap<Leg, number[]>();
function sourceValues(leg: Leg): number[] {
  const cached = valueCache.get(leg);
  if (cached) return cached;
  const values = computeSourceValues(leg);
  valueCache.set(leg, values);
  return values;
}
function computeSourceValues(leg: Leg): number[] {
  if (leg.cents === null) return [];
  const base = Math.abs(leg.cents);
  if (leg.funding) return [base];
  const adjust = [0, ...leg.fees, ...leg.fees.map((f) => -f)];
  const all = new Set<number>();
  for (const a of adjust) {
    all.add(base + a);
    for (const t of leg.taxes) {
      all.add(base + a + t);
      all.add(base + a - t);
    }
  }
  return [...all];
}

interface Edge {
  tier: number;
  distance: number;
  penalty: number;
  leg: number;
  ref: SourceMatchRef;
  claim: string;
  /** Cash edges: a tie between several rows must not be resolved by guessing. */
  checkTies?: boolean;
}

function tradeEdge(
  leg: Leg,
  t: SourceMatchTrade,
  index: number,
  mapping: SourceMapping,
): Edge | null {
  if (leg.day === null || t.date < leg.from || t.date > leg.to) return null;
  if (!isPositionCounterpart(leg, t.kind)) return null;
  if (t.accountId !== mapping.accountId || t.securityId !== mapping.securityId) return null;
  const distance = Math.abs(daysBetween(leg.day, t.date));
  if (distance > MATCH_TRADE_DAYS) return null;
  const units = leg.unitsE8;
  const variants =
    units === null
      ? []
      : leg.tokenReward
        ? [units - leg.unitFee]
        : [units, units - leg.unitFee, units + leg.unitFee];
  const ledgerUnits = Math.abs(t.unitsE8);
  const unitDiff = variants.length
    ? Math.min(...variants.map((u) => Math.abs(ledgerUnits - u)))
    : null;
  const sources = leg.tokenReward ? [] : sourceValues(leg);
  const cents = sources.some((s) => tradeValues(t).some((v) => within(s, v)));
  const loose =
    sources.some((s) => tradeValues(t).some((v) => relative(s, v, v))) &&
    variants.some((u) => relative(ledgerUnits, u, u));
  const tier = unitDiff !== null && unitDiff <= MATCH_UNITS_E8 ? 1 : cents ? 2 : loose ? 3 : null;
  if (tier === null) return null;
  const preferred = leg.reward ? 'delivery' : leg.cents === null ? 'delivery' : 'trade';
  const isDelivery = t.kind.startsWith('delivery');
  return {
    tier,
    distance,
    penalty: (preferred === 'delivery') === isDelivery ? 0 : 1,
    leg: index,
    ref: { type: 'trade', id: t.id, kind: t.kind, date: t.date },
    claim: 'trade:' + t.id,
  };
}

/** Cash credits that are neither deposits nor trades may also be recorded as interest/dividend. */
const INCOME_KINDS = ['dividend', 'interest'];
const isPositionCounterpart = (leg: Leg, kind: string) =>
  leg.incoming
    ? kind === 'buy' || kind === 'delivery_in'
    : kind === 'sell' || kind === 'delivery_out';

function cashEdges(
  leg: Leg,
  index: number,
  bookings: SourceMatchBooking[],
  income: SourceMatchTrade[],
): Edge[] {
  if (leg.day === null || leg.cents === null) return [];
  const sign = leg.incoming ? 1 : -1;
  const wanted = sourceValues(leg).map((v) => v * sign);
  const edges: Edge[] = [];
  for (const b of bookings) {
    const distance = Math.abs(daysBetween(leg.day, b.date));
    const limit = leg.plan ? MATCH_SAVINGS_PLAN_DAYS : MATCH_CASH_DAYS;
    if (distance > limit || !wanted.includes(b.amountCents)) continue;
    if (leg.executionDay && Math.abs(daysBetween(leg.executionDay, b.date)) > limit) continue;
    // A direct (unadjusted) value ranks before one that needed a fee or tax adjustment; a date
    // beyond the usual window ranks after every nearer match (second pass).
    edges.push({
      tier: distance > MATCH_CASH_DAYS ? 4 : b.amountCents === wanted[0] ? 1 : 2,
      distance,
      penalty: 0,
      leg: index,
      ref: { type: 'booking', id: b.id, kind: 'booking', date: b.date },
      claim: 'booking:' + b.id,
      checkTies: true,
    });
  }
  if (leg.incoming && !leg.funding)
    for (const t of income) {
      const distance = Math.abs(daysBetween(leg.day, t.date));
      if (distance > MATCH_CASH_DAYS || !sourceValues(leg).some((v) => within(v, t.amountCents)))
        continue;
      edges.push({
        tier: 3,
        distance,
        penalty: 0,
        leg: index,
        ref: { type: 'trade', id: t.id, kind: t.kind, date: t.date },
        claim: 'trade:' + t.id,
        checkTies: true,
      });
    }
  return edges;
}

/** Join source records only on exact provider identities, independent of page order. */
export function groupSourceOperations(operations: SourceOperation[]) {
  const sorted = [...operations].sort((a, b) => a.id.localeCompare(b.id));
  const parent = sorted.map((_, index) => index);
  const root = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]!]!;
      index = parent[index]!;
    }
    return index;
  };
  const seen = new Map<string, number>();
  sorted.forEach((op, index) => {
    for (const tx of op.transactions) {
      for (const key of [`tx:${tx.id}`, ...(tx.tradeId ? [`trade:${tx.tradeId}`] : [])]) {
        const prior = seen.get(key);
        if (prior === undefined) seen.set(key, index);
        else parent[root(index)] = root(prior);
      }
    }
  });
  const groups = new Map<number, SourceOperation[]>();
  sorted.forEach((op, index) => {
    const group = root(index);
    const members = groups.get(group) ?? [];
    members.push(op);
    groups.set(group, members);
  });
  return [...groups.values()].map((members) => {
    const first = members[0]!;
    const transactions = new Map<string, Tx>();
    let conflicting = false;
    for (const member of members) {
      for (const tx of member.transactions) {
        const previous = transactions.get(tx.id);
        if (previous && JSON.stringify(previous) !== JSON.stringify(tx)) conflicting = true;
        else transactions.set(tx.id, tx);
      }
    }
    return {
      op: {
        id: first.id,
        type: members.find((member) => SAVINGS_PLAN_TYPE.test(member.type))?.type ?? first.type,
        transactions: [...transactions.values()],
      },
      members,
      conflicting,
    };
  });
}

/**
 * Verdict per operation id. Operations are evaluated together so a ledger row is claimed once.
 * Operations before `since` are not the matcher's business: callers filter them.
 */
export function matchSourceOperations(
  operations: SourceOperation[],
  mappings: SourceMapping[],
  ledger: SourceMatchLedger,
  /** Source keys the owner deliberately does not map ("Nicht abbilden"). */
  ignoredKeys: readonly string[] = [],
): Map<string, OperationVerdict> {
  const ignored = new Set(ignoredKeys);
  const mapping = new Map(mappings.map((m) => [m.key, m]));
  const mappedAccounts = new Set(mappings.map((m) => m.accountId));
  const verdicts = new Map<string, OperationVerdict>();
  const todo: Array<{ op: SourceOperation; legs: Leg[]; linkedRefs: SourceMatchRef[] }> = [];
  // Provider ids first: a ledger row written from an operation id belongs to that operation,
  // whatever its date or amount, and is not available to the heuristic matching below. A row
  // from a single operation serves that operation only; an aggregate serves exactly its listed ids.
  const byLinkedId = new Map<string, Array<{ trade: SourceMatchTrade; exclusive: boolean }>>();
  const idClaimed = new Set<string>();
  const knownIds = new Set(
    operations.flatMap((op) => [
      op.id,
      ...op.transactions.flatMap((t) => (t.tradeId ? [t.id, t.tradeId] : [t.id])),
    ]),
  );
  for (const t of ledger.trades) {
    const { ids, exclusive } = linkedSourceIds(t.importKey);
    if (ids.some((id) => knownIds.has(id))) idClaimed.add(t.id);
    for (const linked of new Set(ids))
      byLinkedId.set(linked, [...(byLinkedId.get(linked) ?? []), { trade: t, exclusive }]);
  }
  const exclusiveOwner = new Set<string>();
  const sorted = groupSourceOperations(operations).sort(
    (a, b) =>
      (dayOf(a.op.transactions[0]?.creditedAt ?? '') ?? '').localeCompare(
        dayOf(b.op.transactions[0]?.creditedAt ?? '') ?? '',
      ) || a.op.id.localeCompare(b.op.id),
  );
  const operationIds = new Set(operations.map((op) => op.id));
  for (const { op, members, conflicting } of sorted) {
    const field = conflicting ? 'transaction_id' : sourceOperationUnreadableField(op);
    if (field) {
      verdicts.set(op.id, { status: 'unreadable', field });
      continue;
    }
    const summary = summarizeOperation(op);
    const unknownAsset = summary.assets.findIndex((a) => a.netE8 === null);
    if (unknownAsset !== -1) {
      verdicts.set(op.id, {
        status: 'unreadable',
        field: `assets[${unknownAsset}].netE8`,
      });
      continue;
    }
    const internal = internalTransferKeys(op);
    const primaryFiat = op.transactions.some(
      (t) =>
        !t.amount.assetId &&
        !SECONDARY.has(t.type) &&
        !(t.type === 'transfer' && internal.has(keyOf(t.amount))),
    );
    if (primaryFiat && summary.fiatCents === null) {
      verdicts.set(op.id, { status: 'unreadable', field: 'fiatCents' });
      continue;
    }
    const movement = op.transactions.filter((t) => t.type !== 'fee' && t.type !== 'tax');
    // The other staking wallet leg can arrive as a separate operation or be absent.
    const internalOnly =
      movement.length > 0 &&
      movement.every(
        (t) => isStakeMovement(t) || (t.type === 'transfer' && internal.has(keyOf(t.amount))),
      );
    const hasOpenStakingLeg = movement.some(
      (t) =>
        (isInternalStakeType(t.type) && !isStakeMovement(t)) ||
        (isInternalStakeType(op.type) && t.type === 'transfer' && !internal.has(keyOf(t.amount))),
    );
    if (hasOpenStakingLeg) {
      verdicts.set(op.id, { status: 'missing' });
      continue;
    }
    let legs = internalOnly ? [] : legsOf(op, summary);
    const identities = new Set([
      ...members.map((member) => member.id),
      ...op.transactions.flatMap((t) =>
        [t.id, ...(t.tradeId ? [t.tradeId] : [])].filter((id) => !operationIds.has(id)),
      ),
    ]);
    const linked = new Map(
      [...identities]
        .flatMap((id) => byLinkedId.get(id) ?? [])
        .filter(({ trade, exclusive }) => !exclusive || !exclusiveOwner.has(trade.id))
        .map((link) => [link.trade.id, link]),
    );
    const linkedRefs: SourceMatchRef[] = [];
    const single = legs.filter((leg) => !leg.funding).length === 1;
    legs = legs.filter((leg) => {
      if (leg.funding) return true;
      const m = mapping.get(leg.key);
      const matches = [...linked.values()].filter(({ trade: t, exclusive }) => {
        const income = leg.incoming && INCOME_KINDS.includes(t.kind);
        if (!leg.asset) return income;
        if (m && (t.accountId !== m.accountId || t.securityId !== m.securityId)) return false;
        return isPositionCounterpart(leg, t.kind) || (leg.tokenReward && !exclusive && income);
      });
      for (const { trade: t, exclusive } of single ? matches : matches.slice(0, 1)) {
        linked.delete(t.id);
        if (exclusive) exclusiveOwner.add(t.id);
        linkedRefs.push({ type: 'trade', id: t.id, kind: t.kind, date: t.date });
      }
      return matches.length === 0;
    });
    if (!legs.length) {
      verdicts.set(
        op.id,
        linkedRefs.length
          ? { status: 'matched', refs: linkedRefs, by: 'id' }
          : {
              status: 'informational',
              reason: internalOnly ? 'internal' : 'no_movement',
            },
      );
      continue;
    }
    const unmapped = [
      ...new Set(legs.map((l) => l.key).filter((k) => !mapping.has(k) && !ignored.has(k))),
    ];
    if (unmapped.length) {
      verdicts.set(op.id, { status: 'unmapped', keys: unmapped });
      continue;
    }
    const checked = legs.filter((l) => mapping.has(l.key) || !ignored.has(l.key));
    if (!checked.length) {
      verdicts.set(
        op.id,
        linkedRefs.length
          ? { status: 'matched', refs: linkedRefs, by: 'id' }
          : { status: 'informational', reason: 'ignored' },
      );
      continue;
    }
    todo.push({ op, legs: checked, linkedRefs });
  }
  const flat = todo.flatMap(({ legs }) => legs);
  const edges: Edge[] = [];
  const tradesByKey = new Map<string, SourceMatchTrade[]>();
  const free = ledger.trades.filter((t) => !idClaimed.has(t.id));
  for (const t of free) {
    const key = t.accountId + '|' + t.securityId;
    tradesByKey.set(key, [...(tradesByKey.get(key) ?? []), t]);
  }
  const bookingsByAccount = new Map<string, SourceMatchBooking[]>();
  for (const b of ledger.bookings)
    bookingsByAccount.set(b.accountId, [...(bookingsByAccount.get(b.accountId) ?? []), b]);
  const income = free.filter(
    (t) => INCOME_KINDS.includes(t.kind) && mappedAccounts.has(t.accountId),
  );
  flat.forEach((leg, index) => {
    const m = mapping.get(leg.key)!;
    if (leg.asset)
      for (const t of tradesByKey.get(m.accountId + '|' + m.securityId) ?? []) {
        const edge = tradeEdge(leg, t, index, m);
        if (edge) edges.push(edge);
      }
    else edges.push(...cashEdges(leg, index, bookingsByAccount.get(m.accountId) ?? [], income));
  });
  edges.sort(
    (a, b) =>
      a.tier - b.tier ||
      a.distance - b.distance ||
      a.penalty - b.penalty ||
      a.leg - b.leg ||
      a.claim.localeCompare(b.claim),
  );
  const claimed = new Set<string>();
  const matched = new Map<number, SourceMatchRef>();
  const ambiguous = new Map<number, number>();
  // Edges of one level (tier, distance, penalty) compete on equal terms. Trade edges keep the
  // deterministic first-come order. Cash edges form groups of legs and rows that tie: the group is
  // matched only if it is one-to-one (as many rows as legs, so the attribution is immaterial);
  // with more candidate rows than movements the choice would be a guess, so the movements stay
  // open as ambiguous and their candidate rows are reserved, not given to somebody else.
  const levelOf = (e: Edge) => `${e.tier}|${e.distance}|${e.penalty}`;
  for (let start = 0; start < edges.length;) {
    let end = start;
    while (end < edges.length && levelOf(edges[end]!) === levelOf(edges[start]!)) end++;
    const level = edges.slice(start, end);
    start = end;
    const open = (e: Edge) => !matched.has(e.leg) && !ambiguous.has(e.leg) && !claimed.has(e.claim);
    for (const edge of level.filter((e) => !e.checkTies && open(e))) {
      if (!open(edge)) continue;
      matched.set(edge.leg, edge.ref);
      claimed.add(edge.claim);
    }
    const cash = level.filter((e) => e.checkTies && open(e));
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      while (parent.get(x) !== x) {
        parent.set(x, parent.get(parent.get(x)!)!);
        x = parent.get(x)!;
      }
      return x;
    };
    for (const e of cash)
      for (const node of ['L' + e.leg, 'C' + e.claim])
        if (!parent.has(node)) parent.set(node, node);
    for (const e of cash) parent.set(find('L' + e.leg), find('C' + e.claim));
    const groups = new Map<string, Edge[]>();
    for (const e of cash) {
      const root = find('L' + e.leg);
      groups.set(root, [...(groups.get(root) ?? []), e]);
    }
    for (const group of groups.values()) {
      const legs = [...new Set(group.map((e) => e.leg))].sort((a, b) => a - b);
      const rows = [...new Set(group.map((e) => e.claim))].sort();
      if (rows.length > legs.length) {
        for (const leg of legs) ambiguous.set(leg, rows.length);
        for (const row of rows) claimed.add(row);
        continue;
      }
      // One row per movement (augmenting paths), in a fixed order.
      const owner = new Map<string, Edge>();
      const assign = (leg: number, seen: Set<string>): boolean => {
        for (const e of group.filter((x) => x.leg === leg)) {
          if (seen.has(e.claim)) continue;
          seen.add(e.claim);
          const holder = owner.get(e.claim);
          if (!holder || assign(holder.leg, seen)) {
            owner.set(e.claim, e);
            return true;
          }
        }
        return false;
      };
      for (const leg of legs) assign(leg, new Set());
      for (const e of owner.values()) {
        matched.set(e.leg, e.ref);
        claimed.add(e.claim);
      }
    }
  }
  let index = 0;
  for (const { op, legs, linkedRefs } of todo) {
    const refs = legs.map(() => matched.get(index++));
    const candidates = Math.max(
      0,
      ...legs.map((_, i) => ambiguous.get(index - legs.length + i) ?? 0),
    );
    const missing = {
      refs: [...linkedRefs, ...refs.filter((r): r is SourceMatchRef => r !== undefined)],
      missingLegs: legs
        .filter((_, i) => refs[i] === undefined)
        .map((l) => ({
          key: l.key,
          incoming: l.incoming,
          day: l.day,
          cents: l.cents,
        })),
    };
    verdicts.set(
      op.id,
      refs.every((r): r is SourceMatchRef => r !== undefined)
        ? { status: 'matched', refs: missing.refs, ...(linkedRefs.length ? { by: 'id' } : {}) }
        : candidates > 0
          ? { status: 'missing', ambiguous: candidates, ...missing }
          : { status: 'missing', ...missing },
    );
  }
  for (const { op, members } of sorted)
    for (const member of members)
      if (member.id !== op.id) verdicts.set(member.id, verdicts.get(op.id)!);
  return verdicts;
}

/** Earliest day a source movement may be matched against (callers load ledger rows from there). */
export const matchWindowStart = (since: string | null): string | null =>
  since === null ? null : addDays(since, -MATCH_CASH_DAYS);
