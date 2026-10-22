import { and, eq, isNull, or } from 'drizzle-orm';
import { account, securityTransferPair, trade } from '../schema';
import { ConflictError } from './errors';
import { readRecordedSecurityHistory } from './security-transfer-history';
import type { Executor } from './types';

export interface PairedHistorySeed {
  accountId?: string;
  securityId?: string;
}

export interface PairedHistoryScope {
  pairId: string;
  securityId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  asOf: string;
}

/** Include only actual live pair membership. Tombstoned legs still remain reserved by the relation. */
export function pairedScopesFor(db: Executor, seeds: readonly PairedHistorySeed[]): PairedHistoryScope[] {
  const pairs = new Map<string, typeof securityTransferPair.$inferSelect>();
  for (const seed of seeds) {
    if (!seed.accountId && !seed.securityId) continue;
    const rows = seed.accountId
      ? db.select({ pair: securityTransferPair }).from(trade)
          .innerJoin(securityTransferPair, or(eq(securityTransferPair.outTradeId, trade.id),
            eq(securityTransferPair.inTradeId, trade.id)))
          .where(and(eq(trade.accountId, seed.accountId),
            seed.securityId ? eq(securityTransferPair.securityId, seed.securityId) : undefined,
            isNull(securityTransferPair.deletedAt))).limit(1001).all().map((row) => row.pair)
      : db.select().from(securityTransferPair).where(and(
          eq(securityTransferPair.securityId, seed.securityId!),
          isNull(securityTransferPair.deletedAt))).limit(1001).all();
    if (rows.length > 1000) throw new ConflictError('Die belegte Übertragshistorie überschreitet die Änderungsgrenze.');
    for (const pair of rows) pairs.set(pair.id, pair);
    if (pairs.size > 1000) throw new ConflictError('Die belegte Übertragshistorie überschreitet die Änderungsgrenze.');
  }
  return [...pairs.values()].map((pair) => {
    const out = db.select().from(trade).where(eq(trade.id, pair.outTradeId)).get();
    const incoming = db.select().from(trade).where(eq(trade.id, pair.inTradeId)).get();
    if (!out || !incoming) throw new ConflictError('Ein Übertragspaar hat keinen vollständigen Beleg.');
    return { pairId: pair.id, securityId: pair.securityId,
      sourceAccountId: out.accountId, destinationAccountId: incoming.accountId,
      asOf: out.date };
  });
}

/** The pair's two recorded legs are owned even after a grouped Undo soft-deletes the relation. */
export function assertUnpairedTrade(db: Executor, tradeId: string): void {
  if (isPairedTrade(db, tradeId))
    throw new ConflictError('Ein Übertragsschenkel kann nur als gesamte Aktion geändert werden.');
}

export function isPairedTrade(db: Executor, tradeId: string): boolean {
  return Boolean(db.select({ id: securityTransferPair.id }).from(securityTransferPair)
    .where(or(eq(securityTransferPair.outTradeId, tradeId),
      eq(securityTransferPair.inTradeId, tradeId))).get());
}

/** Validate the union of pre- and post-write components in the same transaction. */
export function assertPairedScopes(db: Executor, scopes: readonly PairedHistoryScope[],
  mutationDate?: string): void {
  const unique = new Map(scopes.map((scope) => [
    `${scope.pairId}|${scope.securityId}|${scope.sourceAccountId}|${scope.destinationAccountId}`,
    scope,
  ]));
  if (unique.size > 1000) throw new ConflictError('Die belegte Übertragshistorie überschreitet die Änderungsgrenze.');
  for (const scope of unique.values()) {
    const endpoints = [scope.sourceAccountId, scope.destinationAccountId].map((id) =>
      db.select().from(account).where(eq(account.id, id)).get());
    if (endpoints.some((row) => !row || row.openingDate > scope.asOf ||
        (row.closedAt !== null && row.closedAt.slice(0, 10) < scope.asOf)))
      throw new ConflictError('Der Übertrag liegt außerhalb der belegten Kontolaufzeit.');
    // The adapter replays the full recorded suffix regardless of asOf. For a backdated
    // edit, the lock must be checked at the edit date, not at a later pair's date.
    const history = readRecordedSecurityHistory(db, { ...scope,
      asOf: mutationDate ?? scope.asOf });
    if (!history.available)
      throw new ConflictError(`Die Übertragshistorie ist nach der Änderung widersprüchlich (${history.code}).`);
    if (mutationDate && history.writeBlockers.length > 0)
      throw new ConflictError('Ein beteiligtes Anlagekonto ist geschlossen oder am Stichtag geprüft.');
  }
}
