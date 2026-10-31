import { useEffect, useState } from 'react';
import { Button, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import type { Heute } from '../heute/api';
import type { AccountList, BookingPage, ListedBooking } from '../ledger/types';
import type { BudgetMonthView } from '../budget/budget-api';
import { eur, longDay, nativeCurrency } from '../ledger/format';
import { currentMonth } from '../shell/use-month';
import {
  readSnapshots,
  subscribeSnapshotEpoch,
  type SnapshotKind,
  type Snapshot,
} from './snapshots';
import { QueueList } from './queue-ui';

type Saved = Partial<Record<SnapshotKind, Snapshot>>;
const stamp = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' });
const status = { pending: 'vorgemerkt', confirmed: 'bestätigt', reconciled: 'abgeglichen' };
const reviewStatus = {
  inactive: 'inaktiv',
  unreviewed: 'offen',
  checked: 'geprüft',
  due: 'fällig',
  unsupported: 'nicht unterstützt',
};
const occurrenceStatus = {
  expected: 'erwartet',
  received: 'erhalten',
  deviating: 'abweichend',
  missed: 'ausgeblieben',
  skipped: 'übersprungen',
};
const checkStatus = { ok: 'in Ordnung', warn: 'Hinweis', bad: 'kritisch' };
const targetKind = { monthly: 'monatlich', by_date: 'bis Datum', keep_balance: 'Bestand halten' };
const bookingCategories = (row: ListedBooking) =>
  row.splits
    .map((split) => split.categoryName)
    .filter(Boolean)
    .join(', ');
const savedMoney = (value: number | undefined | null) =>
  value == null ? 'Nicht verfügbar' : eur(value);

/** Render only the server's saved reminder result; older snapshots have no such field. */
export function SavedContactReminders({
  reminders,
}: {
  reminders?: Heute['attention']['contactReminders'];
}) {
  if (!reminders) return null;
  return (
    <>
      {reminders.items.length > 0 && (
        <ul aria-label="Kontakt-Erinnerungen">
          {reminders.items.map((item) => (
            <li key={item.contactId}>
              <span>
                {item.contactName} · seit {longDay(item.oldestDate)} offen
              </span>
              <strong>{eur(item.overdueCents)}</strong>
            </li>
          ))}
        </ul>
      )}
      {reminders.unavailableCount > 0 && (
        <p>
          Kontakt-Erinnerungen für {reminders.unavailableCount}{' '}
          {reminders.unavailableCount === 1 ? 'Kontakt' : 'Kontakte'} ohne EUR-Kontoblatt nicht
          verfügbar.
        </p>
      )}
    </>
  );
}

/** A separate surface keeps every live page's controls and mutation hooks unmounted offline. */
export function OfflineState({ onCapture }: { onCapture: () => void }) {
  useAmountPrivacy();
  const [saved, setSaved] = useState<Saved>({});
  const [view, setView] = useState<SnapshotKind | null>(() => {
    const path = window.location.pathname;
    if (path === '/') return 'heute';
    if (path === '/konten') return 'accounts';
    if (
      path === '/plan/monat' &&
      (!new URLSearchParams(location.search).has('monat') ||
        new URLSearchParams(location.search).get('monat') === currentMonth())
    )
      return 'plan';
    if (path === '/konten/buchungen' && !location.search) return 'bookings';
    return null;
  });
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void readSnapshots()
        .then((next) => {
          if (active) setSaved(next);
        })
        .catch(() => {
          if (active) setSaved({});
        });
    refresh();
    const unsubscribe = subscribeSnapshotEpoch(() => setSaved({}));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const selectedMonth = new URLSearchParams(location.search).get('monat') ?? currentMonth();
  const selectedPeriod = new URLSearchParams(location.search).get('period');
  const heuteKey = saved.heute ? new URL(saved.heute.key, location.origin).searchParams : null;
  const heute =
    saved.heute &&
    (location.pathname !== '/' ||
      (heuteKey?.get('month') === selectedMonth &&
        (!selectedPeriod || heuteKey.get('period') === selectedPeriod)))
      ? (saved.heute.data as Heute)
      : undefined;
  const accounts = saved.accounts?.data as AccountList | undefined;
  const plan =
    saved.plan?.key === `/api/budget/${currentMonth()}`
      ? (saved.plan?.data as BudgetMonthView | undefined)
      : undefined;
  const bookings = saved.bookings?.data as BookingPage | undefined;
  const categories = new Map(plan?.categories.map((row) => [row.id, row]) ?? []);
  const groups = new Map(plan?.groups.map((row) => [row.id, row.name]) ?? []);
  return (
    <main className="pwa-offline" id="main">
      <img src="/icons/budget.svg" width="48" height="48" alt="" />
      <h1>Budget ist offline</h1>
      <p>
        {view === null
          ? 'Für diese Seite brauchst du eine Verbindung.'
          : 'Gespeicherter letzter Abruf · nur lesend. Für aktuelle Daten brauchst du eine Verbindung.'}
      </p>
      <Button onClick={() => window.location.reload()}>Erneut verbinden</Button>
      <Button onClick={onCapture}>Buchung erfassen</Button>
      <QueueList />
      {view !== null && (
        <nav aria-label="Gespeicherte Ansichten" className="offline-nav">
          {(
            [
              ['heute', 'Heute'],
              ['accounts', 'Kontensalden'],
              ['plan', 'Plan'],
              ['bookings', 'Letzte Buchungen'],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              variant={view === key ? 'primary' : 'ghost'}
              onClick={() => setView(key)}
            >
              {label}
            </Button>
          ))}
        </nav>
      )}
      {view === null && <p>Für diese Seite ist offline kein letzter Stand gespeichert.</p>}
      {view === 'heute' && (
        <section aria-label="Heute" className="offline-view">
          <h2>Heute</h2>
          {heute && saved.heute ? (
            <>
              <Stamp snapshot={saved.heute} />
              <p>
                Ansicht: {heute.stand.month} ·{' '}
                {heute.stand.period === 'payday' ? 'Bis Gehalt' : 'Monat'}
              </p>
              <dl>
                <div>
                  <dt>Frei bis Gehalt</dt>
                  <dd>{eur(heute.lead.freeCents)}</dd>
                </div>
                <div>
                  <dt>Bedarf</dt>
                  <dd>{eur(heute.lead.needCents)}</dd>
                </div>
                <div>
                  <dt>Wunsch</dt>
                  <dd>{eur(heute.lead.wantCents)}</dd>
                </div>
                <div>
                  <dt>Offene Zahlungen</dt>
                  <dd>{eur(heute.lead.openCents)}</dd>
                </div>
                <div>
                  <dt>Budgetkonten</dt>
                  <dd>{eur(heute.stand.budgetBalanceCents)}</dd>
                </div>
                <div>
                  <dt>Heute ausgebbar</dt>
                  <dd>
                    {heute.dailyBudget.perDayCents === null
                      ? '–'
                      : eur(heute.dailyBudget.perDayCents)}
                  </dd>
                </div>
                <div>
                  <dt>Im Monat ausgegeben</dt>
                  <dd>{eur(heute.budgetAnswer.spentCents)}</dd>
                </div>
                <div>
                  <dt>Im Monat geplant</dt>
                  <dd>{eur(heute.budgetAnswer.plannedCents)}</dd>
                </div>
                <div>
                  <dt>Im Monat übrig</dt>
                  <dd>{eur(heute.budgetAnswer.remainingCents)}</dd>
                </div>
                <div>
                  <dt>Einnahmen im Monat</dt>
                  <dd>{eur(heute.monthResult.earnedCents)}</dd>
                </div>
                <div>
                  <dt>Konsum im Monat</dt>
                  <dd>{eur(heute.monthResult.consumptionCents)}</dd>
                </div>
                <div>
                  <dt>Gespart im Monat</dt>
                  <dd>{eur(heute.monthResult.savedCents)}</dd>
                </div>
                {'unavailable' in heute.netWorth ? (
                  <div>
                    <dt>Nettovermögen</dt>
                    <dd>{maskMoneyText(heute.netWorth.unavailable.message)}</dd>
                  </div>
                ) : (
                  <div>
                    <dt>Nettovermögen</dt>
                    <dd>{eur(heute.netWorth.totalCents)}</dd>
                  </div>
                )}
                {heute.nearestGoal && (
                  <div>
                    <dt>Nächstes Sparziel · {heute.nearestGoal.name}</dt>
                    <dd>
                      {eur(heute.nearestGoal.savedCents)} gespart ·{' '}
                      {eur(heute.nearestGoal.remainingCents)} offen
                    </dd>
                  </div>
                )}
              </dl>
              <h3>Pace · {heute.pace.month}</h3>
              <dl>
                <div>
                  <dt>Ausgegeben</dt>
                  <dd>{eur(heute.pace.figures.spentCents)}</dd>
                </div>
                <div>
                  <dt>Plan bis heute</dt>
                  <dd>{eur(heute.pace.figures.planToDateCents)}</dd>
                </div>
                <div>
                  <dt>Erwartet bis heute</dt>
                  <dd>{eur(heute.pace.figures.expectedToDateCents)}</dd>
                </div>
                <div>
                  <dt>Abweichung</dt>
                  <dd>{eur(heute.pace.figures.deltaCents)}</dd>
                </div>
                <div>
                  <dt>Prognose Monatsende</dt>
                  <dd>
                    {heute.pace.figures.forecastAvailable
                      ? eur(heute.pace.figures.forecastEndCents)
                      : 'Nicht verfügbar'}
                  </dd>
                </div>
                <div>
                  <dt>Limit</dt>
                  <dd>{eur(heute.pace.figures.limitCents)}</dd>
                </div>
                <div>
                  <dt>Variable Ausgaben bisher</dt>
                  <dd>{eur(heute.pace.figures.variableSoFarCents)}</dd>
                </div>
                <div>
                  <dt>Offene feste Zahlungen</dt>
                  <dd>{eur(heute.pace.figures.openFixedCents)}</dd>
                </div>
              </dl>
              <details>
                <summary>Pace-Tageswerte</summary>
                <ul>
                  {heute.pace.plan.map((value, index) => (
                    <li key={index}>
                      <span>
                        Tag {index + 1} · Ist {savedMoney(heute.pace.actual[index])} · Plan{' '}
                        {eur(value)} · Erwartet {savedMoney(heute.pace.expected[index])} ·
                        Hochrechnung {savedMoney(heute.pace.forecast[index])} · Einnahmen{' '}
                        {savedMoney(heute.pace.income[index])} · Vormonat{' '}
                        {savedMoney(heute.pace.previous[index])}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
              {heute.planningAccuracy && (
                <p>
                  Planungstreffer {heute.planningAccuracy.hits} von {heute.planningAccuracy.count} ·
                  Mittlere Abweichung{' '}
                  {heute.planningAccuracy.meanAbsoluteBp === null
                    ? 'nicht verfügbar'
                    : `${heute.planningAccuracy.meanAbsoluteBp} Basispunkte`}
                </p>
              )}
              <h3>Kontoverlauf und Prognose</h3>
              <ul>
                {heute.balance.actual.map((point) => (
                  <li key={`actual-${point.day}`}>
                    <span>{point.day} · Ist</span>
                    <strong>{eur(point.balanceCents)}</strong>
                  </li>
                ))}
                {heute.balance.forecast.map((point) => (
                  <li key={`forecast-${point.day}`}>
                    <span>
                      {point.day} · Prognose · variabel {eur(point.variableCents)}
                      {point.items
                        .map((item) => item.label)
                        .filter(Boolean)
                        .join(', ') &&
                        ` · ${point.items
                          .map((item) => item.label)
                          .filter(Boolean)
                          .join(', ')}`}
                    </span>
                    <strong>{eur(point.balanceCents)}</strong>
                  </li>
                ))}
              </ul>
              {heute.balance.salary && (
                <p>
                  Gehalt {heute.balance.salary.day} · {eur(heute.balance.salary.cents)}
                </p>
              )}
              {heute.balance.low && (
                <p>
                  Tiefpunkt {heute.balance.low.day} · {eur(heute.balance.low.cents)}
                </p>
              )}
              {'unavailable' in heute.netWorth ? null : (
                <dl>
                  <div>
                    <dt>Liquide Mittel</dt>
                    <dd>{eur(heute.netWorth.liquidCents)}</dd>
                  </div>
                  <div>
                    <dt>Anlagen</dt>
                    <dd>{eur(heute.netWorth.investedCents)}</dd>
                  </div>
                  <div>
                    <dt>Forderungen</dt>
                    <dd>{eur(heute.netWorth.receivableCents)}</dd>
                  </div>
                  <div>
                    <dt>Schulden</dt>
                    <dd>{eur(heute.netWorth.debtCents)}</dd>
                  </div>
                  <div>
                    <dt>Vermögenswerte</dt>
                    <dd>{eur(heute.netWorth.assetsCents)}</dd>
                  </div>
                  <div>
                    <dt>Verbindlichkeiten</dt>
                    <dd>{eur(heute.netWorth.liabilitiesCents)}</dd>
                  </div>
                  <div>
                    <dt>Veränderung im Monat</dt>
                    <dd>
                      {'unavailable' in heute.netWorth.monthChange
                        ? maskMoneyText(heute.netWorth.monthChange.unavailable.message)
                        : eur(heute.netWorth.monthChange.deltaCents)}
                    </dd>
                  </div>
                  <div>
                    <dt>Veränderung zum Vorjahr</dt>
                    <dd>{savedMoney(heute.netWorth.yearDeltaCents)}</dd>
                  </div>
                </dl>
              )}
              <h3>Verfügbarer Bedarf und Wunsch</h3>
              <ul>
                {[...heute.lead.items.need, ...heute.lead.items.want].map((row) => (
                  <li key={row.id}>
                    <span>{row.name}</span>
                    <strong>{eur(row.availableCents)}</strong>
                  </li>
                ))}
              </ul>
              <h3>Offen bis Gehalt</h3>
              <ul>
                {heute.lead.items.open.map((row) => (
                  <li key={row.id}>
                    <span>
                      {row.day} · {row.label}
                    </span>
                    <strong>{eur(row.cents)}</strong>
                  </li>
                ))}
              </ul>
              <h3>Angepinnte Kategorien</h3>
              <ul>
                {heute.pinned.map((row) => (
                  <li key={row.id}>
                    <span>
                      {row.name} · Zugewiesen {eur(row.assignedCents)} · Ausgegeben{' '}
                      {eur(row.spentCents)} · Budgetiert {eur(row.budgetedCents)} · Pace{' '}
                      {eur(row.paceMarkCents)}
                    </span>
                    <strong>Verfügbar {eur(row.availableCents)}</strong>
                  </li>
                ))}
              </ul>
              <h3>Finanz-Check</h3>
              {'unavailable' in heute.financeCheck ? (
                <p>{maskMoneyText(heute.financeCheck.unavailable.message)}</p>
              ) : (
                <>
                  <p>
                    {heute.financeCheck.counts.total} Regeln · {heute.financeCheck.counts.ok} in
                    Ordnung · {heute.financeCheck.counts.warn} Hinweise ·{' '}
                    {heute.financeCheck.counts.bad} kritisch ·{' '}
                    {heute.financeCheck.counts.notEvaluated} nicht ausgewertet
                  </p>
                  <ul>
                    {heute.financeCheck.keyRules.map((rule) => (
                      <li key={rule.code}>
                        <span>
                          {rule.name} · {maskMoneyText(rule.valueText)} · {checkStatus[rule.status]}
                        </span>
                        <strong>{rule.actionText ? maskMoneyText(rule.actionText) : ''}</strong>
                      </li>
                    ))}
                  </ul>
                  <ul>
                    {heute.financeCheck.actionRules.map((rule) => (
                      <li key={rule.code}>
                        <span>
                          {rule.name} · {maskMoneyText(rule.valueText)} · {checkStatus[rule.status]}
                        </span>
                        <strong>{rule.actionText ? maskMoneyText(rule.actionText) : ''}</strong>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <h3>Zu tun</h3>
              <dl>
                <div>
                  <dt>Posteingang</dt>
                  <dd>{heute.attention.inboxCount}</dd>
                </div>
                <div>
                  <dt>Vorgemerkte Buchungen</dt>
                  <dd>{heute.attention.pendingCount}</dd>
                </div>
                <div>
                  <dt>Vorgemerkt vor</dt>
                  <dd>{heute.attention.pendingBefore}</dd>
                </div>
                <div>
                  <dt>Fehlende Kreditbedingungen</dt>
                  <dd>{heute.attention.loanTermsMissing ? 'Ja' : 'Nein'}</dd>
                </div>
                {heute.attention.quoteReview && (
                  <div>
                    <dt>Kurse prüfen</dt>
                    <dd>{heute.attention.quoteReview.count}</dd>
                  </div>
                )}
              </dl>
              <ul>
                {heute.nextSteps.items.map((item, index) => (
                  <li key={`${item.kind}-${item.categoryId ?? index}`}>
                    <span>
                      {item.kind === 'overspent' ? 'Überzogen' : 'Ohne Kategorie'} ·{' '}
                      {item.categoryName ?? `${item.count} Buchungen`}
                    </span>
                    <strong>{eur(item.cents)}</strong>
                  </li>
                ))}
              </ul>
              {!!heute.attention.monthCloseTasks?.unavailable.length && (
                <p>
                  Abschlussvergleich für {heute.attention.monthCloseTasks.unavailable.length} Monate
                  nicht verfügbar.
                </p>
              )}
              <SavedContactReminders reminders={heute.attention.contactReminders} />
              <ul>
                {heute.accountReminders.map((item) => (
                  <li key={item.accountId}>
                    <span>
                      {item.accountName} ·{' '}
                      {item.action === 'reconcile' ? 'Kontostand prüfen' : 'Bewertung prüfen'}
                    </span>
                    <strong>{item.days} Tage</strong>
                  </li>
                ))}
              </ul>
              <ul>
                {heute.attention.monthCloseTasks?.tasks.map((task) => (
                  <li key={task.id}>
                    <span>
                      {task.month} ·{' '}
                      {task.kind === 'close' ? 'Monat abschließen' : 'Nach Abschluss geändert'}
                    </span>
                  </li>
                ))}
              </ul>
              <h3>Fällig 14 Tage</h3>
              <ul>
                {heute.upcoming14.map((row) => (
                  <li key={row.occurrenceId ?? row.paymentId}>
                    <span>
                      {row.dueDate} · {row.name} · {occurrenceStatus[row.status]}
                    </span>
                    <strong>{eur(row.amountCents)}</strong>
                  </li>
                ))}
              </ul>
              <h3>Geplante Ereignisse</h3>
              <ul>
                {heute.upcomingEvents.map((row) => (
                  <li key={`${row.eventId}-${row.date}`}>
                    <span>
                      {row.date} · {row.name} · geplant
                    </span>
                    <strong>{eur(row.amountCents)}</strong>
                  </li>
                ))}
              </ul>
              <h3>Letzte Buchungen</h3>
              <ul>
                {heute.lastBookings.map((row) => (
                  <li key={row.id}>
                    <span>
                      {row.date} · {row.payeeName ?? 'Ohne Empfänger'} · {row.accountName} ·{' '}
                      {row.categoryName ?? 'Ohne Kategorie'}
                      {row.memo && ` · ${row.memo}`} ·{' '}
                      {status[row.status as keyof typeof status] ?? row.status}
                    </span>
                    <strong>{eur(row.amountCents)}</strong>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Missing />
          )}
        </section>
      )}
      {view === 'accounts' && (
        <section aria-label="Kontensalden" className="offline-view">
          <h2>Kontensalden</h2>
          {accounts && saved.accounts ? (
            <>
              <Stamp snapshot={saved.accounts} />
              <p>
                Prüfstand {accounts.asOf} · Nettovermögen{' '}
                {accounts.netWorthEurCents === null
                  ? 'EUR-Wert unbekannt'
                  : eur(accounts.netWorthEurCents)}
              </p>
              <ul>
                {accounts.accounts.map((account) => (
                  <li key={account.id}>
                    <span>
                      {account.name}
                      {account.closedAt && ' · geschlossen'} · Gebucht{' '}
                      {nativeCurrency(account.clearedCents, account.currency)} · Vorgemerkt{' '}
                      {nativeCurrency(account.unclearedCents, account.currency)} · Prüfstatus{' '}
                      {account.reviewStatus
                        ? reviewStatus[account.reviewStatus.state]
                        : 'unbekannt'}{' '}
                      · Zuletzt geprüft {account.lastReconciledOn ?? 'unbekannt'}
                      {account.valueEurCents === null && ' · EUR-Wert unbekannt'}
                      {account.missingFxCurrencies.length > 0 &&
                        ` · Fehlender Kurs ${account.missingFxCurrencies.join(', ')}`}
                      {account.missingPriceSecurityIds.length > 0 &&
                        ` · ${account.missingPriceSecurityIds.length} fehlende Wertpapierkurse`}
                    </span>
                    <strong>
                      {nativeCurrency(account.balanceCents, account.currency)}
                      {account.valueEurCents !== null &&
                        account.currency !== 'EUR' &&
                        ` · ${eur(account.valueEurCents)}`}
                    </strong>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Missing />
          )}
        </section>
      )}
      {view === 'plan' && (
        <section aria-label="Plan des laufenden Monats" className="offline-view">
          <h2>Plan · {currentMonth()}</h2>
          {plan && saved.plan ? (
            <>
              <Stamp snapshot={saved.plan} />
              <dl>
                <div>
                  <dt>Zu verteilen</dt>
                  <dd>{eur(plan.summary.toBeAssignedCents)}</dd>
                </div>
                <div>
                  <dt>Übertrag</dt>
                  <dd>{eur(plan.summary.carryInCents)}</dd>
                </div>
                <div>
                  <dt>Einnahmen</dt>
                  <dd>{eur(plan.summary.incomeCents)}</dd>
                </div>
                <div>
                  <dt>Ungedeckt</dt>
                  <dd>{eur(plan.summary.uncoveredCents)}</dd>
                </div>
                <div>
                  <dt>Gehalten</dt>
                  <dd>{eur(plan.summary.heldCents)}</dd>
                </div>
                <div>
                  <dt>Zugewiesen</dt>
                  <dd>{eur(plan.summary.assignedCents)}</dd>
                </div>
                <div>
                  <dt>Aktivität</dt>
                  <dd>{eur(plan.summary.activityCents)}</dd>
                </div>
                <div>
                  <dt>Verfügbar</dt>
                  <dd>{eur(plan.summary.availableCents)}</dd>
                </div>
                <div>
                  <dt>Bar überzogen</dt>
                  <dd>{eur(plan.summary.cashOverspentCents)}</dd>
                </div>
                <div>
                  <dt>Kredit überzogen</dt>
                  <dd>{eur(plan.summary.creditOverspentCents)}</dd>
                </div>
                <div>
                  <dt>Buchungen ohne Kategorie</dt>
                  <dd>
                    {plan.summary.uncategorizedCount === undefined
                      ? 'Unbekannt'
                      : plan.summary.uncategorizedCount}
                  </dd>
                </div>
                {plan.summary.unclassified && (
                  <div>
                    <dt>Nicht klassifiziert</dt>
                    <dd>
                      {plan.summary.unclassified.count} · Zufluss{' '}
                      {eur(plan.summary.unclassified.inflowCents)} · Abfluss{' '}
                      {eur(plan.summary.unclassified.outflowCents)} · Netto{' '}
                      {eur(plan.summary.unclassified.netCents)}
                    </dd>
                  </div>
                )}
              </dl>
              <ul>
                {plan.summary.envelopes.map((row) => (
                  <li key={row.categoryId}>
                    <span>
                      {groups.get(categories.get(row.categoryId)?.groupId ?? '') ?? 'Ohne Gruppe'} ·{' '}
                      {categories.get(row.categoryId)?.name ?? row.categoryId} · Übertrag{' '}
                      {eur(row.carryCents)} · Zugewiesen {eur(row.assignedCents)} · Aktivität{' '}
                      {eur(row.activityCents)} · Überzogen {eur(row.overspentCents)} · Bar überzogen{' '}
                      {eur(row.cashOverspentCents)} · Kredit überzogen{' '}
                      {eur(row.creditOverspentCents)} · Kartenzahlung finanziert{' '}
                      {eur(row.fundedCardCents)} · Zielbetrag {eur(row.goalCents)} · Noch nötig{' '}
                      {eur(row.needCents)}
                      {row.dueMonth && ` · Fällig ${row.dueMonth}`}
                      {row.target &&
                        ` · Ziel ${targetKind[row.target.kind]} ${eur(row.target.amountCents)} ab ${row.target.validFrom}`}
                    </span>
                    <strong>Verfügbar {eur(row.availableCents)}</strong>
                  </li>
                ))}
              </ul>
              {plan.incomeTargets && (
                <>
                  <h3>Erwartetes Einkommen und Monatsziele</h3>
                  <p>
                    Quelle:{' '}
                    {plan.incomeTargets.source === 'expected'
                      ? 'Wiederkehrende Zahlungen'
                      : plan.incomeTargets.source === 'salary_rule'
                        ? 'Gehaltsregel'
                        : plan.incomeTargets.source === 'median'
                          ? 'Median der letzten drei Monate'
                          : 'nicht verfügbar'}
                    . Planungswert; erst eingegangenes Einkommen steht zum Verteilen bereit.
                  </p>
                  <dl>
                    <div>
                      <dt>Erwartetes Einkommen</dt>
                      <dd>{savedMoney(plan.incomeTargets.expectedCents)}</dd>
                    </div>
                    <div>
                      <dt>Diesem Monat zugerechnet</dt>
                      <dd>{savedMoney(plan.incomeTargets.assignedIncomeCents)}</dd>
                    </div>
                    <div>
                      <dt>Monatsziele</dt>
                      <dd>{eur(plan.incomeTargets.targetsCents)}</dd>
                    </div>
                    <div>
                      <dt>Vergleich</dt>
                      <dd>{savedMoney(plan.incomeTargets.differenceCents)}</dd>
                    </div>
                    <div>
                      <dt>Vom Vormonat zurückgehalten</dt>
                      <dd>{eur(plan.incomeTargets.previousHeldCents)}</dd>
                    </div>
                    <div>
                      <dt>Für Folgemonat zurückgehalten</dt>
                      <dd>{eur(plan.incomeTargets.heldCents)}</dd>
                    </div>
                    <div>
                      <dt>Noch zu finanzieren</dt>
                      <dd>{eur(plan.incomeTargets.unfundedCents)}</dd>
                    </div>
                  </dl>
                  <ul>
                    {plan.incomeTargets.unfundedCategoryIds.map((id) => (
                      <li key={id}>{categories.get(id)?.name ?? id}</li>
                    ))}
                  </ul>
                </>
              )}
              {plan.budgetMoney && (
                <>
                  <h3>Geld auf Budgetkonten</h3>
                  <p>
                    {eur(plan.budgetMoney.totalCents)} · Kredit genutzt{' '}
                    {eur(plan.budgetMoney.usedCreditCents)}
                  </p>
                  <ul>
                    {plan.budgetMoney.accounts.map((account) => (
                      <li key={account.id}>
                        <span>
                          {account.name} · Kredit genutzt {eur(account.usedCreditCents)} · Rahmen{' '}
                          {account.creditLineCents === null
                            ? 'nicht hinterlegt'
                            : eur(account.creditLineCents)}
                        </span>
                        <strong>{eur(account.balanceCents)}</strong>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {plan.summary.cards.length > 0 && (
                <>
                  <h3>Karten</h3>
                  <ul>
                    {plan.summary.cards.map((card, index) => (
                      <li key={card.accountId}>
                        <span>Karte {index + 1}</span>
                        <strong>Schuldenzuwachs {eur(card.cardDebtGrowthCents)}</strong>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <Missing />
          )}
        </section>
      )}
      {view === 'bookings' && (
        <section aria-label="Letzte Buchungen" className="offline-view">
          <h2>Letzte Buchungen</h2>
          {bookings && saved.bookings ? (
            <>
              <Stamp snapshot={saved.bookings} />
              <p>
                {bookings.total} Buchungen · EUR-Summe{' '}
                {bookings.sumEurCents == null ? 'unbekannt' : eur(bookings.sumEurCents)}
              </p>
              <ul>
                {bookings.items.map((row) => (
                  <li key={row.id}>
                    <span>
                      {row.date} · {row.payeeName ?? 'Ohne Empfänger'} · {row.accountName} ·{' '}
                      {status[row.status]}
                      {bookingCategories(row) && ` · ${bookingCategories(row)}`}
                      {row.memo && ` · ${row.memo}`}
                      {row.flag && ` · Markierung ${row.flag}`}
                      {row.transferAccountName && ` · Umbuchung ${row.transferAccountName}`}
                      {row.splits.map(
                        (split) =>
                          ` · ${split.categoryName ?? 'Ohne Kategorie'} ${nativeCurrency(split.amountCents, row.currency)}${split.memo ? ` (${split.memo})` : ''}`,
                      )}
                    </span>
                    <strong>
                      {nativeCurrency(row.amountCents, row.currency)}
                      {row.originalAmountCents !== null &&
                        row.originalCurrency &&
                        ` · Original ${nativeCurrency(row.originalAmountCents, row.originalCurrency)}`}
                      {row.balanceAfterCents !== null &&
                        ` · Saldo ${nativeCurrency(row.balanceAfterCents, row.currency)}`}
                    </strong>
                  </li>
                ))}
              </ul>
              {bookings.nextCursor && <p>Weitere ältere Buchungen nur mit Verbindung verfügbar.</p>}
            </>
          ) : (
            <Missing />
          )}
        </section>
      )}
    </main>
  );
}

function Stamp({ snapshot }: { snapshot: Snapshot }) {
  return <p className="offline-stamp">Stand vom {stamp.format(snapshot.fetchedAt)}</p>;
}
function Missing() {
  return <p>Kein gespeicherter Abruf vorhanden.</p>;
}
