import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  matchSourceOperations,
  todayInVienna,
  type SourceMatchLedger,
  type OperationVerdict,
  type SourceMapping,
  type SourceOperation,
} from '@budget/domain';
import { booking, inboxItem, trade } from '../schema';
import type { Executor } from './types';

type InboxRow = typeof inboxItem.$inferSelect;

/** Calendar day (Vienna) of the latest transaction, or null when it is unknown. */
export function operationDay(op: { transactions?: Array<{ creditedAt: string }> }): string | null {
  const times = (Array.isArray(op.transactions) ? op.transactions : [])
    .map((t) => Date.parse(t.creditedAt))
    .filter((t) => !Number.isNaN(t));
  return times.length ? todayInVienna(new Date(Math.max(...times))) : null;
}

/** Operation inbox items of the read source with their parsed source facts. */
export function stagedOperations(
  db: Executor,
): Array<{ row: InboxRow; op: SourceOperation; day: string | null }> {
  const out: Array<{ row: InboxRow; op: SourceOperation; day: string | null }> = [];
  for (const row of db.select().from(inboxItem).where(eq(inboxItem.refType, 'read_source')).all()) {
    if (row.kind !== 'import' || !row.detail) continue;
    try {
      const op = JSON.parse(row.detail) as SourceOperation;
      if (!op || typeof op !== 'object' || !Array.isArray(op.transactions)) continue;
      out.push({ row, op, day: operationDay(op) });
    } catch {
      /* Not a readable operation item. */
    }
  }
  return out;
}

/**
 * Ledger rows a source movement may correspond to: trades of the mapped accounts and bookings of
 * the mapped cash accounts. Settlement bookings of trades and transfers between two mapped
 * accounts (cash to depot) are internal to the platform and never count as deposits/withdrawals.
 */
export function loadMatchLedger(db: Executor, mappings: SourceMapping[]): SourceMatchLedger {
  const accountIds = [...new Set(mappings.map((m) => m.accountId))];
  if (!accountIds.length) return { trades: [], bookings: [] };
  const trades = db
    .select()
    .from(trade)
    .where(and(inArray(trade.accountId, accountIds), isNull(trade.deletedAt)))
    .all();
  const settlement = new Set(trades.flatMap((t) => (t.bookingId ? [t.bookingId] : [])));
  const rows = db
    .select()
    .from(booking)
    .where(and(inArray(booking.accountId, accountIds), isNull(booking.deletedAt)))
    .all();
  const transferLegs = new Map<string, number>();
  for (const b of rows)
    if (b.transferId) transferLegs.set(b.transferId, (transferLegs.get(b.transferId) ?? 0) + 1);
  const cashAccounts = new Set(mappings.filter((m) => !m.securityId).map((m) => m.accountId));
  return {
    trades: trades.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      securityId: t.securityId,
      date: t.date,
      kind: t.kind,
      unitsE8: t.unitsE8,
      amountCents: t.amountCents,
      feeCents: t.feeCents,
      taxCents: t.taxCents,
    })),
    bookings: rows
      .filter(
        (b) =>
          cashAccounts.has(b.accountId) &&
          !settlement.has(b.id) &&
          (!b.transferId || (transferLegs.get(b.transferId) ?? 0) < 2),
      )
      .map((b) => ({
        id: b.id,
        accountId: b.accountId,
        date: b.date,
        amountCents: b.amountCents,
      })),
  };
}

/**
 * Verdicts for every staged operation on/after `since` plus `extra` (operations of the page being
 * staged, which win over their stored versions). All are matched together so that a ledger row
 * counts for one source movement only.
 */
export function evaluateReadSource(
  db: Executor,
  mappings: SourceMapping[],
  since: string | null,
  extra: SourceOperation[] = [],
): Map<string, OperationVerdict> {
  const byId = new Map<string, SourceOperation>();
  for (const { op, day } of stagedOperations(db))
    if (since === null || day === null || day >= since) byId.set(op.id, op);
  for (const op of extra) {
    const day = operationDay(op);
    if (since === null || day === null || day >= since) byId.set(op.id, op);
    else byId.delete(op.id);
  }
  return matchSourceOperations([...byId.values()], mappings, loadMatchLedger(db, mappings));
}
