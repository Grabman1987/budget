import { addDays, addMonths, daysBetween, lastDayOfMonth, monthOf } from '../date';

export interface ReviewAccount {
  type: string;
  onBudget: boolean;
  closedAt: string | null;
  openingDate: string;
  /** Current live bookings, excluding dates before opening or after the requested day. */
  bookingCount: number;
}

export interface AccountReviewStatus {
  state: 'inactive' | 'unreviewed' | 'checked' | 'due' | 'unsupported';
  policy: '14-days' | 'calendar-month' | 'unsupported' | 'legacy';
  supported: boolean;
  checkedOn: string | null;
  dueOn: string | null;
  days: number | null;
  action: 'reconcile' | 'value' | null;
}

/** Preserve the existing account groups: role alone never determines budget membership. */
export function accountReviewPolicy(account: Pick<ReviewAccount, 'type' | 'onBudget'>) {
  switch (account.type) {
    case 'credit_card':
      return '14-days';
    case 'checking':
    case 'cash':
    case 'savings':
      return account.onBudget ? '14-days' : 'calendar-month';
    case 'loan':
    case 'other_liability':
    case 'brokerage':
    case 'crypto':
    case 'p2p':
    case 'other_asset':
      return 'calendar-month';
    default:
      return 'unsupported';
  }
}

/** Calendar month, clamped to its last day; never a fixed thirty-day duration. */
export function nextAccountReviewMonth(day: string): string {
  const month = addMonths(monthOf(day), 1);
  const last = lastDayOfMonth(month);
  return `${month}-${String(Math.min(Number(day.slice(8)), Number(last.slice(8)))).padStart(2, '0')}`;
}

/**
 * Dates describe the statement scope. The separately required activity evidence describes
 * later real creation/restoration/financial edits, including backdated and same-day records.
 */
export function reviewStatus(
  account: ReviewAccount,
  checkedOn: string | null,
  lastBookingOn: string | null,
  today: string,
  activityAfterCheck: boolean,
): AccountReviewStatus {
  const policy = accountReviewPolicy(account);
  const manual = account.type === 'p2p' || account.type === 'other_asset';
  const result: AccountReviewStatus = {
    state: 'unsupported',
    policy,
    supported: policy !== 'unsupported',
    checkedOn,
    dueOn: null,
    days: null,
    action: policy === 'unsupported' ? null : manual ? 'value' : 'reconcile',
  };
  if (account.closedAt || account.openingDate > today) return { ...result, state: 'inactive' };
  if (policy === 'unsupported') return result;
  const checked = checkedOn !== null && checkedOn <= today ? checkedOn : null;
  const anchor = checked ?? account.openingDate;
  const dueOn = policy === '14-days' ? addDays(anchor, 14) : nextAccountReviewMonth(anchor);
  const days = daysBetween(anchor, today);
  const pendingActivity =
    activityAfterCheck ||
    (lastBookingOn !== null &&
      lastBookingOn <= today &&
      checked !== null &&
      lastBookingOn > checked);
  return {
    ...result,
    checkedOn: checked,
    dueOn,
    days,
    state:
      account.bookingCount === 0
        ? checked === null
          ? 'inactive'
          : 'checked'
        : checked !== null && !pendingActivity
          ? 'checked'
          : today >= dueOn
            ? 'due'
            : 'unreviewed',
  };
}
