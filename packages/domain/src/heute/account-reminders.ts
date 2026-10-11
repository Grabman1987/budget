import { daysBetween } from '../date';

export const DEFAULT_ACCOUNT_REMINDER_DAYS = 35;
export const ACCOUNT_REMINDER_SETTING = 'display.account_reminder_days';
export const validAccountReminderDays = (days: unknown): days is number =>
  typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= 365;

export interface ReminderAccount {
  type: string;
  closedAt: string | null;
  bookingCount: number;
  openingDate: string;
  lastReconciledOn: string | null;
  lastValuedOn: string | null;
}

export function accountReminder(
  account: ReminderAccount,
  today: string,
  interval = DEFAULT_ACCOUNT_REMINDER_DAYS,
): { days: number; action: 'reconcile' | 'value' } | null {
  if (account.closedAt || !account.bookingCount || account.openingDate > today) return null;
  const manual = account.type === 'p2p' || account.type === 'other_asset';
  const checked = manual ? account.lastValuedOn : account.lastReconciledOn;
  const days = daysBetween(checked ?? account.openingDate, today);
  return days >= interval ? { days, action: manual ? 'value' : 'reconcile' } : null;
}
