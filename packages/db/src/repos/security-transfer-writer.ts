import { createHash, randomUUID } from 'node:crypto';
import { replayKnownSecurityTransfers } from '@budget/domain';
import { desc, eq } from 'drizzle-orm';
import { account, securityTransferPair, trade } from '../schema';
import { insertTracked, withGroup, type AuditContext } from './audit';
import { ConflictError } from './errors';
import { readRecordedSecurityHistory } from './security-transfer-history';
import { assertPairedScopes, pairedScopesFor } from './security-transfer-invariants';
import { runInTransaction, type Executor } from './types';

export interface RecordedSecurityTransferWrite {
  securityId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  date: string;
  unitsE8: number;
  sourceReference?: string | null;
  intentKey: string;
  /** Current-history fingerprint from the read-only preview, not a basis or lot supplied by the client. */
  factFingerprint: string;
}

const validDay = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/** Atomic repository action. No HTTP apply route calls it at this source-only checkpoint. */
export function writeRecordedSecurityTransfer(db: Executor, input: RecordedSecurityTransferWrite,
  ctx: AuditContext) {
  const sourceReference = input.sourceReference?.trim() || null;
  if (!input.securityId || !input.sourceAccountId || !input.destinationAccountId ||
      input.sourceAccountId === input.destinationAccountId || !validDay(input.date) ||
      !Number.isSafeInteger(input.unitsE8) || input.unitsE8 <= 0 ||
      !input.intentKey || input.intentKey.trim() !== input.intentKey ||
      input.intentKey.length > 128 ||
      !/^[a-f0-9]{64}$/i.test(input.factFingerprint) ||
      (sourceReference !== null && sourceReference.length > 200))
    throw new ConflictError('Der Wertpapierübertrag hat ungültige Angaben.');
  const intentHash = createHash('sha256').update(JSON.stringify({ version: 1,
    securityId: input.securityId, sourceAccountId: input.sourceAccountId,
    destinationAccountId: input.destinationAccountId, date: input.date,
    unitsE8: input.unitsE8, sourceReference })).digest('hex');
  return runInTransaction(db, (tx) => {
    // The durable key wins over a refreshed preview, including after grouped Undo.
    const existing = tx.select().from(securityTransferPair)
      .where(eq(securityTransferPair.intentKey, input.intentKey)).get();
    if (existing) {
      if (existing.intentHash !== intentHash)
        throw new ConflictError('Dieser Übertragsschlüssel wurde bereits anders verwendet.');
      const out = tx.select().from(trade).where(eq(trade.id, existing.outTradeId)).get();
      const incoming = tx.select().from(trade).where(eq(trade.id, existing.inTradeId)).get();
      if (!out || !incoming || existing.securityId !== input.securityId ||
          out.accountId !== input.sourceAccountId ||
          incoming.accountId !== input.destinationAccountId ||
          out.securityId !== input.securityId || incoming.securityId !== input.securityId ||
          out.date !== input.date || incoming.date !== input.date ||
          out.unitsE8 !== -input.unitsE8 || incoming.unitsE8 !== input.unitsE8 ||
          (existing.deletedAt === null && (out.deletedAt !== null || incoming.deletedAt !== null)))
        throw new ConflictError('Der gespeicherte Übertragsschlüssel hat widersprüchliche Belege.');
      if (existing.deletedAt === null)
        assertPairedScopes(tx, pairedScopesFor(tx, [
          { accountId: input.sourceAccountId, securityId: input.securityId },
          { accountId: input.destinationAccountId, securityId: input.securityId },
        ]));
      return { pair: existing, duplicate: true, live: existing.deletedAt === null,
        groupId: existing.auditGroupId };
    }
    const accounts = [input.sourceAccountId, input.destinationAccountId].map((id) =>
      tx.select().from(account).where(eq(account.id, id)).get());
    if (accounts.some((row) => !row || row.deletedAt !== null || row.closedAt !== null ||
        row.role !== 'investment' || row.onBudget || row.currency !== 'EUR' ||
        row.openingDate > input.date))
      throw new ConflictError('Beide Konten müssen offene budgetfreie EUR-Anlagekonten sein.');
    const history = readRecordedSecurityHistory(tx, { securityId: input.securityId,
      sourceAccountId: input.sourceAccountId,
      destinationAccountId: input.destinationAccountId, asOf: input.date });
    if (!history.available)
      throw new ConflictError(`Die belegte Übertragshistorie ist nicht schlüssig (${history.code}).`);
    if (history.factFingerprint !== input.factFingerprint)
      throw new ConflictError('Die Buchungshistorie hat sich seit der Vorschau geändert.');
    if (history.writeBlockers.length)
      throw new ConflictError('Ein Konto ist geschlossen oder der Stichtag bereits geprüft.');
    if (history.fullInput.events.some((event) => event.date === input.date &&
        (event.kind === 'sell' || event.kind === 'split') &&
        (event.accountId === input.sourceAccountId ||
          event.accountId === input.destinationAccountId)))
      throw new ConflictError('Die Reihenfolge am Übertragstag ist nicht belegt.');
    const before = pairedScopesFor(tx, [
      { accountId: input.sourceAccountId, securityId: input.securityId },
      { accountId: input.destinationAccountId, securityId: input.securityId },
    ]);
    const lastOrder = tx.select({ order: securityTransferPair.creationOrder })
      .from(securityTransferPair).orderBy(desc(securityTransferPair.creationOrder)).limit(1).get()?.order ?? 0;
    if (!Number.isSafeInteger(lastOrder) || lastOrder >= Number.MAX_SAFE_INTEGER)
      throw new ConflictError('Die Übertragsreihenfolge ist nicht mehr darstellbar.');
    const pairId = randomUUID(), outTradeId = randomUUID(), inTradeId = randomUUID();
    const proposal = replayKnownSecurityTransfers({ ...history.fullInput,
      events: [...history.fullInput.events, { id: pairId, date: input.date,
        sequence: history.fullInput.events.filter((event) => event.date === input.date).length,
        securityId: input.securityId, currency: 'EUR', kind: 'transfer',
        sourceAccountId: input.sourceAccountId,
        destinationAccountId: input.destinationAccountId, unitsE8: input.unitsE8,
        outTradeId, inTradeId }],
    });
    if (!proposal.available || !proposal.transfers.some((row) => row.pairId === pairId))
      throw new ConflictError('Der vollständige spätere Verlauf trägt den Übertrag nicht.');
    const grouped = withGroup(ctx);
    insertTracked(tx, trade, { id: outTradeId, securityId: input.securityId,
      accountId: input.sourceAccountId, date: input.date, kind: 'delivery_out',
      unitsE8: -input.unitsE8, amountCents: 0, feeCents: 0, taxCents: 0,
      bookingId: null, note: sourceReference }, grouped);
    insertTracked(tx, trade, { id: inTradeId, securityId: input.securityId,
      accountId: input.destinationAccountId, date: input.date, kind: 'delivery_in',
      unitsE8: input.unitsE8, amountCents: 0, feeCents: 0, taxCents: 0,
      bookingId: null, note: sourceReference }, grouped);
    const pair = insertTracked(tx, securityTransferPair, { id: pairId,
      securityId: input.securityId, outTradeId, inTradeId,
      creationOrder: lastOrder + 1, sourceReference,
      intentKey: input.intentKey, intentHash, auditGroupId: grouped.groupId }, grouped);
    const after = readRecordedSecurityHistory(tx, { securityId: input.securityId,
      sourceAccountId: input.sourceAccountId,
      destinationAccountId: input.destinationAccountId, asOf: input.date });
    if (!after.available || !after.relevantPairIds.includes(pairId))
      throw new ConflictError('Der gespeicherte Übertrag verletzt die belegte Depot-Historie.');
    assertPairedScopes(tx, [...before, ...pairedScopesFor(tx, [
      { accountId: input.sourceAccountId, securityId: input.securityId },
      { accountId: input.destinationAccountId, securityId: input.securityId },
    ])], input.date);
    return { pair, duplicate: false, live: true, groupId: grouped.groupId };
  });
}
