/** Warning thresholds for the Prüfen counter (Einstellungen › Darstellung). */
export const INBOX_WARN_AGE_SETTING = 'display.inbox_warn_age_days';
export const INBOX_WARN_COUNT_SETTING = 'display.inbox_warn_count';
export const DEFAULT_INBOX_WARN_AGE_DAYS = 7;
export const DEFAULT_INBOX_WARN_COUNT = 10;

export const validInboxWarnAgeDays = (days: unknown): days is number =>
  typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= 365;
export const validInboxWarnCount = (count: unknown): count is number =>
  typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= 9999;

export interface InboxWarnFacts {
  /** All open Prüfen entries. */
  count: number;
  /** Open uncategorised bookings older than the age threshold. */
  overAgeCount: number;
}

/**
 * Neutral within the thresholds. Warning when any uncategorised booking is older than `ageDays`
 * (age threshold + 1 day) or when more than `count` entries are open (count threshold + 1).
 */
export const inboxWarns = (facts: InboxWarnFacts, thresholds: { ageDays: number; count: number }) =>
  facts.overAgeCount > 0 || facts.count > thresholds.count;
