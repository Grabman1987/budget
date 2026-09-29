/**
 * Read-only reconciliation reminders for Actual 26.9.0.
 *
 * Actual stores accounts.last_reconciled as Date.now().toString() (epoch milliseconds).
 * The 26.9.0 UI also updates this field when exiting an unmatched reconciliation.
 * Therefore an Actual-recorded date is an activity timestamp, NOT proof that the
 * bank statement matched. Every result deliberately has verified:false.
 * Neither transactions[].date nor their reconciled flags are a substitute timestamp.
 * This module does not inspect manual verification settings or write any account state.
 *
 * accountReconciliation(account, settings, asOf) returns:
 * {id,name,status,reason,source,verified,recordedAt,recordedDate,daysSince,
 *  daysOverdue,daysUntilDue,nextDue,intervalDays,intervalWarning}.
 * status: 'actual-recorded' | 'due' | 'unknown' | 'excluded'.
 * unknown reasons: 'missing-date' | 'invalid-date' | 'future-date'.
 * recordedDate and all day differences use Europe/Vienna calendar dates, not 24h
 * elapsed durations. A reminder is due at daysSince >= intervalDays, so it has
 * daysOverdue:0 on its due date. Closed accounts are excluded.
 *
 * Interval: settings.accountReconciliationDays[account.id], positive integer days;
 * invalid/missing overrides use 7 (budget accounts) or 30 (off-budget accounts, Audit B9).
 * Invalid overrides additionally surface a warning.
 * Accepted date representations: native millisecond number/string, ISO calendar day,
 * or an ISO timestamp with explicit Z/offset. Offset-free clock times are ambiguous
 * and rejected. Future calendar dates remain visible but have no age or nextDue.
 *
 * reconciliationSummary(accounts, settings, asOf) returns active rows in accounts,
 * plus due (oldest first), unknown, upToDate, excluded and priority=[...due,...unknown],
 * with activeCount/dueCount/unknownCount/upToDateCount/excludedCount.
 */

const DAY_MS = 86_400_000;
const DEFAULT_INTERVAL_DAYS = 7;
const viennaDate = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit'});
const dateToDay = date => viennaDate.format(date);
const today = () => dateToDay(new Date());
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
const dayNumber = value => Date.parse(value + 'T12:00:00Z') / DAY_MS;
const addDays = (value, count) => new Date(Date.parse(value + 'T12:00:00Z') + count * DAY_MS).toISOString().slice(0, 10);
const compareNames = (a, b) => a.name.localeCompare(b.name, 'de-AT') || a.id.localeCompare(b.id);

// Off-budget accounts (platforms, depots, loans) are checked monthly by default (Audit B9);
// budget accounts weekly. A stored override wins in both cases.
const OFFBUDGET_INTERVAL_DAYS = 30;
const isFlag = value => value === true || value === 1 || value === '1';
export function defaultReconciliationInterval(account) {
  return isFlag(account?.offbudget) ? OFFBUDGET_INTERVAL_DAYS : DEFAULT_INTERVAL_DAYS;
}

function intervalFor(accountId, settings, account) {
  const fallback = defaultReconciliationInterval(account);
  const override = settings?.accountReconciliationDays?.[accountId];
  if (override === undefined || override === null || override === '') return {intervalDays: fallback, intervalWarning: null};
  const parsed = typeof override === 'number' ? override : typeof override === 'string' && /^\d+$/.test(override.trim()) ? Number(override.trim()) : NaN;
  // A bounded number also prevents malformed configuration from overflowing JS dates.
  if (Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 36500) return {intervalDays: parsed, intervalWarning: null};
  return {intervalDays: fallback, intervalWarning: 'invalid-interval'};
}

function readRecordedDate(raw) {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return {reason: 'missing-date', recordedAt: null, recordedDate: null};
  const value = typeof raw === 'string' ? raw.trim() : raw;
  if (validDay(value)) return {reason: null, recordedAt: value, recordedDate: value};
  let milliseconds = null;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
    const candidate = Number(value);
    if (Number.isSafeInteger(candidate) && candidate >= 0) milliseconds = candidate;
  } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) && validDay(value.slice(0, 10))) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) milliseconds = parsed;
  }
  if (milliseconds !== null) {
    const instant = new Date(milliseconds);
    if (Number.isFinite(instant.getTime())) {
      const recordedDate = dateToDay(instant);
      if (validDay(recordedDate)) return {reason: null, recordedAt: instant.toISOString(), recordedDate};
    }
  }
  return {reason: 'invalid-date', recordedAt: null, recordedDate: null};
}

export function accountReconciliation(account, settings = {}, asOf = today()) {
  if (!account || typeof account !== 'object') throw new TypeError('account must be an object');
  if (!validDay(asOf)) throw new TypeError('asOf must be a valid ISO calendar date');
  const id = String(account.id ?? ''), name = String(account.name ?? account.id ?? 'Unbekanntes Konto');
  const base = {id, name, asOf, source: 'actual-last-reconciled', verified: false, ...intervalFor(id, settings, account), recordedAt: null, recordedDate: null, daysSince: null, daysOverdue: null, daysUntilDue: null, nextDue: null};
  if (account.closed === true || account.closed === 1 || account.closed === '1') return {...base, status: 'excluded', reason: 'closed-account'};
  const recorded = readRecordedDate(account.last_reconciled);
  if (recorded.reason) return {...base, ...recorded, status: 'unknown'};
  if (recorded.recordedDate > asOf) return {...base, ...recorded, status: 'unknown', reason: 'future-date'};
  const daysSince = Math.round(dayNumber(asOf) - dayNumber(recorded.recordedDate));
  return {
    ...base, ...recorded, status: daysSince >= base.intervalDays ? 'due' : 'actual-recorded', reason: null,
    daysSince, daysOverdue: Math.max(0, daysSince - base.intervalDays), daysUntilDue: Math.max(0, base.intervalDays - daysSince),
    nextDue: addDays(recorded.recordedDate, base.intervalDays),
  };
}

export function reconciliationSummary(accounts, settings = {}, asOf = today()) {
  if (!Array.isArray(accounts)) throw new TypeError('accounts must be an array');
  if (!validDay(asOf)) throw new TypeError('asOf must be a valid ISO calendar date');
  const rows = accounts.map(account => accountReconciliation(account, settings, asOf));
  const active = rows.filter(row => row.status !== 'excluded');
  const due = active.filter(row => row.status === 'due').sort((a, b) => b.daysOverdue - a.daysOverdue || b.daysSince - a.daysSince || compareNames(a, b));
  const unknown = active.filter(row => row.status === 'unknown').sort(compareNames);
  const upToDate = active.filter(row => row.status === 'actual-recorded').sort((a, b) => a.daysUntilDue - b.daysUntilDue || compareNames(a, b));
  const excluded = rows.filter(row => row.status === 'excluded');
  return {
    asOf, accounts: active, due, unknown, upToDate, excluded, priority: [...due, ...unknown],
    activeCount: active.length, dueCount: due.length, unknownCount: unknown.length, upToDateCount: upToDate.length, excludedCount: excluded.length,
  };
}
