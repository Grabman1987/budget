import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import {
  DEFAULT_INBOX_WARN_AGE_DAYS,
  DEFAULT_INBOX_WARN_COUNT,
  INBOX_WARN_AGE_SETTING,
  INBOX_WARN_COUNT_SETTING,
  validInboxWarnAgeDays,
  validInboxWarnCount,
  addDays,
  cents,
  formatEuro,
  monthOf,
  overspentEnvelopes,
  summarizeMonth,
  type ParsedPayrollDocument,
} from '@budget/domain';
import { categoryTree } from './categories';
import { budget } from './queries';
import { getBooking } from './bookings';
import {
  account,
  accountReconciliation,
  appSetting,
  auditLog,
  booking,
  bookingSplit,
  category,
  inboxItem,
  payee,
  bankSyncAccount,
  bankSyncCandidate,
  payslipIntake,
  receipt,
} from '../schema';
import { nowIso, updateTracked, withGroup, type AuditContext } from './audit';
import { ConflictError, EntityNotFoundError } from './errors';
import { getEntity } from './entities';
import { runInTransaction, type Executor } from './types';
import { readSourceDisplayDetail, readSourceMappings } from './read-source';
import { listReceipts } from './receipts';
import { accountReminders } from './account-reminders';
import { savingsExecutionProposals, type SavingsExecutionProposal } from './savings-plans';
import { candidateMatches } from './bank-followups';
import { LINK_PROPOSAL_REF, parseLinkProposalId } from './expected-auto-link';
import { payslipDocumentMetadata } from './payslip-intake';
import {
  CARD_SETTLEMENT_RULE_PREFIX,
  readAssignmentCandidate,
  readBookingAssignments,
} from './assignment-rules';
import { suggestedBookingCategory } from './booking-category-suggestion';
import { bookedBalance } from './reconciliation';
import { heldSecurityIds } from './quote-source-decision';
import { AUTO_RESOLVED_HISTORY_DAYS, autoResolvedWarnings } from './market';

export type BankSuggestion = { label: string; needsReview: boolean };
export type BankCandidatePreparation = {
  assignment: ReturnType<typeof readAssignmentCandidate>;
  matches: ReturnType<typeof candidateMatches>;
};

export interface InboxBooking {
  type: 'booking';
  id: string;
  bookingId: string;
  kind: 'uncategorized';
  urgent: false;
  date: string;
  accountId?: string;
  accountName: string;
  payeeName: string | null;
  memo: string | null;
  amountCents: number;
  currency: string;
  status: typeof booking.$inferSelect.status;
  source: typeof booking.$inferSelect.source;
  missingSplits: number;
  /** Read-only proposal for the inline row, set only on the returned page (never mutates). */
  suggestion?: InboxBookingSuggestion;
}
export interface InboxBookingSuggestion {
  payeeId: string | null;
  payeeName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  basis: string | null;
  ruleId?: string;
  /** #1319: the debit is a card bill; proposed as a transfer to the card, never as a category. */
  transfer?: { ruleId: string; revision: string; accountId: string; label: string };
  /** The booking has exactly one split, so one category can be assigned in the row. */
  singleSplit: boolean;
}
export interface InboxStored {
  type: 'stored';
  id: string;
  kind: typeof inboxItem.$inferSelect.kind;
  title: string;
  detail: string | null;
  refType: string | null;
  refId: string | null;
  urgent: boolean;
  createdAt: string;
  /** Price-source warning of an instrument without a current holding (own task group). */
  historical?: true;
  payslipDocument?: ReturnType<typeof payslipDocumentMetadata>;
  /** Open proposal to link a bank booking to an occurrence of a recurring payment (#1102). */
  linkProposal?: { occurrenceId: string; bookingId: string };
  bankCandidate?:
    | {
        date: string;
        amountCents: number;
        currency: string;
        memo: string;
        payeeName: string | null;
        accountId?: string;
        accountName: string;
        suggestion?: BankSuggestion;
        preparation?: BankCandidatePreparation;
      }
    | undefined;
}
export interface InboxEnvelope {
  type: 'envelope';
  id: string;
  kind: 'overspent';
  categoryId: string;
  month: string;
  /** Positive amount in cents needed to bring the current envelope back to zero. */
  deficitCents: number;
  title: string;
  detail: string;
  urgent: true;
}
export type InboxEntry = InboxBooking | InboxStored | InboxEnvelope | SavingsExecutionProposal;
export interface InboxOptions {
  excludeOverspent?: boolean;
}

/** Warning thresholds of the Prüfen counter; invalid stored values fall back to the defaults. */
export function inboxWarnThresholds(db: Executor) {
  const age = Number(getEntity(db, appSetting, INBOX_WARN_AGE_SETTING)?.value);
  const limit = Number(getEntity(db, appSetting, INBOX_WARN_COUNT_SETTING)?.value);
  return {
    ageDays: validInboxWarnAgeDays(age) ? age : DEFAULT_INBOX_WARN_AGE_DAYS,
    count: validInboxWarnCount(limit) ? limit : DEFAULT_INBOX_WARN_COUNT,
  };
}

/** Latest accepted statement per account; older checks are superseded, never rewritten. */
function reconciliationTasks(db: Executor, today: string): InboxStored[] {
  const checks = db
    .select({
      check: accountReconciliation,
      name: account.name,
      currency: account.currency,
      accepted: sql<number>`EXISTS (SELECT 1 FROM ${auditLog}
        WHERE ${auditLog.entityType} = 'account_reconciliation'
          AND ${auditLog.entityId} = ${accountReconciliation.id}
          AND ${auditLog.action} = 'create'
          AND json_extract(${auditLog.afterJson}, '$.statement_balance_cents') = ${accountReconciliation.statementBalanceCents}
          AND json_extract(${auditLog.afterJson}, '$.date') = ${accountReconciliation.date})`,
    })
    .from(accountReconciliation)
    .innerJoin(account, eq(account.id, accountReconciliation.accountId))
    .where(
      and(
        isNull(account.deletedAt),
        isNull(accountReconciliation.deletedAt),
        lte(accountReconciliation.date, today),
      ),
    )
    .orderBy(
      desc(accountReconciliation.date),
      desc(accountReconciliation.createdAt),
      desc(sql`${accountReconciliation}.rowid`),
    )
    .all();
  const seen = new Set<string>();
  return checks.flatMap(({ check, name, currency, accepted }) => {
    if (seen.has(check.accountId)) return [];
    seen.add(check.accountId);
    // Imported legacy checkpoints without an acceptance record have no proven statement snapshot.
    if (!accepted) return [];
    const current = bookedBalance(db, check.accountId, check.date);
    if (current === check.statementBalanceCents) return [];
    const amount = (value: number) =>
      formatEuro(cents(value)).replace('€', currency === 'EUR' ? '€' : currency);
    const day = check.date.split('-').reverse().join('.');
    return [
      {
        type: 'stored' as const,
        id: `reconciliation-mismatch:${check.id}`,
        kind: 'reconciliation' as const,
        title: `Kontoprüfung stimmt nicht mehr · ${name}`,
        detail: `Abgleich vom ${day}: bestätigt ${amount(check.statementBalanceCents)}, jetzt gebucht ${amount(current)}. Differenz (bestätigt − gebucht): ${amount(check.statementBalanceCents - current)}. Prüfe die nachträglich geänderten Buchungen oder gleiche das Konto erneut ab.`,
        refType: 'account-reconciliation',
        refId: check.accountId,
        urgent: true,
        createdAt: check.createdAt,
      },
    ];
  });
}

function withBookingSuggestion(db: Executor, entry: InboxBooking): InboxBooking {
  try {
    const row = getBooking(db, entry.bookingId);
    if (!row) return entry;
    const { cleanup, suggestions } = readBookingAssignments(db, entry.bookingId);
    const payeeId = row.payeeId ?? cleanup.payeeId;
    const payeeName = row.payeeId
      ? (db.select().from(payee).where(eq(payee.id, row.payeeId)).get()?.name ?? null)
      : cleanup.payeeName;
    let categoryId: string | null = null;
    let categoryName: string | null = null;
    let basis: string | null = null;
    let ruleId: string | undefined;
    // #1319: a card bill is proposed as a transfer to the card and never gets a category.
    const cardRule = suggestions.find(
      (r) => !r.unavailable && r.id.startsWith(CARD_SETTLEMENT_RULE_PREFIX),
    );
    const withCategory = cardRule
      ? []
      : suggestions.filter((r) => !r.unavailable && r.actions.categoryId);
    if (withCategory.length === 1) {
      const rule = withCategory[0]!;
      const c = db.select().from(category).where(eq(category.id, rule.actions.categoryId!)).get();
      if (c && !c.deletedAt) {
        categoryId = c.id;
        categoryName = c.name;
        basis = `Regel: ${rule.name}`;
        ruleId = rule.id;
      }
    }
    if (!cardRule && !categoryId && payeeId && row.splits.length === 1) {
      const found = suggestedBookingCategory(db, payeeId, entry.amountCents);
      if (found) ({ categoryId, categoryName, basis } = found);
    }
    return {
      ...entry,
      suggestion: {
        payeeId,
        payeeName,
        categoryId,
        categoryName,
        basis,
        singleSplit: row.splits.length === 1,
        ...(ruleId ? { ruleId } : {}),
        ...(cardRule
          ? {
              transfer: {
                ruleId: cardRule.id,
                revision: cardRule.revision,
                accountId: cardRule.actions.transferAccountId!,
                label: cardRule.name,
              },
            }
          : {}),
      },
    };
  } catch {
    return entry;
  }
}

/** Enrich only the response page. The booking dialog recomputes guarded choices before writing. */
export function prepareInboxBankSuggestions(db: Executor, entries: InboxEntry[]): InboxEntry[] {
  return runInTransaction(db, (tx) =>
    entries.map((entry) => {
      if (entry.type === 'booking') return withBookingSuggestion(tx, entry);
      if (entry.type !== 'stored' || !entry.bankCandidate || !entry.refId) return entry;
      let suggestion: BankSuggestion = {
        label: 'Kategorie prüfen · Zu verteilen',
        needsReview: true,
      };
      let preparation: BankCandidatePreparation | undefined;
      try {
        const matches = candidateMatches(tx, entry.refId);
        const assignment = readAssignmentCandidate(tx, entry.refId);
        preparation = { matches, assignment };
        const targets = [...matches.merge, ...matches.link];
        if (
          targets.length > 1 ||
          matches.transfers.length > 1 ||
          (targets.length && matches.transfers.length)
        )
          suggestion = {
            label: 'Vorschlag prüfen · mehrere mögliche Buchungen',
            needsReview: true,
          };
        else if (matches.transfers.length === 1)
          suggestion = {
            label: `Gegenbuchung ${matches.transfers[0]!.date} · Umbuchung prüfen`,
            needsReview: true,
          };
        else if (targets.length === 1)
          suggestion = {
            label: `Mit Buchung ${targets[0]!.date} zusammenführen`,
            needsReview: false,
          };
        else {
          const rules = assignment.suggestions;
          const available = rules.filter((rule) => !rule.unavailable);
          if (available.length > 1)
            suggestion = { label: 'Vorschlag prüfen · mehrere Regeln', needsReview: true };
          else if (available.length === 1)
            suggestion = {
              label: `${available[0]!.automatic || available[0]!.id.startsWith('inbox-learn:') ? 'Regel' : 'Regelvorschlag prüfen'}: ${available[0]!.name}`,
              needsReview: !(
                available[0]!.automatic || available[0]!.id.startsWith('inbox-learn:')
              ),
            };
          else if (rules.length)
            suggestion = { label: 'Vorschlag prüfen · Regel nicht verfügbar', needsReview: true };
        }
      } catch {
        suggestion = { label: 'Vorschlag prüfen', needsReview: true };
      }
      return {
        ...entry,
        bankCandidate: {
          ...entry.bankCandidate,
          suggestion,
          ...(preparation ? { preparation } : {}),
        },
      };
    }),
  );
}

/** Shared predicates keep task list and lightweight badge count in agreement. */
const unclassifiedWhere = (today: string) =>
  and(
    isNull(booking.deletedAt),
    isNull(account.deletedAt),
    eq(account.onBudget, true),
    lte(booking.date, today),
    isNull(booking.transferId),
    isNull(bookingSplit.transferId),
    isNull(bookingSplit.categoryId),
    isNull(bookingSplit.incomeTypeId),
    sql`${bookingSplit.amountCents} <> 0`,
    // A canonical balance correction intentionally changes Zu verteilen. Ordinary unnamed
    // expenses still need classification, even if their payee has an adjustment-like name.
    sql`NOT EXISTS (SELECT 1 FROM ${payee}
      WHERE ${payee.id} = ${booking.payeeId} AND ${payee.deletedAt} IS NULL
      AND ${payee.systemKind} IN ('reconciliation_adjustment', 'manual_adjustment'))`,
  );
const storedWhere = () =>
  and(
    isNull(inboxItem.resolvedAt),
    sql`${inboxItem.kind} NOT IN ('uncategorized', 'overspent')`,
    sql`(${inboxItem.refType} IS NULL OR ${inboxItem.refType} <> 'read_source' OR substr(${inboxItem.title}, 1, 10) = 'Quellsaldo')`,
  );
const sourceMovementsWhere = (sourceId?: string) =>
  and(
    isNull(inboxItem.resolvedAt),
    eq(inboxItem.refType, 'read_source'),
    sql`substr(${inboxItem.title}, 1, 10) <> 'Quellsaldo'`,
    sourceId ? eq(inboxItem.refId, sourceId) : undefined,
  );

/** Stored envelope warnings are superseded by the live ledger, exactly once per category. */
function envelopeTasks(db: Executor, today: string): InboxEnvelope[] {
  const month = monthOf(today);
  const [computed] = budget(db, [month]);
  if (!computed) return [];
  const tree = categoryTree(db);
  return overspentEnvelopes(summarizeMonth(computed, tree.categories)).map((e): InboxEnvelope => ({
    type: 'envelope',
    id: `envelope:${month}:${e.categoryId}`,
    kind: 'overspent',
    categoryId: e.categoryId,
    month,
    deficitCents: -e.availableCents,
    title: `${tree.categories.find((c) => c.id === e.categoryId)!.name} ist überzogen`,
    detail: `${formatEuro(cents(e.availableCents))} · im Plan decken`,
    urgent: true,
  }));
}

/** One task per actual booking, regardless of how many splits need classification. */
function uncategorizedBookings(db: Executor, today: string): InboxBooking[] {
  return db
    .select({
      id: booking.id,
      date: booking.date,
      accountId: account.id,
      accountName: account.name,
      payeeName: payee.name,
      memo: booking.memo,
      amountCents: booking.amountCents,
      currency: booking.currency,
      status: booking.status,
      source: booking.source,
      missingSplits: sql<number>`count(*)`,
    })
    .from(booking)
    .innerJoin(account, eq(account.id, booking.accountId))
    .innerJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
    .leftJoin(payee, eq(payee.id, booking.payeeId))
    .where(unclassifiedWhere(today))
    .groupBy(booking.id)
    .orderBy(asc(booking.date), asc(booking.id))
    .all()
    .map((row) => ({
      ...row,
      type: 'booking',
      id: `booking:${row.id}`,
      bookingId: row.id,
      kind: 'uncategorized',
      urgent: false,
    }));
}

/** Legacy classification/overspending summaries are replaced by live ledger work. */
export function readInbox(
  db: Executor,
  today: string,
  bankSource?: string,
  readSource?: string,
  /** Konten › Prüfen leaves overspent categories to Heute and Plan. */
  options: InboxOptions & { bankAccountId?: string } = {},
) {
  return runInTransaction(db, (tx) => {
    const bookings = options.bankAccountId ? [] : uncategorizedBookings(tx, today);
    const mappings = readSourceMappings(tx);
    // Keep full-queue counts cheap; suggestions are prepared only after API pagination.
    const candidates = new Map(
      tx
        .select({
          id: bankSyncCandidate.id,
          date: bankSyncCandidate.date,
          amountCents: bankSyncCandidate.amountCents,
          currency: bankSyncCandidate.currency,
          memo: bankSyncCandidate.memo,
          payeeName: bankSyncCandidate.rawPayee,
          accountId: account.id,
          accountName: account.name,
        })
        .from(bankSyncCandidate)
        .innerJoin(account, eq(account.id, bankSyncCandidate.accountId))
        .innerJoin(inboxItem, eq(inboxItem.id, bankSyncCandidate.id))
        .where(
          and(
            isNull(inboxItem.resolvedAt),
            options.bankAccountId
              ? eq(bankSyncCandidate.accountId, options.bankAccountId)
              : undefined,
          ),
        )
        .all()
        .map(({ id, ...row }) => [id, row]),
    );
    const progressCandidates = options.bankAccountId
      ? []
      : tx
          .select({
            id: bankSyncCandidate.id,
            accountId: bankSyncCandidate.accountId,
            dedupeKey: bankSyncCandidate.dedupeKey,
            resolvedAt: inboxItem.resolvedAt,
            resolution: inboxItem.resolution,
            refType: inboxItem.refType,
          })
          .from(bankSyncCandidate)
          .innerJoin(inboxItem, eq(inboxItem.id, bankSyncCandidate.id))
          .where(
            and(
              bankSource ? eq(bankSyncCandidate.sourceId, bankSource) : undefined,
              options.bankAccountId
                ? eq(bankSyncCandidate.accountId, options.bankAccountId)
                : undefined,
            ),
          )
          .all();
    const candidateKeys = new Set(
      progressCandidates.map((row) => `${row.accountId}:bank-sync:${row.dedupeKey}`),
    );
    const linkedBookingId = (resolution: string | null) =>
      /^(?:Bestätigt: |Zusammengeführt: |Umbuchung: |Mit vorhandener Buchung verknüpft: |Kontowirksam übernommen: |Als ungeprüfte Buchung angelegt, bitte prüfen: )(.+)$/.exec(
        resolution ?? '',
      )?.[1];
    const linkedIds = new Set(
      progressCandidates
        .map((row) => linkedBookingId(row.resolution))
        .filter((id): id is string => typeof id === 'string'),
    );
    const openBookingIds = new Set(
      options.bankAccountId
        ? []
        : tx
            .select({ id: booking.id })
            .from(booking)
            .innerJoin(account, eq(account.id, booking.accountId))
            .innerJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
            .where(unclassifiedWhere(today))
            .groupBy(booking.id)
            .all()
            .map((row) => row.id),
    );
    const progressBookings = options.bankAccountId
      ? []
      : tx
          .select({
            id: booking.id,
            accountId: booking.accountId,
            importKey: booking.importKey,
            bankSourceId: booking.bankSourceId,
            source: booking.source,
          })
          .from(booking)
          .where(
            and(
              isNull(booking.deletedAt),
              or(
                eq(booking.source, 'bank'),
                linkedIds.size ? inArray(booking.id, [...linkedIds]) : undefined,
              ),
              options.bankAccountId ? eq(booking.accountId, options.bankAccountId) : undefined,
            ),
          )
          .all()
          .filter(
            (row) =>
              !bankSource ||
              row.bankSourceId === bankSource ||
              candidateKeys.has(`${row.accountId}:${row.importKey}`) ||
              linkedIds.has(row.id),
          );
    const bookingsById = new Map(progressBookings.map((row) => [row.id, row]));
    let reviewed = 0;
    let open = 0;
    for (const row of progressCandidates) {
      if (row.refType !== 'bank-sync-candidate') continue;
      if (!row.resolvedAt) {
        open++;
      } else if (row.resolution?.startsWith('Vom Nutzer')) {
        reviewed++;
      } else {
        const bookingId = linkedBookingId(row.resolution);
        if (bookingId && bookingsById.has(bookingId)) {
          if (openBookingIds.has(bookingId)) open++;
          else reviewed++;
        }
      }
    }
    // Legacy bank booking tasks without a retained candidate remain in the same review count.
    open += progressBookings.filter(
      (row) =>
        row.source === 'bank' &&
        openBookingIds.has(row.id) &&
        !linkedIds.has(row.id) &&
        !candidateKeys.has(`${row.accountId}:${row.importKey}`),
    ).length;
    const stored: InboxStored[] = tx
      .select({
        item: inboxItem,
        parsedJson: payslipIntake.parsedJson,
        originalFilename: receipt.originalFilename,
      })
      .from(inboxItem)
      .leftJoin(
        payslipIntake,
        and(
          eq(inboxItem.refType, 'payslip-intake'),
          eq(payslipIntake.id, inboxItem.refId),
          isNull(payslipIntake.deletedAt),
        ),
      )
      .leftJoin(receipt, and(eq(receipt.id, payslipIntake.receiptId), isNull(receipt.deletedAt)))
      .where(
        and(
          readSource ? sourceMovementsWhere(readSource) : storedWhere(),
          options.bankAccountId
            ? and(
                eq(inboxItem.refType, 'bank-sync-candidate'),
                eq(inboxItem.refId, inboxItem.id),
                inArray(
                  inboxItem.id,
                  tx
                    .select({ id: bankSyncCandidate.id })
                    .from(bankSyncCandidate)
                    .where(eq(bankSyncCandidate.accountId, options.bankAccountId)),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(inboxItem.urgent), asc(inboxItem.createdAt), asc(inboxItem.id))
      .all()
      .map(({ item: row, parsedJson, originalFilename }) => ({
        type: 'stored',
        id: row.id,
        kind: row.kind,
        title: row.title,
        detail:
          row.refType === 'read_source' && row.refId === 'crypto'
            ? readSourceDisplayDetail(row.detail, mappings)
            : row.detail,
        refType: row.refType,
        refId: row.refId,
        urgent: row.urgent,
        createdAt: row.createdAt,
        ...(parsedJson
          ? {
              payslipDocument: payslipDocumentMetadata(
                JSON.parse(parsedJson) as ParsedPayrollDocument,
                originalFilename,
              ),
            }
          : {}),
        ...(row.refType === 'bank-sync-candidate' && row.refId
          ? { bankCandidate: candidates.get(row.refId) }
          : {}),
        ...(row.refType === LINK_PROPOSAL_REF
          ? (() => {
              const linkProposal = parseLinkProposalId(row.id);
              return linkProposal ? { linkProposal } : {};
            })()
          : {}),
      }));
    if (stored.some((e) => e.kind === 'stale_value' && e.refType === 'security')) {
      const held = heldSecurityIds(tx, today);
      for (const e of stored)
        if (e.kind === 'stale_value' && e.refType === 'security' && e.refId && !held.has(e.refId))
          e.historical = true;
    }
    let entries: InboxEntry[] =
      readSource || options.bankAccountId
        ? stored
        : [
            ...(options.excludeOverspent ? [] : envelopeTasks(tx, today)),
            ...bookings,
            ...savingsExecutionProposals(tx, today),
            ...reconciliationTasks(tx, today),
            ...stored,
          ];
    if (bankSource) entries = filterBankSourceInbox(tx, entries, bankSource);
    const unlinkedReceipts = options.bankAccountId ? [] : listReceipts(tx);
    const reminders =
      bankSource || readSource || options.bankAccountId ? [] : accountReminders(tx, today);
    return {
      asOf: today,
      ...(options.bankAccountId ? {} : { bankProgress: { reviewed, total: reviewed + open } }),
      accountReminders: reminders,
      unlinkedReceiptCount:
        bankSource || readSource || options.bankAccountId ? 0 : unlinkedReceipts.length,
      count:
        entries.length +
        reminders.length +
        (bankSource || readSource || options.bankAccountId ? 0 : unlinkedReceipts.length),
      entries,
      // History of warnings the market run closed by itself (#1101); never part of the count.
      autoResolved:
        bankSource || readSource || options.bankAccountId
          ? []
          : autoResolvedWarnings(tx, addDays(today, -AUTO_RESOLVED_HISTORY_DAYS)),
      readSourceSummaries:
        bankSource || readSource || options.bankAccountId
          ? []
          : tx
              .select({ sourceId: inboxItem.refId, count: count() })
              .from(inboxItem)
              .where(sourceMovementsWhere())
              .groupBy(inboxItem.refId)
              .orderBy(asc(inboxItem.refId))
              .all()
              .map((row) => ({
                ...row,
                name:
                  row.sourceId === 'crypto'
                    ? 'Krypto-Lesequelle'
                    : `Lesequelle ${row.sourceId ?? ''}`.trim(),
              })),
    };
  });
}

/** Source identity, including linked/migrated bookings; never filter by display names. */
export function filterBankSourceInbox(db: Executor, entries: InboxEntry[], sourceId: string) {
  const source = db.select().from(bankSyncAccount).where(eq(bankSyncAccount.id, sourceId)).get();
  if (!source) return [];
  const candidates = db
    .select()
    .from(bankSyncCandidate)
    .where(eq(bankSyncCandidate.sourceId, sourceId))
    .all();
  const candidateIds = new Set(candidates.map((c) => c.id));
  const keys = new Set(candidates.map((c) => 'bank-sync:' + c.dedupeKey));
  const bookingIds = new Set(
    db
      .select()
      .from(booking)
      .where(eq(booking.accountId, source.accountId ?? ''))
      .all()
      .filter((b) => b.bankSourceId === sourceId || (b.importKey && keys.has(b.importKey)))
      .map((b) => 'booking:' + b.id),
  );
  return entries.filter((entry) => {
    if (entry.type === 'booking') return bookingIds.has(entry.id);
    if (entry.type !== 'stored') return false;
    if (candidateIds.has(entry.id)) return true;
    return (
      entry.refType === 'bank-sync' &&
      (candidateIds.has(entry.refId ?? '') ||
        entry.id.startsWith('bank-error:' + sourceId + ':') ||
        entry.id === 'bank-skipped:' + sourceId ||
        (entry.refId === source.accountId && entry.id.startsWith('bank-balance')))
    );
  });
}

/** Booking/stored counts use SQL; derived tasks share the queue's read-only projections. */
export function readInboxCount(db: Executor, today: string, options: InboxOptions = {}) {
  return runInTransaction(db, (tx) => {
    const bookings = tx
      .select({ count: countDistinct(booking.id) })
      .from(booking)
      .innerJoin(account, eq(account.id, booking.accountId))
      .innerJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
      .where(unclassifiedWhere(today))
      .get()!.count;
    const stored = tx.select({ count: count() }).from(inboxItem).where(storedWhere()).get()!.count;
    return {
      asOf: today,
      count:
        (options.excludeOverspent ? 0 : envelopeTasks(tx, today).length) +
        bookings +
        stored +
        listReceipts(tx).length +
        savingsExecutionProposals(tx, today).length +
        reconciliationTasks(tx, today).length +
        accountReminders(tx, today).length,
    };
  });
}

/**
 * Age and money of the open uncategorised bookings (one entry per booking, its open splits summed)
 * for the Prüfen warning. Read-only; the count semantics of `readInboxCount` stay unchanged.
 */
export function readInboxWarnFacts(db: Executor, today: string) {
  return runInTransaction(db, (tx) => {
    const thresholds = inboxWarnThresholds(tx);
    const open = tx
      .select({ date: booking.date, cents: sql<number>`sum(${bookingSplit.amountCents})` })
      .from(booking)
      .innerJoin(account, eq(account.id, booking.accountId))
      .innerJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
      .where(unclassifiedWhere(today))
      .groupBy(booking.id)
      .all();
    // Older than the threshold means at least threshold + 1 days.
    const cutoff = addDays(today, -thresholds.ageDays);
    return {
      oldestOpenDate: open.reduce<string | null>(
        (oldest, row) => (oldest === null || row.date < oldest ? row.date : oldest),
        null,
      ),
      overAgeCount: open.filter((row) => row.date < cutoff).length,
      openUncategorizedCents: open.reduce((sum, row) => sum + Number(row.cents), 0),
      thresholds,
    };
  });
}

/** Acknowledgement changes only the stored decision; it does not claim a source repair. */
export function resolveInboxItem(
  db: Executor,
  id: string,
  ctx: AuditContext,
  /** Operator runs record their own reason; the app keeps the default text. */
  resolution = 'Vom Nutzer als erledigt markiert',
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const row = tx.select().from(inboxItem).where(eq(inboxItem.id, id)).get();
    if (!row) throw new EntityNotFoundError('inbox_item', id);
    if (row.kind === 'uncategorized')
      throw new ConflictError('Eine fehlende Kategorie wird in der Buchung ergänzt.');
    if (row.kind === 'overspent') throw new ConflictError('Eine Überziehung wird im Plan gedeckt.');
    if (row.refType === 'payslip-intake')
      throw new ConflictError('Bitte den Gehaltszettel bestätigen oder ablehnen.');
    if (row.resolvedAt !== null) throw new ConflictError('Diese Aufgabe wurde bereits erledigt.');
    updateTracked(tx, inboxItem, [id], { resolvedAt: nowIso(), resolution }, grouped);
    return { id, groupId: grouped.groupId };
  });
}
