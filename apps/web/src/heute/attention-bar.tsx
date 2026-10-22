import { unfundedSavingsGoals } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { RevisionTable, maskMoneyText, useAmountPrivacy, type RevisionRow } from '@budget/ui';
import type { ReactNode } from 'react';
import { eur, longDay } from '../ledger/format';
import { ErrorNote } from '../ledger/states';
import { ApiError } from '../api/http';
import { budgetQuery } from '../budget/budget-api';
import { goalsQuery } from '../budget/goals-api';
import { monthLabel, shiftMonth } from '../nav/month';
import { AppLink } from '../shell/app-link';
import type { Heute } from './api';
import {
  attentionModel,
  type AttentionAvailability,
  type AttentionData,
  type AttentionTask,
} from './attention-model';

/** The same source renderer serves the first four tasks and the explicit continuation. */
export function AttentionBar({
  data,
  savingsRows = [],
  savingsError,
}: {
  data: AttentionData;
  savingsRows?: RevisionRow[];
  savingsError?: ReactNode;
}) {
  useAmountPrivacy();
  const model = attentionModel(data, { count: savingsRows.length, unavailable: !!savingsError });
  const month = data.stand.today.slice(0, 7);
  if (!model.tasks.length && !model.availability.length) return null;
  const row = (task: AttentionTask) => (
    <AttentionRow key={task.id} task={task} data={data} savingsRows={savingsRows} savingsError={savingsError} />
  );
  return (
    <section className="heute-attention" aria-labelledby="attention-title">
      <h2 id="attention-title">Zu tun</h2>
      {data.stand.month && data.stand.month !== month && (
        <p className="heute-note">Stand heute · {longDay(data.stand.today)}</p>
      )}
      {model.visible.map(row)}
      {model.remaining.length > 0 && (
        <details className="attention-remaining">
          <summary>Weitere {model.remaining.length} Aufgaben</summary>
          {model.remaining.map(row)}
        </details>
      )}
      {model.availability.length > 0 && (
        <details className="attention-availability">
          <summary>Prüfungen teilweise nicht verfügbar</summary>
          <ul>
            {model.availability.map((item, index) => (
              <li key={index}><AvailabilityNote item={item} /></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function AttentionRow({ task, data, savingsRows, savingsError }: {
  task: AttentionTask;
  data: AttentionData;
  savingsRows: RevisionRow[];
  savingsError?: ReactNode;
}) {
  const rules = 'unavailable' in data.financeCheck ? [] : data.financeCheck.actionRules;
  const uncategorized = data.nextSteps.items.find((item) => item.kind === 'uncategorized');
  const overspending = data.nextSteps.items.filter((item) => item.kind === 'overspent').length;
  const reminders = data.accountReminders?.length ?? 0;
  const loanTermsMissing = data.attention.loanTermsMissing;
  const quoteReview = data.attention.quoteReview?.count ?? 0;
  const month = data.stand.today.slice(0, 7);
  switch (task.kind) {
    case 'plan':
      return (
        <div className="attention-row">
          <span>{overspending} {overspending === 1 ? 'Kategorie' : 'Kategorien'} überzogen</span>
          <AppLink to="/plan/monat" search={{ monat: month, ansicht: 'triage' }}>Plan prüfen</AppLink>
        </div>
      );
    case 'rules':
      return (
        <div className="attention-row">
          <span>{rules.length} {rules.length === 1 ? 'Regelbefund' : 'Regelbefunde'} zum Handeln</span>
          <AppLink to={`/heute/finanzcheck/${encodeURIComponent(rules[0]!.code)}`}>Handeln</AppLink>
        </div>
      );
    case 'review':
      return (
        <div className="attention-row">
          <span>
            {data.attention.inboxCount > 0 && (
              <>
                {data.attention.inboxCount} unter Prüfen
                {uncategorized ? ` · ohne Kategorie: ${eur(uncategorized.cents)}` : ''}
              </>
            )}
            {data.attention.pendingCount > 0 && (
              <>
                {data.attention.inboxCount > 0 ? ' · ' : ''}
                {data.attention.pendingCount} unbestätigte Buchungen · bis{' '}
                {longDay(data.attention.pendingBefore)} (mindestens 7 Tage alt)
              </>
            )}
          </span>
          <div className="attention-actions">
            {data.attention.inboxCount > 0 && <AppLink to="/konten/pruefen">Zuordnen</AppLink>}
            {data.attention.pendingCount > 0 && (
              <AppLink
                to="/konten/buchungen"
                search={{ status: 'pending', bis: data.attention.pendingBefore }}
              >
                Bestätigen
              </AppLink>
            )}
          </div>
          {savingsRows.length > 0 && (
            <details className="attention-proposals">
              <summary>
                {savingsRows.length}{' '}
                {savingsRows.length === 1 ? 'Sparplanausführung' : 'Sparplanausführungen'} prüfen
              </summary>
              <RevisionTable rows={savingsRows} caption="Sparplanausführungen" />
            </details>
          )}
          {savingsError}
        </div>
      );
    case 'contact': {
      const reminder = task.reminder;
      return <div className="attention-row">
        <span>{reminder.status === 'overdue'
          ? <>{maskMoneyText(reminder.name)}: offene Auslage seit {longDay(reminder.oldestOpenDate)} ({reminder.ageDays} Tage)</>
          : <>{maskMoneyText(reminder.name)}: Auslagenprüfung nicht verfügbar – Bewegungen außerhalb EUR</>}</span>
        <AppLink to={`/konten/kontakte/${encodeURIComponent(reminder.contactId)}`}>Kontakt prüfen</AppLink>
      </div>;
    }
    case 'accounts':
      return (
        <div className="attention-row">
          <span>
            {reminders > 0 && (
              <span>
                {reminders} {reminders === 1 ? 'Konto wartet' : 'Konten warten'} auf Prüfung
              </span>
            )}
            {quoteReview > 0 && (
              <>
                {reminders > 0 && ' · '}
                <span>
                  {quoteReview}{' '}
                  {quoteReview === 1
                    ? 'Wertpapier ohne aktuellen Kurs'
                    : 'Wertpapiere ohne aktuellen Kurs'}
                </span>
              </>
            )}
            {loanTermsMissing && (
              <>
                {(reminders > 0 || quoteReview > 0) && ' · '}
                <span>Kreditkonditionen fehlen</span>
              </>
            )}
          </span>
          <div className="attention-actions">
            {reminders > 0 && (
              <AppLink to="/konten/pruefen" hash="account-reminder-title">
                Prüfen
              </AppLink>
            )}
            {quoteReview > 0 && <AppLink to="/vermoegen/portfolio">Kurse prüfen</AppLink>}
            {loanTermsMissing && <AppLink to="/einstellungen/konten">Konditionen ergänzen</AppLink>}
          </div>
        </div>
      );
    case 'month-close':
      return (
        <div className="attention-row">
          <span>{monthLabel(task.task.month)} {task.task.kind === 'close' ? 'abschließen' : 'nach Abschluss geändert'}</span>
          <AppLink to={task.task.target}>{task.task.kind === 'close' ? 'Monatsabschluss öffnen' : 'Änderungen prüfen'}</AppLink>
        </div>
      );
  }
}

const comparisonReasons = {
  legacy: 'Kein vergleichbarer gespeicherter Stand vorhanden.',
  invalid_state: 'Der gespeicherte Vergleichsstand ist ungültig.',
  missing_price: 'Für den Vergleich fehlt ein Wertpapierkurs.',
  missing_fx: 'Für den Vergleich fehlt ein Wechselkurs.',
};

function AvailabilityNote({ item }: { item: AttentionAvailability }) {
  switch (item.kind) {
    case 'finance':
      return <>{maskMoneyText(item.message)} <AppLink to="/heute/finanzcheck">Prüfgrundlagen ansehen</AppLink></>;
    case 'rules':
      return <>{item.count} {item.count === 1 ? 'Regel konnte' : 'Regeln konnten'} nicht ausgewertet werden. <AppLink to="/heute/finanzcheck" hash="rw-pending">Fehlende Grundlagen prüfen</AppLink></>;
    case 'month-close-unknown':
      return <>Der Vergleich gespeicherter Monatsabschlüsse ist nicht verfügbar.</>;
    case 'month-close':
      return <>{item.comparison.month ? `${monthLabel(item.comparison.month)}: ` : 'Monatsvergleich: '}{comparisonReasons[item.comparison.reason]}{' '}
        {item.comparison.month && <AppLink to={`/monatsabschluss/${item.comparison.month}`}>Gespeicherten Abschluss prüfen</AppLink>}
      </>;
  }
}

function availableData<T>(query: { data: T | undefined; error: unknown }): T | undefined {
  return query.error instanceof ApiError && (query.error.status === 401 || query.error.status === 403)
    ? undefined : query.data;
}

/** Ordinary funding work stays available below the fold, in ink. */
export function FundingNotes({ data }: { data: { stand: Pick<Heute['stand'], 'today' | 'month'> } }) {
  const month = data.stand.today.slice(0, 7);
  const budget = useQuery(budgetQuery(month));
  const savings = useQuery(goalsQuery(month));
  const previous = useQuery(goalsQuery(shiftMonth(month, -1)));
  const envelopes = availableData(budget)?.summary.envelopes ?? [];
  const goals = envelopes.filter((e) => e.target && e.needCents > 0);
  const unfunded = unfundedSavingsGoals(
    availableData(savings)?.goals ?? [],
    availableData(previous)?.goals ?? [],
    envelopes.filter((e) => e.target).map((e) => e.categoryId),
  );
  if (!goals.length && !unfunded.length && !budget.isError && !savings.isError && !previous.isError)
    return null;
  return (
    <section className="heute-section" aria-label="Ziele finanzieren">
      <h2>Ziele finanzieren</h2>
      {[{ label: 'Monatsziele', query: budget }, { label: 'Sparziele', query: savings }, { label: 'Sparziele Vormonat', query: previous }].map(({ label, query }) =>
        query.dataUpdatedAt > 0 && (query.isError || query.isFetching || !navigator.onLine)
          ? <p className="heute-note" key={label}>{label} · Stand vom{' '}
            <time dateTime={new Date(query.dataUpdatedAt).toISOString()}>{new Date(query.dataUpdatedAt).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' })}</time>
          </p> : null)}
      {data.stand.month !== month && (
        <p className="heute-note">Stand heute · {longDay(data.stand.today)}</p>
      )}
      {goals.length > 0 && (
        <p>
          <AppLink to="/plan/monat" search={{ monat: month, ansicht: 'triage' }}>
            {goals.length} Monatsziele noch nicht finanziert
          </AppLink>
        </p>
      )}
      {unfunded.length > 0 && (
        <p>
          <AppLink to="/plan/sparziele" search={{ monat: month }}>
            {unfunded.length} Sparziele noch nicht finanziert
          </AppLink>
        </p>
      )}
      {budget.isError && (
        <ErrorNote
          what="Monatsziele"
          error={budget.error}
          onRetry={() => void budget.refetch()}
        />
      )}
      {savings.isError && (
        <ErrorNote what="Sparziele" error={savings.error} onRetry={() => void savings.refetch()} />
      )}
      {previous.isError && (
        <ErrorNote
          what="Sparziele Vormonat"
          error={previous.error}
          onRetry={() => void previous.refetch()}
        />
      )}
      <AppLink to="/reports/budgettreue">50/30/20 und Budgettreue erklären</AppLink>
    </section>
  );
}
