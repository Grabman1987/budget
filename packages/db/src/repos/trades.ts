import {
  isIncomeTrade,
  moneyRuleViolation,
  settlementCents,
  unitsRuleViolation,
  type TradeKind,
} from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, isNull, lte, type SQL } from 'drizzle-orm';
import { account, INCOME_TYPES, security, trade } from '../schema';
import { insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import {
  createBooking,
  deleteTradeSettlementBooking,
  getBooking,
  updateTradeSettlementBooking,
  type SplitInput,
} from './bookings';
import { BookingInvariantError, EntityNotFoundError } from './errors';
import { assertTradeSettlementInvariants } from './invariants';
import { runInTransaction, type Executor } from './types';

export type TradeRow = typeof trade.$inferSelect;

export interface TradeInput {
  securityId: string;
  accountId: string;
  date: string;
  kind: TradeKind;
  /** Signed 1e-8 units (see `unitsRuleViolation`); 0 for the money-only kinds. */
  unitsE8?: number;
  /** Gross value in the account currency, positive. */
  amountCents: number;
  feeCents?: number;
  taxCents?: number;
  /** Makes the write idempotent per account (imports); a repeat returns the stored trade. */
  importKey?: string | null;
  note?: string | null;
  source?: 'manual' | 'import';
}

export interface TradeResult {
  trade: TradeRow;
  /** The settlement booking on the investment account; `null` when the trade moves no money. */
  bookingId: string | null;
  /** The `importKey` existed already: nothing was written. */
  duplicate: boolean;
}

export type TradePatch = Partial<
  Pick<
    TradeInput,
    'securityId' | 'date' | 'kind' | 'unitsE8' | 'amountCents' | 'feeCents' | 'taxCents' | 'note'
  >
>;

/** A trade input or change breaks a rule of the trade kinds (the message is for the owner). */
export class TradeRuleError extends RangeError {
  override readonly name = 'TradeRuleError';
}

const KIND_MEMO: Record<TradeKind, string> = {
  buy: 'Kauf',
  sell: 'Verkauf',
  delivery_in: 'Einlieferung',
  delivery_out: 'Auslieferung',
  split: 'Aktiensplit',
  dividend: 'Dividende',
  interest: 'Zinsen',
  fee: 'Gebühr',
  tax: 'Steuer',
};

interface Rules {
  kind: TradeKind;
  unitsE8: number;
  amountCents: number;
  feeCents: number;
  taxCents: number;
}

function assertRules(t: Rules): void {
  const message = unitsRuleViolation(t.kind, t.unitsE8) ?? moneyRuleViolation(t);
  if (message) throw new TradeRuleError(message);
}

function liveSecurity(tx: Executor, id: string) {
  const row = tx
    .select()
    .from(security)
    .where(and(eq(security.id, id), isNull(security.deletedAt)))
    .get();
  if (!row) throw new EntityNotFoundError('security', id);
  return row;
}

function investmentAccount(tx: Executor, id: string) {
  const row = tx
    .select()
    .from(account)
    .where(and(eq(account.id, id), isNull(account.deletedAt)))
    .get();
  if (!row) throw new EntityNotFoundError('account', id);
  if (row.role !== 'investment')
    throw new TradeRuleError('Trades are booked on an investment account (Depot, Krypto, P2P)');
  return row;
}

/** The settlement booking's split: dividends and interest are income of type Kapitalerträge. */
const settlementSplit = (kind: TradeKind, cents: number): SplitInput => ({
  categoryId: null,
  amountCents: cents,
  incomeTypeId: isIncomeTrade(kind) ? INCOME_TYPES.capital.id : null,
});

const memoOf = (kind: TradeKind, securityName: string): string =>
  `${KIND_MEMO[kind]} ${securityName}`;

/**
 * Create a trade and its settlement booking in one audit group (`undo` reverts both). The booking
 * on the investment account carries the cash effect (`settlementCents`): the savings-plan transfer
 * arrives, the buy leaves, so the depot cash stays 0. Deliveries and splits have no booking. A
 * repeated `importKey` of the account writes nothing and returns the stored trade.
 */
export function createTrade(db: Executor, input: TradeInput, ctx: AuditContext): TradeResult {
  const grouped = withGroup(ctx);
  const fields: Rules = {
    kind: input.kind,
    unitsE8: input.unitsE8 ?? 0,
    amountCents: input.amountCents,
    feeCents: input.feeCents ?? 0,
    taxCents: input.taxCents ?? 0,
  };
  assertRules(fields);
  return runInTransaction(db, (tx) => {
    if (input.importKey) {
      const existing = tx
        .select()
        .from(trade)
        .where(and(eq(trade.accountId, input.accountId), eq(trade.importKey, input.importKey)))
        .get();
      if (existing) {
        assertTradeSettlementInvariants(tx, existing.bookingId ? [existing.bookingId] : [], [
          existing.id,
        ]);
        return { trade: existing, bookingId: existing.bookingId, duplicate: true };
      }
    }
    const sec = liveSecurity(tx, input.securityId);
    investmentAccount(tx, input.accountId);
    const net = settlementCents(fields);
    const bookingId =
      net === 0
        ? null
        : createBooking(
            tx,
            {
              accountId: input.accountId,
              date: input.date,
              amountCents: net,
              memo: memoOf(input.kind, sec.name),
              source: input.source ?? 'manual',
              splits: [settlementSplit(input.kind, net)],
            },
            grouped,
          );
    const row = insertTracked(
      tx,
      trade,
      {
        id: randomUUID(),
        securityId: input.securityId,
        accountId: input.accountId,
        date: input.date,
        ...fields,
        bookingId,
        importKey: input.importKey ?? null,
        note: input.note ?? null,
      },
      grouped,
    );
    assertTradeSettlementInvariants(tx, bookingId ? [bookingId] : [], [row.id]);
    return { trade: row, bookingId, duplicate: false };
  });
}

function loadTrade(tx: Executor, id: string): TradeRow {
  const row = tx
    .select()
    .from(trade)
    .where(and(eq(trade.id, id), isNull(trade.deletedAt)))
    .get();
  if (!row) throw new EntityNotFoundError('trade', id);
  return row;
}

/** One live trade. */
export const getTrade = (db: Executor, id: string): TradeRow => loadTrade(db, id);

/**
 * Change a trade; its settlement booking follows (amount, date, memo; a trade that no longer moves
 * money loses it, one that starts to gets it) in the same audit group. A booking the owner deleted
 * stays deleted. The account and the import key do not change: delete and re-create.
 */
export function updateTrade(
  db: Executor,
  id: string,
  patch: TradePatch,
  ctx: AuditContext,
): TradeResult {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const cur = loadTrade(tx, id);
    const next: Rules = {
      kind: patch.kind ?? cur.kind,
      unitsE8: patch.unitsE8 ?? cur.unitsE8,
      amountCents: patch.amountCents ?? cur.amountCents,
      feeCents: patch.feeCents ?? cur.feeCents,
      taxCents: patch.taxCents ?? cur.taxCents,
    };
    // A kind change needs units that fit; nothing is adjusted silently.
    assertRules(next);
    const securityId = patch.securityId ?? cur.securityId;
    const sec = liveSecurity(tx, securityId);
    const date = patch.date ?? cur.date;
    const net = settlementCents(next);

    let bookingId = cur.bookingId;
    const live = cur.bookingId ? getBooking(tx, cur.bookingId) : undefined;
    if (cur.bookingId && !live)
      throw new BookingInvariantError(`Trade ${id} has a missing or deleted trade settlement`);
    if (!cur.bookingId && settlementCents(cur) !== 0)
      throw new BookingInvariantError(`Trade ${id} is missing its trade settlement`);
    if (live) {
      if (net === 0) {
        deleteTradeSettlementBooking(tx, live.id, grouped);
        bookingId = null;
      } else {
        updateTradeSettlementBooking(
          tx,
          live.id,
          {
            date,
            amountCents: net,
            memo: memoOf(next.kind, sec.name),
            splits: [settlementSplit(next.kind, net)],
          },
          grouped,
        );
      }
    } else if (!cur.bookingId && net !== 0) {
      bookingId = createBooking(
        tx,
        {
          accountId: cur.accountId,
          date,
          amountCents: net,
          memo: memoOf(next.kind, sec.name),
          splits: [settlementSplit(next.kind, net)],
        },
        grouped,
      );
    }
    updateTracked(
      tx,
      trade,
      [id],
      {
        securityId,
        date,
        ...next,
        bookingId,
        ...(patch.note !== undefined ? { note: patch.note } : {}),
      },
      grouped,
    );
    assertTradeSettlementInvariants(tx, cur.bookingId ? [cur.bookingId] : [], [id]);
    return { trade: loadTrade(tx, id), bookingId, duplicate: false };
  });
}

/** Soft-delete a trade and its settlement booking in one audit group. */
export function deleteTrade(db: Executor, id: string, ctx: AuditContext): void {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    const cur = loadTrade(tx, id);
    updateTracked(tx, trade, [id], { deletedAt: new Date().toISOString() }, grouped, 'delete');
    if (cur.bookingId) {
      if (!getBooking(tx, cur.bookingId))
        throw new BookingInvariantError(`Trade ${id} has a missing or deleted trade settlement`);
      deleteTradeSettlementBooking(tx, cur.bookingId, grouped);
    }
    assertTradeSettlementInvariants(tx, cur.bookingId ? [cur.bookingId] : [], [id]);
  });
}

export interface TradeFilter {
  accountId?: string;
  securityId?: string;
  from?: string;
  to?: string;
  includeDeleted?: boolean;
}

/** Trades by date (then id), optionally filtered; soft-deleted ones only on request. */
export function listTrades(db: Executor, filter: TradeFilter = {}): TradeRow[] {
  const where: SQL[] = [];
  if (!filter.includeDeleted) where.push(isNull(trade.deletedAt));
  if (filter.accountId) where.push(eq(trade.accountId, filter.accountId));
  if (filter.securityId) where.push(eq(trade.securityId, filter.securityId));
  if (filter.from) where.push(gte(trade.date, filter.from));
  if (filter.to) where.push(lte(trade.date, filter.to));
  return db
    .select()
    .from(trade)
    .where(and(...where))
    .orderBy(asc(trade.date), asc(trade.id))
    .all();
}
