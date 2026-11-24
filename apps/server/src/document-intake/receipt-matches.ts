import { listBookings, listPayees, schema, type Db } from '@budget/db';
import { and, eq, isNull } from 'drizzle-orm';
import { addDays } from '@budget/domain';

import {
  MATCH_WINDOW_DAYS,
  rankReceiptMatches,
  type ReceiptMatch,
  type ReceiptMatchInput,
} from './receipt-match-ranking';

/** Read the live candidates and rank them without linking a receipt. */
export function findReceiptMatches(db: Db, input: ReceiptMatchInput): ReceiptMatch[] {
  const receipted = new Set(
    db
      .select({ id: schema.bookingReceipt.bookingId })
      .from(schema.bookingReceipt)
      .innerJoin(schema.receipt, eq(schema.receipt.id, schema.bookingReceipt.receiptId))
      .where(and(isNull(schema.bookingReceipt.deletedAt), isNull(schema.receipt.deletedAt)))
      .all()
      .map((row) => row.id),
  );
  const names = new Map(listPayees(db).map((row) => [row.id, row.name]));
  const candidates = listBookings(db, {
    from: addDays(input.date, -MATCH_WINDOW_DAYS),
    to: addDays(input.date, MATCH_WINDOW_DAYS),
  });
  return rankReceiptMatches(
    candidates.map((row) => ({
      id: row.id,
      date: row.date,
      amountCents: row.amountCents,
      accountId: row.accountId,
      payee: row.payeeId ? (names.get(row.payeeId) ?? null) : null,
      currency: row.currency,
      transfer: row.transferId !== null,
      receipted: receipted.has(row.id),
    })),
    input,
  );
}
