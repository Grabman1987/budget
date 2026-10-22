import { createHash } from 'node:crypto';
import { addDays, canLinkTransfer } from '@budget/domain';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { account, bankSyncAccount, bankSyncCandidate, booking, category, inboxItem } from '../schema';
import { withGroup, type AuditContext, type GroupedContext } from './audit';
import {
  applyBookingAssignment, deferLearning, readAssignmentCandidate, readBookingAssignments,
} from './assignment-rules';
import { bankBookingMatches, candidateMatches, mergeBankBooking, mergeBankCandidate, unlinkedBankTargets } from './bank-followups';
import { getBooking, updateBooking } from './bookings';
import { BookingInvariantError, ConflictError, EntityNotFoundError, ReconciledLockedError } from './errors';
import type { InboxEntry } from './inbox';
import { runInTransaction, type Executor } from './types';

export interface BankInboxRef { type: 'candidate' | 'booking'; id: string }
type Prepared =
  | { action: 'merge'; bookingId: string; candidateRevision?: string }
  | { action: 'rule'; ruleId: string; revision: string; candidateRevision?: string };
export type BankInboxSuggestion = BankInboxRef & (
  | { state: 'review'; label: string }
  | { state: 'ready'; label: string; revision: string; prepared: Prepared }
);
export interface BankInboxAcceptance extends BankInboxRef { revision?: string }
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const needsReview = (ref: BankInboxRef, reason: string): BankInboxSuggestion =>
  ({ ...ref, state: 'review', label: `Vorschlag prüfen · ${reason}` });

export function bankInboxRef(entry: InboxEntry): BankInboxRef | null {
  if (entry.type === 'stored' && entry.refType === 'bank-sync-candidate' && entry.refId)
    return { type: 'candidate', id: entry.refId };
  if (entry.type === 'booking' && entry.source === 'bank' && entry.status !== 'reconciled')
    return { type: 'booking', id: entry.bookingId };
  return null;
}

const simple = (row: NonNullable<ReturnType<typeof getBooking>>) =>
  !row.transferId && !row.originalCurrency && row.splits.length === 1 &&
  row.splits.every((split) => !split.transferId && !split.contactId);
const unclassified = (split: NonNullable<ReturnType<typeof getBooking>>['splits'][number]) =>
  !split.categoryId && !split.incomeTypeId && !split.transferId && split.amountCents !== 0;

/** Conservative projection only: ranking never turns ambiguity into permission to write. */
export function readBankInboxSuggestion(db: Executor, ref: BankInboxRef, today: string): BankInboxSuggestion {
  try {
    const candidate = ref.type === 'candidate' ? readAssignmentCandidate(db, ref.id) : null;
    const booked = ref.type === 'booking' ? getBooking(db, ref.id) : null;
    const row = candidate?.candidate ?? booked;
    if (!row || row.date > today || row.amountCents === 0)
      return needsReview(ref, 'Umsatz nicht verfügbar');
    if (candidate && candidate.candidate.bankStatus !== 'booked')
      return needsReview(ref, 'Bankumsatz ist noch vorgemerkt');
    if (candidate) {
      const item = db.select().from(inboxItem).where(eq(inboxItem.id, ref.id)).get();
      if (!item || item.resolvedAt || item.refType !== 'bank-sync-candidate' || item.refId !== ref.id)
        return needsReview(ref, 'Bankumsatz ist nicht mehr offen');
    }
    if (booked && (booked.source !== 'bank' || booked.status !== 'pending' ||
      !simple(booked) || !booked.splits.some(unclassified)))
      return needsReview(ref, 'Buchung einzeln zuordnen');
    const acct = db.select().from(account).where(and(eq(account.id, row.accountId), isNull(account.deletedAt))).get();
    const sourceId = candidate ? candidate.candidate.sourceId : booked?.bankSourceId;
    const source = sourceId ? db.select({ id: bankSyncAccount.id, accountId: bankSyncAccount.accountId })
      .from(bankSyncAccount).where(eq(bankSyncAccount.id, sourceId)).get() : undefined;
    if (!acct || acct.closedAt || row.date < acct.openingDate || (booked && !acct.onBudget) ||
      acct.currency !== row.currency || !source || source.accountId !== row.accountId)
      return needsReview(ref, 'Konto oder Bankquelle prüfen');
    if (candidate?.existingTransfer) return needsReview(ref, 'Bestehende Umbuchung einzeln prüfen');
    if (candidate && db.select({ id: booking.id }).from(booking).where(and(
      eq(booking.accountId, row.accountId),
      eq(booking.importKey, `bank-sync:${candidate.candidate.dedupeKey}`),
    )).get()) return needsReview(ref, 'Vorhandene Bankreferenz einzeln prüfen');

    // Equal bank rows can compete for one own booking even when they are on different pages.
    const competing = db.select({ id: bankSyncCandidate.id }).from(bankSyncCandidate)
      .innerJoin(inboxItem, eq(inboxItem.id, bankSyncCandidate.id))
      .where(and(eq(bankSyncCandidate.accountId, row.accountId), eq(bankSyncCandidate.date, row.date),
        eq(bankSyncCandidate.amountCents, row.amountCents), isNull(inboxItem.resolvedAt))).all();
    if (competing.some((other) => other.id !== (candidate ? ref.id : '')))
      return needsReview(ref, 'Gleichartige offene Bankumsätze');

    const otherBookings = db.select().from(booking).where(and(isNull(booking.deletedAt),
      eq(booking.currency, row.currency), eq(booking.amountCents, -row.amountCents),
      gte(booking.date, addDays(row.date, -5)), lte(booking.date, addDays(row.date, 5)))).all();
    const otherCandidates = db.select({ id: bankSyncCandidate.id, accountId: bankSyncCandidate.accountId,
      date: bankSyncCandidate.date, amountCents: bankSyncCandidate.amountCents, currency: bankSyncCandidate.currency })
      .from(bankSyncCandidate).innerJoin(inboxItem, eq(inboxItem.id, bankSyncCandidate.id))
      .where(and(isNull(inboxItem.resolvedAt), eq(bankSyncCandidate.currency, row.currency),
        eq(bankSyncCandidate.amountCents, -row.amountCents), gte(bankSyncCandidate.date, addDays(row.date, -5)),
        lte(bankSyncCandidate.date, addDays(row.date, 5)))).all();
    if ([...otherBookings, ...otherCandidates].some((other) => canLinkTransfer(row, other)))
      return needsReview(ref, 'Mögliche Umbuchung');
    const candidateOptions = candidate ? candidateMatches(db, ref.id) : null;
    const matches = candidateOptions ?? bankBookingMatches(db, ref.id);
    if (candidateOptions?.transfers.length) return needsReview(ref, 'Mögliche Umbuchung');
    // A link keeps the target's own bank date/status and needs an individual decision.
    if (candidateOptions?.link.length) return needsReview(ref, 'Geschützte passende Buchung');
    const alternatives = matches.merge;
    const possible = unlinkedBankTargets(db, row.accountId, addDays(row.date, -5), addDays(row.date, 5))
      .filter((other) => other.id !== row.id && other.currency === row.currency && other.amountCents === row.amountCents);
    if (possible.some((other) => !alternatives.some((match) => match.id === other.id)))
      return needsReview(ref, 'Weitere oder geschützte passende Buchung');
    if (alternatives.length > 1) return needsReview(ref, 'Mehrere passende Buchungen');
    const target = alternatives[0] ? getBooking(db, alternatives[0].id) : undefined;
    if (target) {
      if (target.date !== row.date || target.amountCents !== row.amountCents ||
        target.currency !== row.currency || !simple(target) || target.status === 'reconciled' ||
        target.splits.some(unclassified))
        return needsReview(ref, 'Datum, Zuordnung oder geschützte Anteile prüfen');
      const prepared: Prepared = { action: 'merge', bookingId: target.id,
        ...(candidate ? { candidateRevision: candidate.candidateRevision } : {}) };
      return { ...ref, state: 'ready', label: `Mit vorhandener Buchung vom ${target.date} zusammenführen`,
        revision: hash([row, source, candidate?.candidateRevision, matches, target]), prepared };
    }
    const review = candidate ?? readBookingAssignments(db, ref.id);
    const rule = review.suggestions[0];
    if (review.suggestions.length !== 1 || !rule || rule.unavailable ||
      (!rule.automatic && !rule.id.startsWith('inbox-learn:')))
      return needsReview(ref, review.suggestions.length > 1 ? 'Mehrere Regeln' : 'Keine eindeutige Regel');
    if (rule.actions.splits || rule.actions.transferAccountId || rule.actions.accountId ||
      Boolean(rule.actions.categoryId) === Boolean(rule.actions.incomeTypeId))
      return needsReview(ref, 'Regel mit besonderer Zuordnung');
    if (rule.actions.categoryId) {
      const destination = db.select({ kind: category.kind }).from(category)
        .where(eq(category.id, rule.actions.categoryId)).get();
      if (!destination || ['advance', 'card_payment', 'income'].includes(destination.kind))
        return needsReview(ref, 'Kategorie einzeln prüfen');
    }
    const prepared: Prepared = { action: 'rule', ruleId: rule.id, revision: rule.revision,
      ...(candidate ? { candidateRevision: candidate.candidateRevision } : {}) };
    return { ...ref, state: 'ready', label: rule.name,
      revision: hash([row, source, candidate?.candidateRevision, matches, rule, review.cleanup]), prepared };
  } catch (error) {
    if (error instanceof ConflictError || error instanceof EntityNotFoundError ||
      error instanceof ReconciledLockedError || error instanceof BookingInvariantError)
      return needsReview(ref, 'Geschützte oder geänderte Buchung');
    throw error;
  }
}

/** Call inside the paged list's read transaction; legacy unbounded responses stay unchanged. */
export function prepareBankInboxEntries<T extends InboxEntry>(db: Executor, entries: readonly T[], today: string) {
  const suggestions = entries.slice(0, 100).map((entry) => {
    const ref = bankInboxRef(entry);
    return ref ? readBankInboxSuggestion(db, ref, today) : null;
  });
  const targets = new Map<string, number>();
  for (const suggestion of suggestions)
    if (suggestion?.state === 'ready' && suggestion.prepared.action === 'merge')
      targets.set(suggestion.prepared.bookingId, (targets.get(suggestion.prepared.bookingId) ?? 0) + 1);
  return entries.map((entry, index) => {
    let suggestion = suggestions[index];
    if (suggestion?.state === 'ready' && suggestion.prepared.action === 'merge' &&
      (targets.get(suggestion.prepared.bookingId) ?? 0) > 1)
      suggestion = needsReview(suggestion, 'Zielbuchung wird mehrfach vorgeschlagen');
    return suggestion ? { ...entry, bankSuggestion: suggestion } : entry;
  });
}

/** Fresh CAS validation precedes every writer; any failure rolls back the entire audit group. */
export function acceptSafeBankInbox(
  db: Executor,
  rows: readonly BankInboxAcceptance[],
  expectedChanged: number,
  today: string,
  now: string,
  context: AuditContext,
  confirmCandidate?: (id: string, prepared: Extract<Prepared, { action: 'rule' }>, context: GroupedContext) => { bookingId: string },
) {
  return runInTransaction(db, (tx) => {
    const grouped = withGroup(context);
    const ready: Array<Extract<BankInboxSuggestion, { state: 'ready' }>> = [];
    const targets = new Set<string>();
    for (const row of rows) {
      // A row the owner saw as "prüfen" can never become accepted during this request.
      if (!row.revision) continue;
      const fresh = readBankInboxSuggestion(tx, row, today);
      if (fresh.state !== 'ready' || fresh.revision !== row.revision)
        throw new ConflictError('Ein Bankvorschlag hat sich geändert. Bitte neu laden.');
      if (fresh.prepared.action === 'merge') {
        if (targets.has(fresh.prepared.bookingId))
          throw new ConflictError('Mehrere Bankumsätze würden dieselbe Buchung übernehmen.');
        targets.add(fresh.prepared.bookingId);
      }
      if (fresh.type === 'candidate' && fresh.prepared.action === 'rule' && !confirmCandidate)
        throw new ConflictError('Bankbestätigung nicht verfügbar.');
      ready.push(fresh);
    }
    if (ready.length !== expectedChanged)
      throw new ConflictError('Die sichere Auswahl hat sich geändert. Bitte neu laden.');
    const accepted: string[] = [];
    deferLearning(() => {
      for (const item of ready) {
        if (item.prepared.action === 'merge') {
          if (item.type === 'candidate') mergeBankCandidate(tx, item.id, item.prepared.bookingId, grouped, now);
          else mergeBankBooking(tx, item.id, item.prepared.bookingId, grouped);
        } else if (item.type === 'candidate') confirmCandidate!(item.id, item.prepared, grouped);
        else {
          applyBookingAssignment(tx, item.id, item.prepared.ruleId, grouped, item.prepared.revision);
          const applied = getBooking(tx, item.id)!;
          if (applied.splits.some(unclassified)) throw new ConflictError('Zuordnung ist noch unvollständig.');
          if (applied.status !== 'confirmed') updateBooking(tx, item.id, { status: 'confirmed' }, grouped);
        }
        accepted.push(item.type === 'booking' ? `booking:${item.id}` : item.id);
      }
    });
    return { groupId: grouped.groupId, changedCount: ready.length,
      skippedCount: rows.length - ready.length, accepted };
  });
}

/** Bounded review-round membership, including accepted rows no longer on the loaded page. */
export function readBankReviewRound(db: Executor, rows: readonly BankInboxRef[], today: string) {
  return runInTransaction(db, (tx) => {
    const states: Record<string, 'open' | 'closed' | 'unknown'> = {};
    const bookingOpen = (id: string) => {
      const row = getBooking(tx, id, { includeDeleted: true });
      if (!row) return 'unknown' as const;
      if (row.deletedAt) return 'closed' as const;
      const acct = tx.select().from(account).where(eq(account.id, row.accountId)).get();
      return acct && !acct.deletedAt && acct.onBudget && row.date <= today &&
        !row.transferId && row.splits.some(unclassified) ? 'open' as const : 'closed' as const;
    };
    for (const ref of rows.slice(0, 100)) {
      const key = ref.type === 'booking' ? `booking:${ref.id}` : ref.id;
      if (ref.type === 'booking') { states[key] = bookingOpen(ref.id); continue; }
      const item = tx.select().from(inboxItem).where(eq(inboxItem.id, ref.id)).get();
      if (!item || item.refType !== 'bank-sync-candidate' || item.refId !== ref.id) {
        states[key] = 'unknown'; continue;
      }
      if (!item.resolvedAt) { states[key] = 'open'; continue; }
      const prefixes = ['Bestätigt: ', 'Zusammengeführt: ', 'Mit vorhandener Buchung verknüpft: ', 'Umbuchung: '];
      const prefix = prefixes.find((value) => item.resolution?.startsWith(value));
      states[key] = prefix ? bookingOpen(item.resolution!.slice(prefix.length)) : 'closed';
    }
    return { states };
  });
}
