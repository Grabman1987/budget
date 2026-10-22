import { BANK_AUTO_LINK_DAYS, bankFetchFrom } from '@budget/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { bankSyncAccount, bankSyncCandidate, booking, inboxItem } from '../schema';
import { readAssignmentCandidate, readBookingAssignments } from './assignment-rules';
import { bankBookingMatches, candidateMatches } from './bank-followups';
import { getBooking } from './bookings';
import { BookingInvariantError, ConflictError, EntityNotFoundError, ReconciledLockedError } from './errors';
import { readBankInboxSuggestion, type BankInboxRef } from './inbox-bank-suggestions';
import { runInTransaction, type Executor } from './types';

export interface BankMatchExplanation {
  ref: BankInboxRef;
  accountId: string;
  source: { id: string; fromDate: string | null; lastSyncAt: string | null; nextFetchFrom: string | null } | null;
  identity: { candidateId: string | null; storedKey: string | null; linkedBookingIds: string[] };
  revisionWarningIds: string[];
  windows: { autoLinkDays: number; suggestionDays: number; overlapDays: number };
  review: {
    available: boolean;
    candidateRevision: string | null;
    readyRevision: string | null;
    reason: string;
    competingCandidateIds: string[];
    targets: Array<{ id: string; accountId: string; date: string; dayGap: number; action: 'merge' | 'link' | 'transfer' }>;
    rules: Array<{ id: string; name: string; revision: string; automatic: boolean; available: boolean }>;
  };
}

/** Read-only explanation. Never infer source provenance or a historical decision from a hash. */
export function readBankMatchExplanation(db: Executor, ref: BankInboxRef, today: string): BankMatchExplanation {
  return runInTransaction(db, (tx) => {
    const booked = ref.type === 'booking' ? getBooking(tx, ref.id) : undefined;
    if (ref.type === 'booking' && (!booked || booked.source !== 'bank'))
      throw new EntityNotFoundError('bank_booking', ref.id);
    const candidate = ref.type === 'candidate'
      ? tx.select().from(bankSyncCandidate).where(eq(bankSyncCandidate.id, ref.id)).get()
      : booked?.importKey?.startsWith('bank-sync:')
        ? tx.select().from(bankSyncCandidate).where(and(eq(bankSyncCandidate.accountId, booked.accountId),
          eq(bankSyncCandidate.dedupeKey, booked.importKey.slice('bank-sync:'.length)))).get()
        : undefined;
    const row = ref.type === 'candidate' ? candidate : booked;
    if (!row) throw new EntityNotFoundError('bank_sync_candidate', ref.id);
    const sourceId = ref.type === 'candidate' ? candidate?.sourceId : booked?.bankSourceId;
    // Never select consent, provider credentials, raw references or account secrets into a DTO.
    const source = sourceId ? tx.select({ id: bankSyncAccount.id, accountId: bankSyncAccount.accountId,
      fromDate: bankSyncAccount.fromDate, lastSyncAt: bankSyncAccount.lastSyncAt })
      .from(bankSyncAccount).where(eq(bankSyncAccount.id, sourceId)).get() : undefined;
    const linked = candidate ? tx.select({ id: booking.id }).from(booking).where(and(
      eq(booking.accountId, candidate.accountId), eq(booking.importKey, `bank-sync:${candidate.dedupeKey}`),
      isNull(booking.deletedAt))).all() : [];
    const warnings = candidate ? tx.select({ id: inboxItem.id }).from(inboxItem).where(and(
      eq(inboxItem.kind, 'revision'), eq(inboxItem.refType, 'bank-sync'),
      eq(inboxItem.refId, candidate.id), isNull(inboxItem.resolvedAt))).all() : [];
    const competing = tx.select({ id: bankSyncCandidate.id }).from(bankSyncCandidate)
      .innerJoin(inboxItem, eq(inboxItem.id, bankSyncCandidate.id)).where(and(
        eq(bankSyncCandidate.accountId, row.accountId), eq(bankSyncCandidate.currency, row.currency),
        eq(bankSyncCandidate.date, row.date), eq(bankSyncCandidate.amountCents, row.amountCents),
        isNull(inboxItem.resolvedAt))).all().filter((other) => other.id !== candidate?.id);
    const suggestion = readBankInboxSuggestion(tx, ref, today);
    const review: BankMatchExplanation['review'] = {
      available: false, candidateRevision: null,
      readyRevision: suggestion.state === 'ready' ? suggestion.revision : null,
      reason: suggestion.label, competingCandidateIds: competing.map((other) => other.id), targets: [], rules: [],
    };
    try {
      const assignment = ref.type === 'candidate' ? readAssignmentCandidate(tx, ref.id) : readBookingAssignments(tx, ref.id);
      if ('candidateRevision' in assignment) review.candidateRevision = assignment.candidateRevision;
      review.rules = assignment.suggestions.map((rule) => ({ id: rule.id, name: rule.name,
        revision: rule.revision, automatic: rule.automatic, available: !rule.unavailable }));
      const matches = ref.type === 'candidate' ? candidateMatches(tx, ref.id) : bankBookingMatches(tx, ref.id);
      review.available = true;
      const target = (action: 'merge' | 'link' | 'transfer', item: { id: string; accountId: string; date: string }) =>
        ({ id: item.id, accountId: item.accountId, date: item.date,
          dayGap: Math.abs(Date.parse(item.date) - Date.parse(row.date)) / 86_400_000, action });
      review.targets = [...matches.merge.map((item) => target('merge', item)),
        ...('link' in matches ? matches.link.map((item) => target('link', item)) : []),
        ...('transfers' in matches ? matches.transfers.map((item) => target('transfer', item)) : [])];
    } catch (error) {
      // Resolved, locked or specially protected rows retain provenance without pretending they are actionable.
      if (!(error instanceof ConflictError || error instanceof EntityNotFoundError ||
        error instanceof ReconciledLockedError || error instanceof BookingInvariantError)) throw error;
    }
    return { ref, accountId: row.accountId,
      source: source?.accountId === row.accountId ? { id: source.id, fromDate: source.fromDate,
        lastSyncAt: source.lastSyncAt, nextFetchFrom: source.fromDate ? bankFetchFrom(source.fromDate, source.lastSyncAt) : null } : null,
      identity: { candidateId: candidate?.id ?? null, storedKey: candidate && /^[a-f0-9]{64}$/i.test(candidate.dedupeKey) ? candidate.dedupeKey : null,
        linkedBookingIds: linked.map((item) => item.id) },
      revisionWarningIds: warnings.map((item) => item.id),
      windows: { autoLinkDays: BANK_AUTO_LINK_DAYS, suggestionDays: 5, overlapDays: 21 }, review };
  });
}
