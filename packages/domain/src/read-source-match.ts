import { addDays, daysBetween, todayInVienna } from './date/date';
import { sourceInteger, type SourceMapping, type SourceOperation } from './read-source';

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
export const MATCH_RELATIVE = 0.005;

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
  | { status: 'matched'; refs: SourceMatchRef[] }
  | { status: 'informational'; reason: 'internal' | 'no_movement' }
  | { status: 'missing' }
  | { status: 'unmapped'; keys: string[] };

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
export function informationalResolution(reason: 'internal' | 'no_movement'): string {
  return reason === 'internal'
    ? `${INFORMATIONAL_RESOLUTION}: Stake/Unstake bzw. Umbuchung verschiebt Bestände innerhalb der Plattform, keine Auswirkung auf das Hauptbuch.`
    : `${INFORMATIONAL_RESOLUTION}: Nur Gebühr, Steuer oder Nullbetrag, keine eigene Buchung nötig.`;
}
/** Resolutions that the automatic matching (or the manual cut-off cleanup) may revise. */
export const AUTOMATIC_RESOLUTION_PREFIXES = [
  'Vor dem Übernahme-Stichtag',
  'Vor dem Startdatum',
  MATCHED_RESOLUTION,
  INFORMATIONAL_RESOLUTION,
];
export const isAutomaticResolution = (resolution: string | null) =>
  resolution !== null && AUTOMATIC_RESOLUTION_PREFIXES.some((p) => resolution.startsWith(p));

type Tx = SourceOperation['transactions'][number];
/** Fee, tax and platform-internal legs accompany a movement but are none themselves. */
const SECONDARY = new Set(['fee', 'tax', 'transfer', 'stake', 'unstake']);
const INTERNAL_TYPE = /(^|_)(un)?stak(e|ing)(_|$)/;

const dayOf = (iso: string): string | null => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : todayInVienna(new Date(ms));
};
const keyOf = (amount: Tx['amount']) =>
  amount.assetId ? 'asset:' + amount.assetId : 'currency:' + amount.currencyId;

interface Leg {
  opId: string;
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
}

const abs = (n: number | null) => (n === null ? null : Math.abs(n));

/** Split an operation into primary legs (trade groups collapse their cash and asset legs). */
function legsOf(op: SourceOperation): Leg[] {
  const day = (txs: Tx[]) => {
    const days = txs.map((t) => dayOf(t.creditedAt)).filter((d): d is string => d !== null);
    return days.length ? days.sort().at(-1)! : null;
  };
  const primary = op.transactions.filter((t) => !SECONDARY.has(t.type));
  const secondary = op.transactions.filter((t) => t.type === 'fee' || t.type === 'tax');
  const fees = (txs: Tx[]) =>
    txs.flatMap((t) => [abs(t.tradeFee?.cents ?? null), abs(t.fee?.cents ?? null)]);
  const centsOf = (txs: Tx[], type: string) =>
    txs
      .filter((t) => t.type === type && t.amount.cents !== null)
      .map((t) => Math.abs(t.amount.cents!));
  const legs: Leg[] = [];
  const groups = new Map<string, Tx[]>();
  for (const tx of primary) {
    const group = tx.tradeId ?? `single:${tx.id}`;
    groups.set(group, [...(groups.get(group) ?? []), tx]);
  }
  for (const txs of groups.values()) {
    const assets = txs.filter((t) => t.amount.assetId);
    const cash = txs.filter((t) => !t.amount.assetId);
    const cashTx = assets.length && cash.length === 1 ? cash[0]! : null;
    for (const tx of txs) {
      if (cashTx && !tx.amount.assetId) continue; // The cash leg is part of its asset leg.
      const asset = Boolean(tx.amount.assetId);
      const pair = asset && assets.length === 1 ? cashTx : null;
      legs.push({
        opId: op.id,
        day: day(txs),
        from: day(txs) ? addDays(day(txs)!, -MATCH_TRADE_DAYS) : '',
        to: day(txs) ? addDays(day(txs)!, MATCH_TRADE_DAYS) : '',
        key: keyOf(tx.amount),
        asset,
        incoming: tx.flow === 'INCOMING',
        unitsE8: asset ? sourceInteger(tx.amount.value, 8) : null,
        unitFee:
          asset && tx.fee?.assetId === tx.amount.assetId
            ? Math.abs(sourceInteger(tx.fee.value, 8) ?? 0)
            : 0,
        cents: asset ? (pair?.amount.cents ?? null) : tx.amount.cents,
        fees: [...fees([tx, ...(pair ? [pair] : [])]), ...centsOf(secondary, 'fee')].filter(
          (n): n is number => n !== null && n > 0,
        ),
        taxes: centsOf(secondary, 'tax').filter((n) => n > 0),
        reward: asset && !tx.tradeId,
      });
    }
  }
  return legs.filter((l) => (l.asset ? l.unitsE8 !== 0 : l.cents !== 0));
}

const within = (a: number, b: number) => Math.abs(a - b) <= MATCH_AMOUNT_CENTS;
const relative = (a: number, b: number, scale: number) =>
  scale !== 0 && Math.abs(a - b) <= Math.abs(scale) * MATCH_RELATIVE;

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
}

function tradeEdge(
  leg: Leg,
  t: SourceMatchTrade,
  index: number,
  mapping: SourceMapping,
): Edge | null {
  if (leg.day === null || t.date < leg.from || t.date > leg.to) return null;
  const buyLike = leg.incoming ? ['buy', 'delivery_in'] : ['sell', 'delivery_out'];
  if (!buyLike.includes(t.kind)) return null;
  if (t.accountId !== mapping.accountId || t.securityId !== mapping.securityId) return null;
  const distance = Math.abs(daysBetween(leg.day, t.date));
  if (distance > MATCH_TRADE_DAYS) return null;
  const units = leg.unitsE8;
  const variants = units === null ? [] : [units, units - leg.unitFee, units + leg.unitFee];
  const ledgerUnits = Math.abs(t.unitsE8);
  const unitDiff = variants.length
    ? Math.min(...variants.map((u) => Math.abs(ledgerUnits - u)))
    : null;
  const sources = sourceValues(leg);
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
    if (distance > MATCH_CASH_DAYS || !wanted.includes(b.amountCents)) continue;
    // A direct (unadjusted) value ranks before one that needed a fee or tax adjustment.
    edges.push({
      tier: b.amountCents === wanted[0] ? 1 : 2,
      distance,
      penalty: 0,
      leg: index,
      ref: { type: 'booking', id: b.id, kind: 'booking', date: b.date },
      claim: 'booking:' + b.id,
    });
  }
  if (leg.incoming)
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
      });
    }
  return edges;
}

/**
 * Verdict per operation id. Operations are evaluated together so a ledger row is claimed once.
 * Operations before `since` are not the matcher's business: callers filter them.
 */
export function matchSourceOperations(
  operations: SourceOperation[],
  mappings: SourceMapping[],
  ledger: SourceMatchLedger,
): Map<string, OperationVerdict> {
  const mapping = new Map(mappings.map((m) => [m.key, m]));
  const mappedAccounts = new Set(mappings.map((m) => m.accountId));
  const verdicts = new Map<string, OperationVerdict>();
  const todo: Array<{ op: SourceOperation; legs: Leg[] }> = [];
  const sorted = [...operations].sort(
    (a, b) =>
      (dayOf(a.transactions[0]?.creditedAt ?? '') ?? '').localeCompare(
        dayOf(b.transactions[0]?.creditedAt ?? '') ?? '',
      ) || a.id.localeCompare(b.id),
  );
  for (const op of sorted) {
    const legs = INTERNAL_TYPE.test(op.type) ? [] : legsOf(op);
    if (!legs.length) {
      verdicts.set(op.id, {
        status: 'informational',
        reason: INTERNAL_TYPE.test(op.type) ? 'internal' : 'no_movement',
      });
      continue;
    }
    const unmapped = [...new Set(legs.map((l) => l.key).filter((k) => !mapping.has(k)))];
    if (unmapped.length) verdicts.set(op.id, { status: 'unmapped', keys: unmapped });
    else todo.push({ op, legs });
  }
  const flat = todo.flatMap(({ legs }) => legs);
  const edges: Edge[] = [];
  const tradesByKey = new Map<string, SourceMatchTrade[]>();
  for (const t of ledger.trades) {
    const key = t.accountId + '|' + t.securityId;
    tradesByKey.set(key, [...(tradesByKey.get(key) ?? []), t]);
  }
  const bookingsByAccount = new Map<string, SourceMatchBooking[]>();
  for (const b of ledger.bookings)
    bookingsByAccount.set(b.accountId, [...(bookingsByAccount.get(b.accountId) ?? []), b]);
  const income = ledger.trades.filter(
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
  for (const edge of edges) {
    if (matched.has(edge.leg) || claimed.has(edge.claim)) continue;
    matched.set(edge.leg, edge.ref);
    claimed.add(edge.claim);
  }
  let index = 0;
  for (const { op, legs } of todo) {
    const refs = legs.map(() => matched.get(index++));
    verdicts.set(
      op.id,
      refs.every((r): r is SourceMatchRef => r !== undefined)
        ? { status: 'matched', refs }
        : { status: 'missing' },
    );
  }
  return verdicts;
}

/** Earliest day a source movement may be matched against (callers load ledger rows from there). */
export const matchWindowStart = (since: string | null): string | null =>
  since === null ? null : addDays(since, -MATCH_CASH_DAYS);
