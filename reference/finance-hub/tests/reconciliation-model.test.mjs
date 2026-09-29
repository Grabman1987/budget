import test from 'node:test';
import assert from 'node:assert/strict';
import {accountReconciliation, reconciliationSummary, defaultReconciliationInterval} from '../reconciliation-model.mjs';

const account = (last_reconciled, more = {}) => ({id: 'a', name: 'bankA', last_reconciled, ...more});
const check = (raw, asOf = '2026-09-22', settings = {}) => accountReconciliation(account(raw), settings, asOf);

test('native Actual millisecond number and numeric string normalize to Vienna date', () => {
  const milliseconds = Date.parse('2026-09-21T22:30:00Z');
  for (const value of [milliseconds, String(milliseconds), ` ${milliseconds} `]) {
    const result = check(value);
    assert.equal(result.recordedAt, '2026-09-21T22:30:00.000Z');
    assert.equal(result.recordedDate, '2026-09-22');
    assert.equal(result.daysSince, 0);
    assert.equal(result.status, 'actual-recorded');
    assert.equal(result.verified, false);
    assert.equal(result.source, 'actual-last-reconciled');
  }
});

test('calendar-day ages use Vienna summer/winter offsets rather than the UTC date', () => {
  assert.equal(check('2026-09-21T22:30:00Z').daysSince, 0);
  assert.equal(check('2026-01-21T22:30:00Z', '2026-01-22').daysSince, 1);
  assert.equal(check('2026-01-21T23:30:00Z', '2026-01-22').daysSince, 0);
  assert.equal(check('2026-09-22T00:30:00+02:00').recordedDate, '2026-09-22');
});

test('DST changes do not turn calendar-day reminders into 23-hour or 25-hour rules', () => {
  const spring = check('2026-03-28T22:30:00Z', '2026-03-30');
  assert.equal(spring.recordedDate, '2026-03-28');
  assert.equal(spring.daysSince, 2);
  assert.equal(spring.nextDue, '2026-04-04');
  const autumn = check('2026-10-24T22:30:00Z', '2026-10-26');
  assert.equal(autumn.recordedDate, '2026-10-25');
  assert.equal(autumn.daysSince, 1);
});

test('due boundary is day 7, overdue only after the due calendar date', () => {
  const before = check('2026-09-16');
  assert.equal(before.status, 'actual-recorded');
  assert.equal(before.daysSince, 6);
  assert.equal(before.daysUntilDue, 1);
  assert.equal(before.daysOverdue, 0);
  const boundary = check('2026-09-15');
  assert.equal(boundary.status, 'due');
  assert.equal(boundary.nextDue, '2026-09-22');
  assert.equal(boundary.daysOverdue, 0);
  assert.equal(boundary.daysUntilDue, 0);
  const late = check('2026-09-14');
  assert.equal(late.status, 'due');
  assert.equal(late.daysOverdue, 1);
});

test('missing dates stay unknown instead of becoming never reconciled or 1970', () => {
  for (const value of [null, undefined, '', '  ']) {
    const result = check(value);
    assert.equal(result.status, 'unknown');
    assert.equal(result.reason, 'missing-date');
    assert.equal(result.daysSince, null);
    assert.equal(result.daysOverdue, null);
    assert.equal(result.nextDue, null);
  }
});

test('malformed dates and ambiguous timestamp strings are explicitly invalid', () => {
  for (const value of ['2026-02-30', '2026-02-30T10:00:00Z', '22.09.2026', '2026-09-22T10:00', '2026-09-22T25:00Z', '1e12', 'NaN', -1, NaN, Infinity, 1.5, {}, true, 9007199254740991]) {
    const result = check(value);
    assert.equal(result.status, 'unknown', String(value));
    assert.equal(result.reason, 'invalid-date', String(value));
    assert.equal(result.recordedDate, null);
    assert.equal(result.nextDue, null);
  }
});

test('future Vienna date is unknown even if its UTC date still equals asOf', () => {
  const result = check('2026-09-22T22:30:00Z');
  assert.equal(result.recordedDate, '2026-09-23');
  assert.equal(result.status, 'unknown');
  assert.equal(result.reason, 'future-date');
  assert.equal(result.daysSince, null);
  assert.equal(result.nextDue, null);
  assert.equal(result.verified, false);
});

test('per-account intervals are isolated, configurable, and validated', () => {
  const settings = {accountReconciliationDays: {a: 3, b: '14'}};
  const a = accountReconciliation(account('2026-09-18'), settings, '2026-09-22');
  const b = accountReconciliation(account('2026-09-18', {id: 'b'}), settings, '2026-09-22');
  assert.equal(a.intervalDays, 3);
  assert.equal(a.status, 'due');
  assert.equal(a.daysOverdue, 1);
  assert.equal(b.intervalDays, 14);
  assert.equal(b.status, 'actual-recorded');
  assert.equal(b.nextDue, '2026-10-02');
  assert.equal(accountReconciliation(account('2026-09-18', {id: 'c'}), settings, '2026-09-22').intervalDays, 7);
  for (const value of [0, -1, 1.5, Infinity, 'bad', true, 100000]) {
    const invalid = check('2026-09-18', '2026-09-22', {accountReconciliationDays: {a: value}});
    assert.equal(invalid.intervalDays, 7);
    assert.equal(invalid.intervalWarning, 'invalid-interval');
  }
});

test('summary excludes closed accounts and prioritizes due accounts independently of unknown dates', () => {
  const rows = [
    account('2026-09-10', {id: 'older'}),
    account(null, {id: 'missing', name: 'Fehlendes Datum'}),
    account('2026-09-15', {id: 'today'}),
    account('2026-09-21', {id: 'fresh'}),
    account('2020-01-01', {id: 'closed', closed: true}),
    account(null, {id: 'closed-raw', closed: 1}),
    account('garbage', {id: 'bad', name: 'Ungültiges Datum'}),
  ];
  const result = reconciliationSummary(rows, {}, '2026-09-22');
  assert.equal(result.activeCount, 5);
  assert.equal(result.dueCount, 2);
  assert.equal(result.unknownCount, 2);
  assert.equal(result.upToDateCount, 1);
  assert.equal(result.excludedCount, 2);
  assert.deepEqual(result.due.map(row => row.id), ['older', 'today']);
  assert.deepEqual(result.priority.map(row => row.id), ['older', 'today', 'missing', 'bad']);
  assert.ok(result.excluded.every(row => row.reason === 'closed-account'));
  assert.ok(result.accounts.every(row => row.verified === false));
});

test('ISO dates cross leap-day and year-end correctly, including epoch zero', () => {
  assert.equal(check('2024-02-27', '2024-03-05').nextDue, '2024-03-05');
  assert.equal(check('2025-12-28', '2026-01-04').nextDue, '2026-01-04');
  const epoch = check(0, '1970-01-08');
  assert.equal(epoch.recordedDate, '1970-01-01');
  assert.equal(epoch.daysSince, 7);
  assert.equal(epoch.status, 'due');
});

test('model never infers verification from transaction flags, manual notes or settings', () => {
  const result = accountReconciliation({...account(null), reconciled: true, lastTransactionDate: '2026-09-22', notes: 'geprüft'}, {verifiedAt: '2026-09-22', lastReconciled: '2026-09-22'}, '2026-09-22');
  assert.equal(result.status, 'unknown');
  assert.equal(result.reason, 'missing-date');
  assert.equal(result.verified, false);
});

test('input data is untouched and invalid asOf is rejected even for an empty summary', () => {
  const rows = [account('2026-09-15'), account(null, {id: 'b'})];
  const settings = {accountReconciliationDays: {a: 3}};
  const original = JSON.stringify({rows, settings});
  reconciliationSummary(rows, settings, '2026-09-22');
  assert.equal(JSON.stringify({rows, settings}), original);
  assert.throws(() => check('2026-09-15', '2026-02-30'), /valid ISO/);
  assert.throws(() => reconciliationSummary([], {}, 'bad'), /valid ISO/);
  assert.throws(() => accountReconciliation(null), /object/);
});


test('off-budget accounts default to a 30-day interval, budget accounts to 7 (Audit B9); overrides still win', () => {
  assert.equal(defaultReconciliationInterval({offbudget: true}), 30);
  assert.equal(defaultReconciliationInterval({offbudget: 1}), 30);
  assert.equal(defaultReconciliationInterval({offbudget: false}), 7);
  assert.equal(defaultReconciliationInterval(undefined), 7);
  const platform = {id: 'p2p', name: 'Mintos', offbudget: true, last_reconciled: '2026-09-01'};
  const row = accountReconciliation(platform, {}, '2026-09-22');
  assert.equal(row.intervalDays, 30);
  assert.equal(row.status, 'actual-recorded');
  assert.equal(row.nextDue, '2026-10-01');
  assert.equal(accountReconciliation(platform, {accountReconciliationDays: {p2p: 7}}, '2026-09-22').status, 'due');
  assert.equal(accountReconciliation({...platform, offbudget: false}, {}, '2026-09-22').status, 'due');
  assert.equal(accountReconciliation(platform, {accountReconciliationDays: {p2p: 'bad'}}, '2026-09-22').intervalDays, 30);
});
