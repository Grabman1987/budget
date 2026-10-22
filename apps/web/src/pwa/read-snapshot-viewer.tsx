import { Button, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { todayInVienna } from '@budget/domain';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Heute } from '../heute/api';
import type { BudgetMonthView } from '../budget/budget-api';
import type { AccountList, BookingPage } from '../ledger/types';
import { eur, nativeCurrency } from '../ledger/format';
import {
  loadReadSnapshot, readSnapshotGeneration, readSnapshotRevision, subscribeReadSnapshots,
  type OfflineView, type ReadSnapshot,
} from './read-snapshot-store';

interface SavedResponse { source: string; payload: unknown }
const LABELS: Record<OfflineView, string> = {
  today: 'Heute', accounts: 'Kontostände', plan: 'Plan · aktueller Monat', bookings: 'Letzte Buchungen',
};
const timestamp = new Intl.DateTimeFormat('de-AT', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Vienna',
});

/** Local copies have no session, writable route, raw document preview or financial recalculation. */
export function OfflineReadViewer() {
  useAmountPrivacy();
  const revision = useSyncExternalStore(subscribeReadSnapshots, readSnapshotRevision, () => 0);
  const [view, setView] = useState<OfflineView>('today');
  const [loaded, setLoaded] = useState<{
    generation: number; view: OfflineView; snapshot?: ReadSnapshot<SavedResponse>;
  }>();
  useEffect(() => {
    let active = true;
    const generation = readSnapshotGeneration();
    void loadReadSnapshot<SavedResponse>(view, '').then((snapshot) => {
      if (active) setLoaded({ generation, view, ...(snapshot ? { snapshot } : {}) });
    });
    return () => { active = false; };
  }, [view, revision]);
  const snapshot = loaded?.generation === readSnapshotGeneration() && loaded.view === view
    ? loaded.snapshot : undefined;
  // A previous month's plan is never relabelled as the current month after midnight/restart.
  const data = view === 'plan' && snapshot &&
    (snapshot.data.payload as BudgetMonthView).summary.month !== todayInVienna().slice(0, 7)
    ? undefined : snapshot;
  return <section className="offline-read-viewer" aria-label="Gespeicherte Ansichten">
    <h2>Gespeicherte Ansichten</h2>
    <p>Nur lesbar · lokale Kopie dieser Website. Keine gespeicherte Anmeldung.
      Andere Seiten benötigen eine Verbindung.</p>
    <div className="offline-view-tabs" aria-label="Ansicht wählen">
      {(Object.keys(LABELS) as OfflineView[]).map((key) => <Button key={key}
        variant="ghost" aria-pressed={view === key} onClick={() => setView(key)}>{LABELS[key]}</Button>)}
    </div>
    <h3>{LABELS[view]}</h3>
    {data ? <>
      <p className="offline-stand" role="status">Stand vom {timestamp.format(data.fetchedAt)} · Nur lesbar</p>
      {view === 'today' && <SavedToday data={data.data.payload as Heute} />}
      {view === 'accounts' && <SavedAccounts data={data.data.payload as AccountList} />}
      {view === 'plan' && <SavedPlan data={data.data.payload as BudgetMonthView} />}
      {view === 'bookings' && <SavedBookings data={data.data.payload as BookingPage} />}
    </> : <p role="status">Für diese Ansicht ist kein gespeicherter Stand verfügbar.
      Öffne sie bei Verbindung, um den letzten erfolgreichen Abruf auf diesem Gerät zu behalten.</p>}
  </section>;
}
function MoneyFacts({ rows }: { rows: Array<[string, number | null | undefined]> }) {
  return <dl className="offline-facts">{rows.map(([label, amount]) => <div key={label}>
    <dt>{label}</dt><dd>{amount === undefined || amount === null ? 'Nicht verfügbar' : eur(amount)}</dd>
  </div>)}</dl>;
}
function SavedToday({ data }: { data: Heute }) {
  const net = 'unavailable' in data.netWorth ? undefined : data.netWorth;
  const check = 'unavailable' in data.financeCheck ? undefined : data.financeCheck;
  return <>
    <p>{data.stand.month} · {data.stand.period === 'payday' ? 'Bis Gehalt' : 'Monat'} ·
      {data.stand.from} bis {data.stand.to}</p>
    <MoneyFacts rows={[
      ['Budgetkonten', data.stand.budgetBalanceCents], ['Bedarf', data.lead.needCents],
      ['Wunsch', data.lead.wantCents], ['Offen', data.lead.openCents], ['Frei', data.lead.freeCents],
      ['Ausgegeben', data.budgetAnswer.spentCents], ['Geplant', data.budgetAnswer.plannedCents],
      ['Verbleibend', data.budgetAnswer.remainingCents], ['Tagesbudget', data.dailyBudget.perDayCents],
      ['Vermögen', net?.totalCents], ['Veränderung zum Vormonat', net?.deltaCents],
      ['Eingenommen', data.monthResult.earnedCents], ['Konsum', data.monthResult.consumptionCents],
      ['Gespart', data.monthResult.savedCents], ['Tiefpunkt der Prognose', data.balance.low?.cents],
    ]} />
    <h4>Zu tun</h4>
    <p>Posteingang: {data.attention.inboxCount} · Vorgemerkte Buchungen: {data.attention.pendingCount}</p>
    {data.nextSteps.items.map((item, index) => <p key={index}>
      {item.categoryName ?? (item.kind === 'uncategorized' ? 'Ohne Kategorie' : 'Plan prüfen')}
      {' · '}{item.count} · {eur(item.cents)}
    </p>)}
    {data.accountReminders.map((item) => <p key={item.accountId}>
      {item.accountName} · {item.action === 'reconcile' ? 'Abgleich' : 'Bewertung'} prüfen
    </p>)}
    <h4>Fällig · 14 Tage</h4>
    {data.upcoming14.map((item) => <p key={`${item.paymentId}-${item.dueDate}`}>
      {item.dueDate} · {item.name} · {eur(item.amountCents)}
    </p>)}
    <h4>Finanz-Check</h4>
    {check ? <>
      <p>{check.counts.ok} erfüllt · {check.counts.warn} Warnungen · {check.counts.bad} verletzt ·
        {check.counts.notEvaluated} nicht bewertet</p>
      {check.keyRules.map((item) => <p key={item.code}>{item.name} · {maskMoneyText(item.valueText)}</p>)}
    </> : <p>Nicht verfügbar</p>}
    <h4>Fixierte Kategorien</h4>
    {data.pinned.map((item) => <p key={item.id}>{item.name} · Verfügbar {eur(item.availableCents)}</p>)}
    <h4>Letzte Buchungen</h4>
    <ol className="offline-records">{data.lastBookings.map((item) => <li key={item.id}>
      <span>{item.date} · {item.payeeName ?? item.memo ?? 'Buchung'} · {item.accountName}</span>
      <strong>{eur(item.amountCents)}</strong>
    </li>)}</ol>
  </>;
}
function SavedAccounts({ data }: { data: AccountList }) {
  return <>
    <p>Bewertungsstand: {data.asOf}</p>
    <MoneyFacts rows={[['Vermögen in EUR', data.netWorthEurCents]]} />
    <ol className="offline-records">{data.accounts.map((account) => <li key={account.id}>
      <span>{account.name}{account.closedAt ? ' · geschlossen' : ''}</span>
      <strong>{nativeCurrency(account.balanceCents, account.currency)}</strong>
      <span>Bestätigt {nativeCurrency(account.clearedCents, account.currency)} · Vorgemerkt{' '}
        {nativeCurrency(account.unclearedCents, account.currency)}</span>
      <span>Wert in EUR: {account.valueEurCents === null ? 'Nicht verfügbar' : eur(account.valueEurCents)}</span>
    </li>)}</ol>
  </>;
}
function SavedPlan({ data }: { data: BudgetMonthView }) {
  const summary = data.summary;
  return <>
    <p>{summary.month}</p>
    <MoneyFacts rows={[
      ['Einkommen', summary.incomeCents], ['Zu verteilen', summary.toBeAssignedCents],
      ['Zugewiesen', summary.assignedCents], ['Aktivität', summary.activityCents],
      ['Verfügbar', summary.availableCents],
    ]} />
    <ol className="offline-records">{summary.envelopes.map((item) => <li key={item.categoryId}>
      <strong>{data.categories.find((category) => category.id === item.categoryId)?.name ?? 'Kategorie'}</strong>
      <span>Zugewiesen {eur(item.assignedCents)} · Aktivität {eur(item.activityCents)}</span>
      <span>Verfügbar {eur(item.availableCents)}</span>
    </li>)}</ol>
  </>;
}
function SavedBookings({ data }: { data: BookingPage }) {
  return <>
    <p>Letzte geladene Seite · {data.items.length} von {data.total} Buchungen</p>
    <ol className="offline-records">{data.items.map((item) => <li key={item.id}>
      <span>{item.date} · {item.payeeName ?? item.memo ?? 'Buchung'} · {item.accountName}</span>
      <strong>{nativeCurrency(item.amountCents, item.currency)}</strong>
      <span>{item.status === 'pending' ? 'Vorgemerkt' : item.status === 'confirmed' ? 'Bestätigt' : 'Abgeglichen'}</span>
      {item.splits.map((split) => <span key={split.id}>
        {split.categoryName ?? 'Ohne Kategorie'} · {nativeCurrency(split.amountCents, item.currency)}
      </span>)}
    </li>)}</ol>
  </>;
}
