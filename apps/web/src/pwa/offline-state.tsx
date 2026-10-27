import { useEffect, useState } from 'react';
import { Button, useAmountPrivacy } from '@budget/ui';
import type { Heute } from '../heute/api';
import type { AccountList, BookingPage, ListedBooking } from '../ledger/types';
import type { BudgetMonthView } from '../budget/budget-api';
import { eur, nativeCurrency } from '../ledger/format';
import { currentMonth } from '../shell/use-month';
import { readSnapshots, subscribeSnapshotEpoch, type SnapshotKind, type Snapshot } from './snapshots';
import { QueueList } from './queue-ui';

type Saved = Partial<Record<SnapshotKind, Snapshot>>;
const stamp = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' });
const status = { pending: 'vorgemerkt', confirmed: 'bestätigt', reconciled: 'abgeglichen' };
const bookingCategories = (row: ListedBooking) => row.splits.map((split) => split.categoryName).filter(Boolean).join(', ');

/** A separate surface keeps every live page's controls and mutation hooks unmounted offline. */
export function OfflineState({ onCapture }: { onCapture: () => void }) {
  useAmountPrivacy();
  const [saved, setSaved] = useState<Saved>({});
  const [view, setView] = useState<SnapshotKind | null>(() => {
    const path = window.location.pathname;
    if (path === '/') return 'heute';
    if (path === '/konten') return 'accounts';
    if (path === '/plan/monat' && (!new URLSearchParams(location.search).has('monat') || new URLSearchParams(location.search).get('monat') === currentMonth())) return 'plan';
    if (path === '/konten/buchungen' && !location.search) return 'bookings';
    return null;
  });
  useEffect(() => {
    let active = true;
    const refresh = () => void readSnapshots().then((next) => {
      if (active) setSaved(next);
    }).catch(() => {
      if (active) setSaved({});
    });
    refresh();
    const unsubscribe = subscribeSnapshotEpoch(() => setSaved({}));
    return () => { active = false; unsubscribe(); };
  }, []);
  const selectedMonth = new URLSearchParams(location.search).get('monat') ?? currentMonth();
  const selectedPeriod = new URLSearchParams(location.search).get('period');
  const heuteKey = saved.heute ? new URL(saved.heute.key, location.origin).searchParams : null;
  const heute = saved.heute && (location.pathname !== '/' ||
    (heuteKey?.get('month') === selectedMonth &&
      (!selectedPeriod || heuteKey.get('period') === selectedPeriod)))
    ? saved.heute.data as Heute : undefined;
  const accounts = saved.accounts?.data as AccountList | undefined;
  const plan = saved.plan?.key === `/api/budget/${currentMonth()}`
    ? saved.plan?.data as BudgetMonthView | undefined : undefined;
  const bookings = saved.bookings?.data as BookingPage | undefined;
  const categoryNames = new Map(plan?.categories.map((row) => [row.id, row.name]) ?? []);
  return (
    <main className="pwa-offline" id="main">
      <img src="/icons/budget.svg" width="48" height="48" alt="" />
      <h1>Budget ist offline</h1>
      <p>{view === null ? 'Für diese Seite brauchst du eine Verbindung.' : 'Gespeicherter letzter Abruf · nur lesend. Für aktuelle Daten brauchst du eine Verbindung.'}</p>
      <Button onClick={() => window.location.reload()}>Erneut verbinden</Button>
      <Button onClick={onCapture}>Buchung erfassen</Button>
      <QueueList />
      {view !== null && <nav aria-label="Gespeicherte Ansichten" className="offline-nav">
        {([['heute', 'Heute'], ['accounts', 'Kontensalden'], ['plan', 'Plan'], ['bookings', 'Letzte Buchungen']] as const).map(([key, label]) =>
          <Button key={key} variant={view === key ? 'primary' : 'ghost'} onClick={() => setView(key)}>{label}</Button>)}
      </nav>}
      {view === null && <p>Für diese Seite ist offline kein letzter Stand gespeichert.</p>}
      {view === 'heute' &&
      <section aria-label="Heute" className="offline-view">
        <h2>Heute</h2>
        {heute && saved.heute ? <>
          <Stamp snapshot={saved.heute} />
          <p>Ansicht: {heute.stand.month} · {heute.stand.period === 'payday' ? 'Bis Gehalt' : 'Monat'}</p>
          <dl>
            <div><dt>Frei bis Gehalt</dt><dd>{eur(heute.lead.freeCents)}</dd></div>
            <div><dt>Bedarf</dt><dd>{eur(heute.lead.needCents)}</dd></div>
            <div><dt>Wunsch</dt><dd>{eur(heute.lead.wantCents)}</dd></div>
            <div><dt>Offene Zahlungen</dt><dd>{eur(heute.lead.openCents)}</dd></div>
            <div><dt>Budgetkonten</dt><dd>{eur(heute.stand.budgetBalanceCents)}</dd></div>
            <div><dt>Heute ausgebbar</dt><dd>{heute.dailyBudget.perDayCents === null ? '–' : eur(heute.dailyBudget.perDayCents)}</dd></div>
            <div><dt>Im Monat ausgegeben</dt><dd>{eur(heute.budgetAnswer.spentCents)}</dd></div>
            <div><dt>Im Monat geplant</dt><dd>{eur(heute.budgetAnswer.plannedCents)}</dd></div>
            <div><dt>Im Monat übrig</dt><dd>{eur(heute.budgetAnswer.remainingCents)}</dd></div>
            <div><dt>Einnahmen im Monat</dt><dd>{eur(heute.monthResult.earnedCents)}</dd></div>
            <div><dt>Konsum im Monat</dt><dd>{eur(heute.monthResult.consumptionCents)}</dd></div>
            <div><dt>Gespart im Monat</dt><dd>{eur(heute.monthResult.savedCents)}</dd></div>
            {'unavailable' in heute.netWorth
              ? <div><dt>Nettovermögen</dt><dd>{heute.netWorth.unavailable.message}</dd></div>
              : <div><dt>Nettovermögen</dt><dd>{eur(heute.netWorth.totalCents)}</dd></div>}
          </dl>
          <h3>Verfügbarer Bedarf und Wunsch</h3>
          <ul>{[...heute.lead.items.need, ...heute.lead.items.want].map((row) => <li key={row.id}>
            <span>{row.name}</span><strong>{eur(row.availableCents)}</strong>
          </li>)}</ul>
          <h3>Offen bis Gehalt</h3>
          <ul>{heute.lead.items.open.map((row) => <li key={row.id}>
            <span>{row.day} · {row.label}</span><strong>{eur(row.cents)}</strong>
          </li>)}</ul>
          <h3>Fällig 14 Tage</h3>
          <ul>{heute.upcoming14.map((row) => <li key={row.occurrenceId ?? row.paymentId}>
            <span>{row.dueDate} · {row.name} · {row.status}</span>
            <strong>{eur(row.amountCents)}</strong>
          </li>)}</ul>
          <h3>Letzte Buchungen</h3>
          <ul>{heute.lastBookings.map((row) => <li key={row.id}>
            <span>{row.date} · {row.payeeName ?? 'Ohne Empfänger'} · {row.accountName}</span>
            <strong>{eur(row.amountCents)}</strong>
          </li>)}</ul>
        </> : <Missing />}
      </section>}
      {view === 'accounts' &&
      <section aria-label="Kontensalden" className="offline-view">
        <h2>Kontensalden</h2>
        {accounts && saved.accounts ? <>
          <Stamp snapshot={saved.accounts} />
          <ul>{accounts.accounts.map((account) => <li key={account.id}>
            <span>{account.name}{account.closedAt && ' · geschlossen'}{account.valueEurCents === null && ' · EUR-Wert unbekannt'}</span><strong>{nativeCurrency(account.balanceCents, account.currency)}</strong>
          </li>)}</ul>
        </> : <Missing />}
      </section>}
      {view === 'plan' &&
      <section aria-label="Plan des laufenden Monats" className="offline-view">
        <h2>Plan · {currentMonth()}</h2>
        {plan && saved.plan ? <>
          <Stamp snapshot={saved.plan} />
          <dl>
            <div><dt>Zu verteilen</dt><dd>{eur(plan.summary.toBeAssignedCents)}</dd></div>
            <div><dt>Zugewiesen</dt><dd>{eur(plan.summary.assignedCents)}</dd></div>
            <div><dt>Aktivität</dt><dd>{eur(plan.summary.activityCents)}</dd></div>
            <div><dt>Verfügbar</dt><dd>{eur(plan.summary.availableCents)}</dd></div>
          </dl>
          <ul>{plan.summary.envelopes.map((row) => <li key={row.categoryId}>
            <span>{categoryNames.get(row.categoryId) ?? row.categoryId}</span>
            <span>Zugewiesen {eur(row.assignedCents)} · Aktivität {eur(row.activityCents)}</span>
            <strong>Verfügbar {eur(row.availableCents)}</strong>
          </li>)}</ul>
        </> : <Missing />}
      </section>}
      {view === 'bookings' &&
      <section aria-label="Letzte Buchungen" className="offline-view">
        <h2>Letzte Buchungen</h2>
        {bookings && saved.bookings ? <>
          <Stamp snapshot={saved.bookings} />
          <ul>{bookings.items.map((row) => <li key={row.id}>
            <span>{row.date} · {row.payeeName ?? 'Ohne Empfänger'} · {row.accountName} · {status[row.status]}{bookingCategories(row) && ` · ${bookingCategories(row)}`}{row.memo && ` · ${row.memo}`}</span>
            <strong>{nativeCurrency(row.amountCents, row.currency)}</strong>
          </li>)}</ul>
        </> : <Missing />}
      </section>}
    </main>
  );
}

function Stamp({ snapshot }: { snapshot: Snapshot }) {
  return <p className="offline-stamp">Stand vom {stamp.format(snapshot.fetchedAt)}</p>;
}
function Missing() {
  return <p>Kein gespeicherter Abruf vorhanden.</p>;
}
