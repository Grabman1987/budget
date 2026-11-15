import { schema, type Db } from '@budget/db';
import {
  parseTradeConfirmation,
  tradeProposalFromConfirmation,
  type TradeConfirmationIntake,
} from '@budget/domain';
import { and, eq, isNull, like, or } from 'drizzle-orm';

/**
 * Read-only trade form proposal for a broker trade confirmation (#1099). Nothing is stored: the
 * instrument is matched by its printed ISIN, and a live trade that already records the
 * confirmation is reported as a duplicate, either by the import key an earlier confirmed upload
 * left on its trade or by the same instrument, day, kind, quantity and gross amount (a trade
 * typed in by hand, or a confirmed savings plan execution).
 */
export function tradeConfirmationIntake(
  db: Db,
  text: string,
  sha256: string,
): TradeConfirmationIntake {
  const proposal = tradeProposalFromConfirmation(parseTradeConfirmation(text, sha256));
  const { trade, security } = schema;

  const isin = proposal.instrument?.isin;
  const securities = isin
    ? db
        .select({ id: security.id })
        .from(security)
        .where(and(eq(security.isin, isin), isNull(security.deletedAt)))
        .all()
    : [];
  // Two live instruments with one ISIN are ambiguous: the owner chooses.
  const securityId = securities.length === 1 ? securities[0]!.id : null;

  // Earlier uploads of this confirmation: the reference itself, or `reference#n` after a deleted
  // trade (the import key of a deleted trade stays taken for its account).
  const keyed = db
    .select({
      importKey: trade.importKey,
      id: trade.id,
      securityId: trade.securityId,
      date: trade.date,
      deletedAt: trade.deletedAt,
    })
    .from(trade)
    .where(
      or(eq(trade.importKey, proposal.reference), like(trade.importKey, `${proposal.reference}#%`)),
    )
    .all()
    // LIKE ignores ASCII case; the key match is exact.
    .filter(
      (row) =>
        row.importKey === proposal.reference || row.importKey?.startsWith(`${proposal.reference}#`),
    );
  // Next free suffix: one above the highest used, not the count.
  const used = keyed.map((row) => Number(row.importKey!.split('#')[1] ?? 1));
  const nextSuffix = Math.max(0, ...used.filter(Number.isInteger)) + 1;
  let live: { id: string; securityId: string; date: string } | undefined = keyed.find(
    (row) => row.deletedAt === null,
  );
  if (
    !live &&
    securityId &&
    proposal.kind &&
    proposal.date &&
    proposal.unitsE8 !== null &&
    proposal.amountCents !== null
  )
    live = db
      .select({ id: trade.id, securityId: trade.securityId, date: trade.date })
      .from(trade)
      .where(
        and(
          eq(trade.securityId, securityId),
          eq(trade.date, proposal.date),
          eq(trade.kind, proposal.kind),
          eq(trade.unitsE8, proposal.kind === 'sell' ? -proposal.unitsE8 : proposal.unitsE8),
          eq(trade.amountCents, proposal.amountCents),
          isNull(trade.deletedAt),
          // A trade with an import key records another confirmation; only hand-entered trades
          // and confirmed savings plan executions (no key) are matched by their figures.
          isNull(trade.importKey),
        ),
      )
      .get();
  return {
    proposal,
    securityId,
    importKey: keyed.length ? `${proposal.reference}#${nextSuffix}` : proposal.reference,
    duplicate: live ? { tradeId: live.id, securityId: live.securityId, date: live.date } : null,
  };
}
