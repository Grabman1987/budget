import {
  accountReminder,
  ACCOUNT_REMINDER_SETTING,
  DEFAULT_ACCOUNT_REMINDER_DAYS,
  validAccountReminderDays,
} from '@budget/domain';
import { and, desc, isNull, lte } from 'drizzle-orm';
import { appSetting, valuation } from '../schema';
import { getEntity } from './entities';
import { accountSummaries } from './ledger-queries';
import type { Executor } from './types';

export function accountReminderDays(db: Executor): number {
  const stored = getEntity(db, appSetting, ACCOUNT_REMINDER_SETTING)?.value;
  const days = stored === undefined ? DEFAULT_ACCOUNT_REMINDER_DAYS : Number(stored);
  return validAccountReminderDays(days) ? days : DEFAULT_ACCOUNT_REMINDER_DAYS;
}

/** Derived hints: checking/value updates remove them without persisted inbox warnings. */
export function accountReminders(db: Executor, today: string) {
  const dates = new Map<string, string>();
  for (const row of db
    .select()
    .from(valuation)
    .where(and(isNull(valuation.deletedAt), lte(valuation.date, today)))
    .orderBy(desc(valuation.date))
    .all())
    if (!dates.has(row.accountId)) dates.set(row.accountId, row.date);
  const interval = accountReminderDays(db);
  return accountSummaries(db, today).flatMap((account) => {
    const reminder = accountReminder(
      { ...account, lastValuedOn: dates.get(account.id) ?? null },
      today,
      interval,
    );
    return reminder ? [{ accountId: account.id, accountName: account.name, ...reminder }] : [];
  });
}
