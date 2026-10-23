import {
  accountReminder,
  ACCOUNT_REMINDER_SETTING,
  DEFAULT_ACCOUNT_REMINDER_DAYS,
  validAccountReminderDays,
  reviewStatus,
  addDays,
  daysBetween,
  type AccountReviewStatus,
} from '@budget/domain';
import { and, desc, inArray, isNull, lte, sql } from 'drizzle-orm';
import { accountReconciliation, appSetting, auditLog, valuation } from '../schema';
import { getEntity } from './entities';
import { accountSummaries, type AccountSummary } from './ledger-queries';
import type { Executor } from './types';
import { accountReviewChronology, type ReviewCheckpoint } from './account-review-chronology';

export function accountReminderDays(db: Executor): number {
  const stored = getEntity(db, appSetting, ACCOUNT_REMINDER_SETTING)?.value;
  const days = stored === undefined ? DEFAULT_ACCOUNT_REMINDER_DAYS : Number(stored);
  return validAccountReminderDays(days) ? days : DEFAULT_ACCOUNT_REMINDER_DAYS;
}

/** One read model for overview badges, reminder details and Heute's source count. No writes. */
export function accountReviewSummaries(
  db: Executor,
  today: string,
  summaries: AccountSummary[] = accountSummaries(db, today),
) {
  const latestValuations = new Map<string, typeof valuation.$inferSelect>();
  for (const row of db
    .select()
    .from(valuation)
    .where(and(isNull(valuation.deletedAt), lte(valuation.date, today)))
    .orderBy(desc(valuation.date))
    .all())
    if (!latestValuations.has(row.accountId)) latestValuations.set(row.accountId, row);
  const reconciliations = new Map<string, typeof accountReconciliation.$inferSelect>();
  const activeIds = summaries.filter((a) => !a.closedAt && a.openingDate <= today).map((a) => a.id);
  const originalCheckOrder = sql<number | null>`(SELECT MIN(${auditLog}.rowid) FROM ${auditLog}
    WHERE ${auditLog.entityType} = 'account_reconciliation'
      AND ${auditLog.entityId} = ${accountReconciliation.id} AND ${auditLog.action} = 'create')`;
  for (const row of db
    .select()
    .from(accountReconciliation)
    .where(
      and(
        isNull(accountReconciliation.deletedAt),
        lte(accountReconciliation.date, today),
        inArray(accountReconciliation.accountId, activeIds),
      ),
    )
    .orderBy(
      desc(accountReconciliation.date),
      desc(accountReconciliation.createdAt),
      // The original audited ceremony survives replay; a row tie only stabilizes legacy gaps.
      desc(originalCheckOrder),
      desc(sql`${accountReconciliation}.rowid`),
    )
    .all())
    if (!reconciliations.has(row.accountId)) reconciliations.set(row.accountId, row);
  const checkpoints = new Map<string, ReviewCheckpoint>();
  for (const row of summaries) {
    if (row.closedAt || row.openingDate > today) continue;
    const manual = row.type === 'p2p' || row.type === 'other_asset';
    const check = manual ? latestValuations.get(row.id) : reconciliations.get(row.id);
    if (check)
      checkpoints.set(row.id, {
        id: check.id,
        accountId: row.id,
        date: check.date,
        createdAt: check.createdAt,
        entityType: manual ? 'valuation' : 'account_reconciliation',
      });
  }
  const chronology = accountReviewChronology(db, today, checkpoints);
  const interval = accountReminderDays(db);
  const reviews = new Map<string, AccountReviewStatus>();
  for (const row of summaries) {
    const events = chronology.get(row.id);
    const eligible = { ...row, bookingCount: events?.bookingCount ?? 0 };
    const checkedOn = checkpoints.get(row.id)?.date ?? null;
    const review = reviewStatus(
      eligible,
      checkedOn,
      events?.lastBookingOn ?? null,
      today,
      events?.activityAfterCheck ?? false,
    );
    if (!review.supported && review.state !== 'inactive') {
      // Existing unsupported types retain their legacy hint, not a new contact-check policy.
      const fallback = accountReminder(
        {
          ...eligible,
          lastReconciledOn: checkedOn,
          lastValuedOn: latestValuations.get(row.id)?.date ?? null,
        },
        today,
        interval,
      );
      const anchor = checkedOn ?? row.openingDate;
      reviews.set(row.id, {
        ...review,
        policy: 'legacy',
        state: fallback ? 'due' : eligible.bookingCount ? 'unsupported' : 'inactive',
        days: daysBetween(anchor, today),
        dueOn: addDays(anchor, interval),
        action: fallback?.action ?? null,
      });
    } else reviews.set(row.id, review);
  }
  return { accounts: summaries, reviews, latestValuations };
}

/** Derived hints: checking/value updates remove them without persisted inbox warnings. */
export function accountReminders(db: Executor, today: string) {
  const model = accountReviewSummaries(db, today);
  return model.accounts.flatMap((row) => {
    const review = model.reviews.get(row.id)!;
    return review.state === 'due' && review.action !== null && review.days !== null
      ? [
          {
            accountId: row.id,
            accountName: row.name,
            days: review.days,
            action: review.action,
            dueOn: review.dueOn,
            checkedOn: review.checkedOn,
            policy: review.policy,
            supported: review.supported,
          },
        ]
      : [];
  });
}
