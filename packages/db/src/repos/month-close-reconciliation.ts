import { lastDayOfMonth } from '@budget/domain';
import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { account, accountReconciliation, bankSyncAccount, bankSyncCandidate, inboxItem } from '../schema';
import { withGroup, type AuditContext } from './audit';
import { ConflictError, BookingInvariantError } from './errors';
import { bookedBalance, reconcileAccount } from './reconciliation';
import { runInTransaction, type Executor } from './types';

/** Server-owned scope from the actual close view, never accepted in an HTTP payload. */
export interface MonthCloseReconciliationScope {
  id: string; manual: boolean; done: boolean; hasHoldings: boolean;
}
export interface UnchangedAccountConfirmation {
  id: string; name: string; currency: string; statementBalanceCents: number;
  priorReconciliationId: string; priorDate: string;
}
export type UnchangedAccountReason = 'already_done' | 'individual_mode' | 'no_prior_check' |
  'incomplete_history' | 'movement' | 'unresolved' | 'changed_since_check' | 'difference' | 'bank_difference' | 'unsafe_balance';
export interface MonthCloseReconciliationPreview {
  month: string; asOf: string; revision: string;
  accounts: UnchangedAccountConfirmation[];
  excluded: { id: string; reason: UnchangedAccountReason }[];
}

/**
 * Confirm retained personal statements, not a newly fetched bank balance. Eligibility is
 * deliberately conservative: incomplete lineage goes to the existing individual workflow.
 */
export function previewMonthCloseReconciliation(db: Executor, month: string, today: string,
  scope: readonly MonthCloseReconciliationScope[]): MonthCloseReconciliationPreview {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BookingInvariantError('Invalid close month');
  const end = lastDayOfMonth(month), asOf = end < today ? end : today;
  return runInTransaction(db, (tx) => {
    const accounts: UnchangedAccountConfirmation[] = [], excluded: MonthCloseReconciliationPreview['excluded'] = [];
    const seeds = new Map(scope.map((row) => [row.id, row]));
    const ids = [...seeds.keys()].sort();
    const head = tx.get<{ ordinal: string; id: string }>(sql`SELECT CAST(rowid AS TEXT) AS ordinal,id FROM audit_log ORDER BY rowid DESC LIMIT 1`) ?? null;
    const proof: unknown[] = [];
    const rows: (typeof account.$inferSelect)[] = [];
    for (let at = 0; at < ids.length; at += 200) rows.push(...tx.select().from(account)
      .where(and(inArray(account.id, ids.slice(at, at + 200)), isNull(account.deletedAt))).all());
    // Scope comes from the real owner-ordered close view, with a stable bank-first partition.
    const rank = new Map(scope.map((row, index) => [row.id, index]));
    rows.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    for (const row of rows) {
      const seed = seeds.get(row.id)!;
      const omit = (reason: UnchangedAccountReason) => excluded.push({ id: row.id, reason });
      if (seed.done) { omit('already_done'); continue; }
      if (seed.manual || seed.hasHoldings || row.closedAt || row.openingDate > asOf ||
        !['checking', 'cash', 'savings', 'credit_card', 'loan', 'other_liability', 'brokerage', 'crypto'].includes(row.type)) {
        omit('individual_mode'); continue;
      }
      const checks = tx.select().from(accountReconciliation)
        .where(and(eq(accountReconciliation.accountId, row.id), isNull(accountReconciliation.deletedAt)))
        .orderBy(desc(accountReconciliation.date), desc(accountReconciliation.createdAt), desc(accountReconciliation.id)).all();
      // A check already covering the target must not be duplicated, even in a current month.
      if (checks.some((check) => check.date >= asOf)) { omit('already_done'); continue; }
      const prior = checks.find((check) => check.date <= asOf);
      if (!prior) { omit('no_prior_check'); continue; }
      const ceremony = tx.get<{ ordinal: string; id: string; matches: number }>(sql`
        SELECT CAST(a.rowid AS TEXT) AS ordinal,a.id,
          (json_extract(a.after_json,'$.account_id') IS ${row.id}
            AND json_extract(a.after_json,'$.date') IS ${prior.date}
            AND json_extract(a.after_json,'$.statement_balance_cents') IS ${prior.statementBalanceCents}
            AND json_extract(a.after_json,'$.cleared_balance_cents') IS ${prior.clearedBalanceCents}
            AND json_extract(a.after_json,'$.deleted_at') IS NULL) AS matches
        FROM audit_log a WHERE a.entity_type='account_reconciliation' AND a.entity_id=${prior.id}
          AND a.action='create' AND a.before_json IS NULL AND a.after_json IS NOT NULL
        ORDER BY a.rowid LIMIT 1`);
      if (!ceremony || !ceremony.matches) { omit('incomplete_history'); continue; }
      // Only counts/identities/predicates leave SQLite: never copy private audit snapshots.
      const evidence = tx.get<{ movement: number; pending: number; changed: number; unproved: number; accountProved: number }>(sql`
        SELECT
          (SELECT count(*) FROM booking b WHERE b.account_id=${row.id} AND b.deleted_at IS NULL
            AND b.date>${prior.date} AND b.date<=${asOf} AND b.date>=${row.openingDate}) AS movement,
          (SELECT count(*) FROM booking b WHERE b.account_id=${row.id} AND b.deleted_at IS NULL
            AND b.status='pending' AND b.date>=${row.openingDate} AND b.date<=${asOf}) AS pending,
          (SELECT count(*) FROM audit_log a WHERE a.rowid>CAST(${ceremony.ordinal} AS INTEGER) AND (
            (a.entity_type='account' AND a.entity_id=${row.id})
            OR (a.entity_type='account_reconciliation' AND
              (json_extract(a.before_json,'$.account_id')=${row.id} OR json_extract(a.after_json,'$.account_id')=${row.id}))
            OR (a.entity_type='booking' AND (
              (json_extract(a.before_json,'$.account_id')=${row.id} AND json_extract(a.before_json,'$.date')<=${asOf})
              OR (json_extract(a.after_json,'$.account_id')=${row.id} AND json_extract(a.after_json,'$.date')<=${asOf})
              OR EXISTS(SELECT 1 FROM booking b WHERE b.id=a.entity_id AND b.account_id=${row.id} AND b.date<=${asOf})))
            OR (a.entity_type='booking_split' AND (
              EXISTS(SELECT 1 FROM booking b WHERE b.id IN(json_extract(a.before_json,'$.booking_id'),json_extract(a.after_json,'$.booking_id'))
                AND b.account_id=${row.id} AND b.date<=${asOf})
              OR EXISTS(SELECT 1 FROM audit_log parent WHERE parent.entity_type='booking'
                AND parent.entity_id IN(json_extract(a.before_json,'$.booking_id'),json_extract(a.after_json,'$.booking_id'))
                AND ((json_extract(parent.before_json,'$.account_id')=${row.id} AND json_extract(parent.before_json,'$.date')<=${asOf})
                  OR (json_extract(parent.after_json,'$.account_id')=${row.id} AND json_extract(parent.after_json,'$.date')<=${asOf}))))
          )) AS changed,
          (SELECT count(*) FROM booking b WHERE b.account_id=${row.id} AND b.deleted_at IS NULL
            AND b.date>=${row.openingDate} AND b.date<=${asOf} AND NOT EXISTS (
              SELECT 1 FROM audit_log a WHERE a.entity_type='booking' AND a.entity_id=b.id
                AND a.rowid=(SELECT max(last.rowid) FROM audit_log last WHERE last.entity_type='booking' AND last.entity_id=b.id)
                AND a.rowid<=CAST(${ceremony.ordinal} AS INTEGER) AND a.after_json IS NOT NULL
                AND json_extract(a.after_json,'$.account_id') IS b.account_id AND json_extract(a.after_json,'$.date') IS b.date
                AND json_extract(a.after_json,'$.amount_cents') IS b.amount_cents AND json_extract(a.after_json,'$.currency') IS b.currency
                AND json_extract(a.after_json,'$.status') IS b.status AND json_extract(a.after_json,'$.deleted_at') IS NULL
                AND json_extract(a.after_json,'$.original_amount_cents') IS b.original_amount_cents
                AND json_extract(a.after_json,'$.original_currency') IS b.original_currency
                AND json_extract(a.after_json,'$.fx_rate_micro') IS b.fx_rate_micro
                AND json_extract(a.after_json,'$.transfer_id') IS b.transfer_id
          )) AS unproved,
          (SELECT count(*) FROM audit_log a WHERE a.entity_type='account' AND a.entity_id=${row.id}
            AND a.rowid=(SELECT max(last.rowid) FROM audit_log last WHERE last.entity_type='account' AND last.entity_id=${row.id})
            AND a.rowid<=CAST(${ceremony.ordinal} AS INTEGER) AND a.after_json IS NOT NULL
            AND json_extract(a.after_json,'$.opening_date') IS ${row.openingDate}
            AND json_extract(a.after_json,'$.opening_balance_cents') IS ${row.openingBalanceCents}
            AND json_extract(a.after_json,'$.currency') IS ${row.currency}
            AND json_extract(a.after_json,'$.deleted_at') IS NULL) AS accountProved
      `)!;
      const bank = tx.select({ id: bankSyncAccount.id, currency: bankSyncAccount.currency,
        date: bankSyncAccount.balanceDate, cents: bankSyncAccount.balanceCents,
        fetchedAt: bankSyncAccount.balanceFetchedAt }).from(bankSyncAccount)
        .where(eq(bankSyncAccount.accountId, row.id)).orderBy(bankSyncAccount.id).all();
      const unresolved = tx.select({ id: bankSyncCandidate.id }).from(bankSyncCandidate)
        .innerJoin(inboxItem, eq(inboxItem.id, bankSyncCandidate.id))
        .where(and(eq(bankSyncCandidate.accountId, row.id), eq(bankSyncCandidate.currency, row.currency),
          lte(bankSyncCandidate.date, asOf), isNull(inboxItem.resolvedAt))).all();
      proof.push({ id: row.id, priorId: prior.id, ceremony, evidence, bank, unresolved });
      if (!evidence.accountProved || evidence.unproved) { omit('incomplete_history'); continue; }
      if (evidence.movement) { omit('movement'); continue; }
      if (evidence.pending || unresolved.length) { omit('unresolved'); continue; }
      if (evidence.changed) { omit('changed_since_check'); continue; }
      const balance = bookedBalance(tx, row.id, asOf);
      if (!Number.isSafeInteger(balance) || !Number.isSafeInteger(prior.statementBalanceCents)) { omit('unsafe_balance'); continue; }
      if (balance !== prior.statementBalanceCents) { omit('difference'); continue; }
      if (bank.some((value) => value.date === asOf && value.cents !== null &&
        (value.currency !== row.currency || !Number.isSafeInteger(value.cents) || value.cents !== prior.statementBalanceCents))) {
        omit('bank_difference'); continue;
      }
      accounts.push({ id: row.id, name: row.name, currency: row.currency,
        statementBalanceCents: prior.statementBalanceCents, priorReconciliationId: prior.id, priorDate: prior.date });
    }
    for (const id of ids) if (!rows.some((row) => row.id === id)) excluded.push({ id, reason: 'individual_mode' });
    const revision = createHash('sha256').update(JSON.stringify(['month-close-unchanged-v1', month, asOf, ids, scope, head,
      rows.map((row) => [row.id, row.currency, row.openingDate, row.openingBalanceCents, row.closedAt, row.sortOrder, row.name]), accounts, excluded, proof])).digest('hex');
    return { month, asOf, revision, accounts, excluded };
  });
}

/** Recompute before the first write; one failure rolls back every account/audit in this group. */
export function confirmMonthCloseReconciliation(db: Executor, input: {
  month: string; asOf: string; today: string; accountIds: string[]; revision: string;
}, scope: readonly MonthCloseReconciliationScope[], ctx: AuditContext) {
  return runInTransaction(db, (tx) => {
    const preview = previewMonthCloseReconciliation(tx, input.month, input.today, scope);
    const requested = [...new Set(input.accountIds)].sort(), expected = preview.accounts.map((row) => row.id).sort();
    if (!requested.length || requested.length !== input.accountIds.length || requested.length !== expected.length ||
      requested.some((id, index) => id !== expected[index]) || input.asOf !== preview.asOf || input.revision !== preview.revision)
      throw new ConflictError('Der Kontenstand oder die Auswahl hat sich geändert. Lade den Abschluss neu und bestätige die aktuelle Sammelzeile.');
    const grouped = withGroup(ctx);
    const reconciliations = preview.accounts.map((row) => {
      const result = reconcileAccount(tx, { accountId: row.id, date: preview.asOf,
        statementBalanceCents: row.statementBalanceCents, adjust: false, today: input.today }, grouped);
      if (result.adjustmentBookingId !== null || result.differenceCents !== 0)
        throw new BookingInvariantError('An unchanged confirmation must not create an adjustment');
      return { accountId: row.id, reconciliationId: result.reconciliationId };
    });
    return { groupId: grouped.groupId, reconciliations };
  });
}
