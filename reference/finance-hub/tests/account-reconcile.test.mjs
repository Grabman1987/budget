import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileCloseState} from '../account-reconcile.mjs';
import {accountHealth} from '../account-health.mjs';

const asOf = '2026-09-23';
const account = {id: 'bank', name: 'bankA - Konto', balance: 10000};
const check = {rangeFrom: '2026-09-23', rangeTo: '2026-09-23', bookedBalanceEURcents: 10000, status: 'complete', quality: 'manual', unresolved: []};
const healthFor = (settings = {accountSourceChecks: {bank: check}}, rows = []) => accountHealth(account, settings, rows, asOf);

test('a matched source check for today enables the explicit close', () => {
  const health = healthFor();
  assert.equal(health.status, 'matched');
  const state = reconcileCloseState({health, account, lastReconciledDate: null, asOf});
  assert.equal(state.enabled, true);
  assert.equal(state.status, 'ready');
  assert.equal(state.date, '2026-09-23');
  assert.equal(state.sourceBalanceEURcents, 10000);
});

test('a matching balance alone is not enough: partial, missing or differing checks stay blocked', () => {
  const partial = healthFor({accountSourceChecks: {bank: {...check, status: 'partial'}}});
  assert.equal(partial.status, 'partial');
  assert.equal(reconcileCloseState({health: partial, account, asOf}).enabled, false);

  const unresolved = healthFor({accountSourceChecks: {bank: {...check, unresolved: ['Buchung offen']}}});
  assert.equal(reconcileCloseState({health: unresolved, account, asOf}).enabled, false);

  const missing = healthFor({});
  assert.equal(missing.status, 'missing');
  assert.equal(reconcileCloseState({health: missing, account, asOf}).enabled, false);

  const differing = healthFor({accountSourceChecks: {bank: {...check, bookedBalanceEURcents: 9000}}});
  assert.equal(differing.status, 'difference');
  const blocked = reconcileCloseState({health: differing, account, asOf});
  assert.equal(blocked.enabled, false);
  assert.equal(blocked.date, null, 'a blocked state never hands a date to the writer');
});

test('an outdated source check is not closable, even though the numbers once matched', () => {
  const old = {...check, rangeFrom: '2026-09-01', rangeTo: '2026-09-01'};
  const health = healthFor({accountSourceChecks: {bank: old}});
  assert.equal(health.status, 'stale');
  assert.equal(reconcileCloseState({health, account, asOf}).enabled, false);
});

test('an already stored reconciliation is reported as closed instead of offered again', () => {
  const health = healthFor();
  const same = reconcileCloseState({health, account, lastReconciledDate: '2026-09-23', asOf});
  assert.equal(same.enabled, false);
  assert.equal(same.status, 'closed');
  assert.equal(same.label, 'Abgleich abgeschlossen');

  const later = reconcileCloseState({health, account, lastReconciledDate: '2026-09-25', asOf});
  assert.equal(later.status, 'closed');

  const earlier = reconcileCloseState({health, account, lastReconciledDate: '2026-09-01', asOf});
  assert.equal(earlier.enabled, true, 'an older reconciliation does not cover the newer cutoff');
});

test('closed accounts, missing Actual data and invalid cutoffs never enable the write', () => {
  const health = healthFor();
  assert.equal(reconcileCloseState({health, account: {...account, closed: true}, asOf}).enabled, false);
  assert.equal(reconcileCloseState({health, account, asOf, reconciliationAvailable: false}).enabled, false);
  assert.equal(reconcileCloseState({health: {...health, check: {...check, rangeTo: '2026-09-40'}}, account, asOf}).enabled, false);
  assert.equal(reconcileCloseState({health: {...health, check: {...check, bookedBalanceEURcents: 100.5}}, account, asOf}).enabled, false);
  assert.equal(reconcileCloseState({}).enabled, false);
});

test('a platform valuation is never treated as a reconcilable booked balance', () => {
  const offbudget = {id: 'p2p', name: 'Mintos', balance: 50000, offbudget: true};
  const settings = {platformSnapshots: {'mintos': {key: 'mintos', accountId: 'p2p', asOf, totalEURcents: 50000, source: 'Mintos', quality: 'manual'}}};
  const health = accountHealth(offbudget, settings, [], asOf);
  assert.notEqual(health.status, 'matched');
  assert.equal(reconcileCloseState({health, account: offbudget, asOf}).enabled, false);
});

// --- Paket 5 (Audit U-08, FG-15, U-09, FG-13, FG-14, CALC-22, U-12): dialog flow helpers ---
import {existsSync, readFileSync} from 'node:fs';
import {reconcileDialogPlan, nextCheckAccount, sourceCheckDraft, confirmAllCoverage, restoreSourceCheck} from '../account-reconcile.mjs';
import {buildReport, netWorthBreakdownSeries, reportPeriod, reportCoverageRows} from '../report-model.mjs';

test('live difference while typing compares the typed balance at the typed cutoff', () => {
  const rows = [{id: 'later', account: 'bank', date: '2026-09-23', amount: -3000, cleared: true}];
  const draft = sourceCheckDraft(account, {balanceEURcents: 13000, date: '2026-09-22'}, rows, asOf);
  assert.equal(draft.comparable, true);
  assert.equal(draft.ledgerAtSource, 13000);
  assert.equal(draft.difference, 0);
  assert.equal(sourceCheckDraft(account, {balanceEURcents: 12000, date: '2026-09-22'}, rows, asOf).difference, 1000);
  assert.equal(sourceCheckDraft(account, {balanceEURcents: null, date: '2026-09-22'}, rows, asOf).reason, 'no-amount');
  assert.equal(sourceCheckDraft(account, {balanceEURcents: 1, date: '2026-09-24'}, rows, asOf).reason, 'invalid-date');
  assert.equal(sourceCheckDraft(account, {balanceEURcents: 1, date: '2026-09-24'}, rows, asOf).difference, null);
});

test('after saving, the dialog offers close + coverage, close only, or the bookings from the cutoff', () => {
  const health = healthFor();
  const closeState = reconcileCloseState({health, account, asOf});
  const manual = {accountId: 'bank', connected: false, covered: false, defaultFrom: '2024-01-05'};
  const both = reconcileDialogPlan({health, closeState, coverageRow: manual});
  assert.equal(both.step, 'close');
  assert.equal(both.primary, 'close-and-coverage');
  assert.equal(both.coverageFrom, '2024-01-05');
  assert.equal(reconcileDialogPlan({health, closeState, coverageRow: {...manual, covered: true, source: 'manual', confirmedFrom: '2024-01-05'}}).primary, 'close');
  assert.equal(reconcileDialogPlan({health, closeState, coverageRow: {...manual, connected: true}}).primary, 'close');
  assert.equal(reconcileDialogPlan({health, closeState, coverageRow: null}).primary, 'close');
  const differing = healthFor({accountSourceChecks: {bank: {...check, bookedBalanceEURcents: 9000}}});
  const open = reconcileDialogPlan({health: differing, closeState: reconcileCloseState({health: differing, account, asOf}), coverageRow: manual});
  assert.equal(open.step, 'open');
  assert.equal(open.primary, 'open-transactions');
  assert.equal(open.date, '2026-09-23');
  const closed = reconcileDialogPlan({health, closeState: reconcileCloseState({health, account, lastReconciledDate: asOf, asOf}), coverageRow: manual});
  assert.equal(closed.step, 'closed');
  assert.equal(closed.primary, null);
});

test('next account walks through the accounts that still need a source action and wraps around', () => {
  const rows = [{id: 'a', actionNeeded: true}, {id: 'b', actionNeeded: false}, {id: 'c', actionNeeded: true}, {id: 'p', actionNeeded: true, kind: 'valuation'}];
  assert.equal(nextCheckAccount(rows, 'a').id, 'c');
  assert.equal(nextCheckAccount(rows, 'c').id, 'a');
  assert.equal(nextCheckAccount(rows, 'b').id, 'a', 'an account without action starts at the first open one');
  assert.equal(nextCheckAccount(rows, 'zzz').id, 'a');
  assert.equal(nextCheckAccount([{id: 'a', actionNeeded: true}], 'a'), null);
  assert.equal(nextCheckAccount([], 'a'), null);
});

test('restoring a source check takes the newest history entry of that account back', () => {
  const workspace = {settings: {accountSourceChecks: {bank: {...check, bookedBalanceEURcents: 5}}, accountSourceCheckHistory: [
    {...check, accountId: 'other', replacedAt: '2026-09-20T10:00:00Z'},
    {...check, accountId: 'bank', bookedBalanceEURcents: 1, replacedAt: '2026-09-21T10:00:00Z'},
    {...check, accountId: 'bank', bookedBalanceEURcents: 2, replacedAt: '2026-09-22T10:00:00Z'},
  ]}};
  const before = structuredClone(workspace);
  const result = restoreSourceCheck(workspace, 'bank');
  assert.equal(result.restored.bookedBalanceEURcents, 2);
  assert.equal(result.workspace.settings.accountSourceChecks.bank.bookedBalanceEURcents, 2);
  assert.equal('accountId' in result.workspace.settings.accountSourceChecks.bank, false);
  assert.deepEqual(result.workspace.settings.accountSourceCheckHistory.map(e => e.accountId), ['other', 'bank']);
  assert.deepEqual(workspace, before, 'the input workspace is not mutated');
  assert.throws(() => restoreSourceCheck(workspace, 'other-without'), /keinen früheren Quellenstand/);
  assert.throws(() => restoreSourceCheck({settings: {}}, 'bank'));
});

test('bulk coverage confirms every manual, unconfirmed account (open and closed) from its first booking', () => {
  const live = {accounts: [
    {id: 'bank', name: 'bankA', account_id: 'x', account_sync_source: 'enableBanking'},
    {id: 'visa', name: 'Visa'},
    {id: 'cash', name: 'Geldbörse'},
    {id: 'old', name: 'Altes Konto', closed: true},
    {id: 'empty', name: 'Leer'},
  ], rawTransactions: [
    {id: 't1', account: 'bank', date: '2024-01-02', amount: 1},
    {id: 't2', account: 'visa', date: '2024-03-05', amount: 1},
    {id: 't3', account: 'cash', date: '2025-01-01', amount: 1},
    {id: 't4', account: 'old', date: '2023-06-30', amount: 1},
  ], refreshedAt: '2026-09-23T10:00:00Z'};
  const workspace = {settings: {reportCoverage: {cash: {status: 'complete', rangeFrom: '2025-01-01', rangeTo: 'open', confirmedAt: '2026-09-01T00:00:00Z', source: 'manual', unresolved: []}}}};
  const result = confirmAllCoverage(live, workspace, '2026-09-23', {now: '2026-09-23T12:00:00.000Z'});
  assert.deepEqual(result.confirmed.map(row => [row.accountId, row.rangeFrom, row.closed]), [['visa', '2024-03-05', false], ['old', '2023-06-30', true]]);
  assert.deepEqual(result.skipped.map(row => row.accountId), ['empty']);
  assert.equal(result.pending, 2);
  assert.equal(result.closedPending, 1);
  assert.equal(result.workspace.settings.reportCoverage.visa.rangeTo, 'open');
  assert.equal(result.workspace.settings.reportCoverage.cash.confirmedAt, '2026-09-01T00:00:00Z', 'existing confirmations stay untouched');
  assert.equal(workspace.settings.reportCoverage.visa, undefined, 'the input workspace is not mutated');
  assert.equal(reportCoverageRows(live, result.workspace, '2026-09-23').filter(row => !row.connected && !row.covered).length, 1, 'only the account without bookings stays open');
  const again = confirmAllCoverage(live, result.workspace, '2026-09-23');
  assert.equal(again.confirmed.length, 0);
});

// Acceptance (3) of Paket 5, measured like scripts/kpi-check.mjs: the bulk click on the fixture
// yields the same "BESTÄTIGT" column (YTD: every net-worth point valued, no account uncovered).
const fixturePath = process.env.PREVIEW_FIXTURE || new URL('../private/preview-fixture-2026-09-24.json', import.meta.url);
test('bulk coverage on the dated fixture matches the kpi-check simulation', {skip: !existsSync(fixturePath) && 'private fixture not available'}, () => {
  const {live, workspace} = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const asOf = live.refreshedAt.slice(0, 10);
  const result = confirmAllCoverage(live, workspace, asOf, {now: asOf + 'T12:00:00.000Z'});
  const period = reportPeriod('YTD', asOf);
  const before = buildReport(live, workspace, {from: period.from, to: period.to, person: 'all'});
  const after = buildReport(live, result.workspace, {from: period.from, to: period.to, person: 'all'});
  assert.equal(after.coverage.uncoveredAccountIds.length, 0, 'no account stays uncovered');
  assert.ok(before.coverage.uncoveredAccountIds.length > 0);
  const series = netWorthBreakdownSeries(live, result.workspace, {from: period.from, to: period.to, scope: 'all'});
  assert.equal(series.filter(point => point.net !== null).length + '/' + series.length, '9/9');
  assert.equal(after.monthly.filter(row => row.coverageComplete).length, after.monthly.length, 'every YTD month is fully covered');
  assert.equal(after.monthlySummary.coveredMonths + '/' + after.monthlySummary.periodMonths, '8/9', 'the running month is never a full month');
});

// Nacharbeit Abnahme (1): the dialog is fed by the real reportCoverageRows. A source check saved
// the way src/data.js saveAccountSourceCheck stores it (rangeFrom = rangeTo = cutoff, complete)
// covers exactly that day, so `covered` is true, yet the account has no lasting confirmation.
import {coverageNeedsConfirmation} from '../account-reconcile.mjs';
import {saveReportCoverage} from '../report-model.mjs';
test('after a real saved source check the dialog still offers close + coverage from the first booking', () => {
  const cash = {id: 'cash', name: 'Geldbörse', balance: 10000};
  const live = {accounts: [cash, {id: 'bank', name: 'bankA', account_id: 'x', account_sync_source: 'enableBanking', balance: 0}],
    rawTransactions: [{id: 'c1', account: 'cash', date: '2025-02-03', amount: 10000, cleared: true}, {id: 'b1', account: 'bank', date: '2024-01-02', amount: 1}],
    refreshedAt: asOf + 'T10:00:00Z'};
  const saved = {source: 'Bargeld gezählt', observedAt: asOf + 'T09:00:00Z', bookedBalanceEURcents: 10000, rangeFrom: asOf, rangeTo: asOf, status: 'complete', unresolved: [], quality: 'manual'};
  const workspace = {settings: {accountSourceChecks: {cash: saved}}};
  const health = accountHealth(cash, workspace.settings, live.rawTransactions, asOf);
  const closeState = reconcileCloseState({health, account: cash, asOf});
  assert.equal(closeState.enabled, true);
  const coverageRow = reportCoverageRows(live, workspace, asOf).find(row => row.accountId === 'cash');
  assert.equal(coverageRow.covered, true, 'the saved check itself covers the cutoff day');
  assert.equal(coverageRow.source, 'source-check');
  assert.equal(coverageRow.confirmedFrom, null);
  const plan = reconcileDialogPlan({health, closeState, coverageRow});
  assert.equal(plan.primary, 'close-and-coverage');
  assert.equal(plan.coverageFrom, '2025-02-03');
  assert.equal(coverageNeedsConfirmation(coverageRow), true);

  // After the lasting confirmation the offer is plain "close"; bank accounts never need it.
  const confirmed = saveReportCoverage(workspace, {accountId: 'cash', rangeFrom: '2025-02-03', asOf, now: asOf + 'T12:00:00Z'});
  const confirmedRow = reportCoverageRows(live, confirmed, asOf).find(row => row.accountId === 'cash');
  assert.equal(confirmedRow.source, 'manual');
  assert.equal(reconcileDialogPlan({health, closeState, coverageRow: confirmedRow}).primary, 'close');
  const bankRow = reportCoverageRows(live, workspace, asOf).find(row => row.accountId === 'bank');
  assert.equal(coverageNeedsConfirmation(bankRow), false);

  // The bulk confirmation counts the same account as unconfirmed.
  const bulk = confirmAllCoverage(live, workspace, asOf, {now: asOf + 'T12:00:00Z'});
  assert.deepEqual(bulk.confirmed.map(row => [row.accountId, row.rangeFrom]), [['cash', '2025-02-03']]);
});
