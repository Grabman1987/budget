import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INBOX_WARN_AGE_DAYS,
  DEFAULT_INBOX_WARN_COUNT,
  inboxWarns,
  validInboxWarnAgeDays,
  validInboxWarnCount,
} from './inbox-warning';

const t = { ageDays: DEFAULT_INBOX_WARN_AGE_DAYS, count: DEFAULT_INBOX_WARN_COUNT };

describe('inboxWarns', () => {
  it('is neutral at the thresholds and warns one step beyond', () => {
    expect(inboxWarns({ count: 10, overAgeCount: 0 }, t)).toBe(false);
    expect(inboxWarns({ count: 11, overAgeCount: 0 }, t)).toBe(true);
    expect(inboxWarns({ count: 1, overAgeCount: 1 }, t)).toBe(true);
  });
  it('defaults to 7 days and 10 entries and validates edits', () => {
    expect(t).toEqual({ ageDays: 7, count: 10 });
    expect([0, 1, 365, 366, 1.5].map(validInboxWarnAgeDays)).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
    expect([0, 1, 9999, 10_000].map(validInboxWarnCount)).toEqual([false, true, true, false]);
  });
});
