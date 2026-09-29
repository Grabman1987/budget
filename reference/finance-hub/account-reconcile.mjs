/**
 * When may the cockpit offer to close an Actual reconciliation?
 *
 * REVIEW-WORKFLOW.md is explicit: a matching balance alone is not a completed check,
 * and the display code must never compute a completion. This module therefore only
 * decides whether the *offer* may be shown. Writing `last_reconciled` stays an
 * explicit user action (documentAccountCheck), and that writer re-verifies the
 * balance against Actual before it stores anything.
 *
 * The condition mirrors the writer's own guards, so an enabled button cannot be
 * rejected for a reason the user could have seen beforehand.
 */
import {compareSourceBalance} from './account-health.mjs';
import {coverageContext, reportCoverageRows, saveReportCoverage} from './report-model.mjs';
const integer = Number.isSafeInteger;
const validDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T12:00Z')) && new Date(d + 'T12:00Z').toISOString().slice(0, 10) === d;

export const CLOSE_LABEL = 'Abgleich abschließen';

/**
 * @param health   accountHealth() row for the account (account-health.mjs).
 * @param account  the Actual account as loaded into the cockpit.
 * @param lastReconciledDate  'YYYY-MM-DD' already stored in Actual, or null.
 * @param asOf     today as 'YYYY-MM-DD'.
 * @param reconciliationAvailable  false when Actual did not return the field at all.
 */
export function reconcileCloseState({health, account, lastReconciledDate = null, asOf, reconciliationAvailable = true} = {}) {
  const date = health?.check?.rangeTo ?? null;
  const sourceBalanceEURcents = integer(health?.check?.bookedBalanceEURcents) ? health.check.bookedBalanceEURcents : null;
  const blocked = (reason, status = 'blocked') => ({enabled: false, status, date: null, sourceBalanceEURcents: null, label: CLOSE_LABEL, reason});

  if (!health || !account) return blocked('Kontodaten fehlen.');
  if (account.closed) return blocked('Das Konto ist geschlossen.');
  if (!reconciliationAvailable) return blocked('Actual liefert derzeit kein Abgleichdatum. Bitte die Daten neu laden.');
  // A platform valuation has no comparable booked balance; only a source check has.
  if (health.kind === 'valuation' || health.status !== 'matched')
    return blocked('Erst einen vollständigen Quellenstand ohne offene Hinweise erfassen, der zum Actual-Buchungssaldo am selben Stichtag passt.');
  if (!validDay(date) || !validDay(asOf) || date > asOf) return blocked('Der Stichtag des Quellenstands ist kein gültiges Prüfdatum.');
  if (sourceBalanceEURcents === null) return blocked('Im Quellenstand fehlt ein ganzzahliger Saldo in Cent.');
  if (health.comparison?.difference !== 0) return blocked('Am Stichtag besteht noch eine Differenz zum Actual-Buchungssaldo.');

  if (validDay(lastReconciledDate) && lastReconciledDate >= date)
    return {
      enabled: false, status: 'closed', date, sourceBalanceEURcents, label: 'Abgleich abgeschlossen',
      reason: lastReconciledDate === date
        ? 'Für diesen Stichtag ist der Abgleich in Actual bereits abgeschlossen.'
        : `In Actual ist bereits ein späterer Abgleich vom ${lastReconciledDate} gespeichert.`
    };

  return {
    enabled: true, status: 'ready', date, sourceBalanceEURcents, label: CLOSE_LABEL,
    reason: `Schließt den Actual-Abgleich bewusst mit dem Stichtag ${date} ab. Der Saldo wird dabei erneut gegen Actual geprüft.`
  };
}

// ---------------------------------------------------------------------------
// Dialog flow "Stand → Differenz → Abschluss → Abdeckung" (Audit U-08, FG-15, U-09,
// FG-13, FG-14, CALC-22, U-12). Everything below is pure: it plans what the dialog
// offers and prepares workspaces; the writes stay in src/data.js.
// ---------------------------------------------------------------------------
/** Live difference while the owner types: the Actual balance at the typed cutoff minus the typed balance. */
export function sourceCheckDraft(account, {balanceEURcents, date}, transactions = [], asOf) {
  if (!validDay(date) || !validDay(asOf) || date > asOf) return {comparable: false, reason: 'invalid-date', ledgerAtSource: null, difference: null};
  if (!integer(balanceEURcents)) return {comparable: false, reason: 'no-amount', ledgerAtSource: null, difference: null};
  const result = compareSourceBalance(account, {rangeFrom: date, rangeTo: date, bookedBalanceEURcents: balanceEURcents}, transactions, asOf);
  return {comparable: result.comparable, reason: result.reason, ledgerAtSource: result.ledgerAtSource, difference: result.difference, pending: result.pending, explainedByPending: result.explainedByPending};
}

/**
 * Does a report coverage row still need the one-time confirmation „Buchungen vollständig ab“?
 * `covered` alone is the wrong test: reportCoverageRows checks the single day asOf, and a
 * source check saved for today covers exactly that day (source 'source-check'). Only a
 * stored manual confirmation covering today or a bank connection makes the offer unnecessary.
 */
export function coverageNeedsConfirmation(row) {
  return Boolean(row && !row.connected && row.source !== 'manual');
}

/**
 * What the dialog offers after a source check was saved.
 * close-and-coverage: difference 0, complete, no open notes, manual account without confirmation
 * close: same, but the account is bank-connected or already covered
 * open-transactions: a difference (or open notes) remains → bookings from the cutoff on
 */
export function reconcileDialogPlan({health, closeState, coverageRow = null} = {}) {
  const date = health?.check?.rangeTo ?? null;
  if (closeState?.status === 'closed') return {step: 'closed', date, primary: null, coverage: false, reason: closeState.reason};
  if (closeState?.enabled) {
    const coverage = coverageNeedsConfirmation(coverageRow);
    return {step: 'close', date, primary: coverage ? 'close-and-coverage' : 'close', coverage, reason: closeState.reason, coverageFrom: coverage ? coverageRow.defaultFrom : null};
  }
  return {step: 'open', date, primary: 'open-transactions', coverage: false, reason: closeState?.reason || 'Der Quellenstand passt noch nicht zum Actual-Buchungssaldo.'};
}

/** The next account that still needs a source action, after the current one (wrapping around). */
export function nextCheckAccount(rows = [], currentId = null) {
  const open = rows.filter(row => row && row.actionNeeded && row.kind !== 'valuation');
  if (!open.length) return null;
  const index = open.findIndex(row => row.id === currentId);
  if (index < 0) return open[0];
  return open.length === 1 ? null : open[(index + 1) % open.length];
}

/**
 * Bulk confirmation for the report coverage panel (Audit CALC-22): every account without
 * bank connection and without confirmation, from its first booking on. Closed accounts are
 * included: their ledger cannot change any more, yet a closed account with bookings in a
 * month keeps that month a "Teilbestand" until it is confirmed (kpi-check.mjs measures the same).
 */
export function confirmAllCoverage(live, workspace, asOf, {now = new Date().toISOString()} = {}) {
  const rows = reportCoverageRows(live, workspace, asOf);
  const {firstBooking} = coverageContext(live, asOf);
  const stored = workspace?.settings?.reportCoverage || {};
  const candidates = [
    ...rows.filter(coverageNeedsConfirmation).map(row => ({accountId: row.accountId, name: row.name, firstBooking: row.firstBooking, closed: false})),
    ...(live?.accounts || []).filter(account => account?.id && account.closed && !account.account_sync_source && stored[account.id]?.status !== 'complete')
      .map(account => ({accountId: account.id, name: account.name || '', firstBooking: firstBooking.get(account.id) || null, closed: true}))
  ];
  const confirmed = [], skipped = [];
  let next = workspace;
  for (const row of candidates) {
    if (!validDay(row.firstBooking)) {skipped.push({accountId: row.accountId, name: row.name, closed: row.closed, reason: 'Noch keine Buchung erfasst.'}); continue;}
    next = saveReportCoverage(next, {accountId: row.accountId, rangeFrom: row.firstBooking, asOf, now});
    confirmed.push({accountId: row.accountId, name: row.name, rangeFrom: row.firstBooking, closed: row.closed});
  }
  return {workspace: next, confirmed, skipped, pending: candidates.filter(row => validDay(row.firstBooking)).length, closedPending: candidates.filter(row => row.closed && validDay(row.firstBooking)).length};
}

/** Undo for a saved source check: the newest history entry of the account becomes current again. */
export function restoreSourceCheck(workspace, accountId) {
  if (typeof accountId !== 'string' || !accountId) throw Error('Bitte ein Konto wählen.');
  const history = Array.isArray(workspace?.settings?.accountSourceCheckHistory) ? workspace.settings.accountSourceCheckHistory : [];
  let index = -1;
  for (let i = history.length - 1; i >= 0; i--) if (history[i]?.accountId === accountId) {index = i; break;}
  if (index < 0) throw Error('Für dieses Konto gibt es keinen früheren Quellenstand.');
  const next = structuredClone(workspace);
  const {accountId: _id, replacedAt: _at, ...previous} = next.settings.accountSourceCheckHistory.splice(index, 1)[0];
  next.settings.accountSourceChecks ||= {};
  next.settings.accountSourceChecks[accountId] = previous;
  return {workspace: next, restored: previous};
}
