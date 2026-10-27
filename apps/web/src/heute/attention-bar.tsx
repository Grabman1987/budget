import { unfundedSavingsGoals } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { RevisionTable, maskMoneyText, useAmountPrivacy, type RevisionRow } from '@budget/ui';
import type { ReactNode } from 'react';
import { eur, longDay } from '../ledger/format';
import { ErrorNote } from '../ledger/states';
import { budgetQuery } from '../budget/budget-api';
import { goalsQuery } from '../budget/goals-api';
import { monthLabel, shiftMonth } from '../nav/month';
import { AppLink } from '../shell/app-link';
import type { Heute } from './api';
import { attentionModel, type AttentionData, type AttentionTask } from './attention-model';

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
  const financeMessage =
    'unavailable' in data.financeCheck ? data.financeCheck.unavailable.message : null;
  const financeUnavailable = financeMessage !== null;
  const missingInputs =
    'unavailable' in data.financeCheck ? 0 : (data.financeCheck.counts?.notEvaluated ?? 0);
  if (
    !model.tasks.length &&
    !data.attention.monthCloseTasks?.unavailable.length &&
    !data.attention.contactReminders?.unavailableCount &&
    !financeUnavailable &&
    !missingInputs
  )
    return null;
  const renderRow = (task: AttentionTask) => (
    <AttentionRow
      key={task.id}
      task={task}
      data={data}
      savingsRows={savingsRows}
      savingsError={savingsError}
    />
  );
  return (
    <section className="heute-attention" aria-labelledby="attention-title">
      <h2 id="attention-title">Zu tun</h2>
      {data.stand.month !== data.stand.today.slice(0, 7) && (
        <p className="heute-note">Stand heute · {longDay(data.stand.today)}</p>
      )}
      {model.visible.map(renderRow)}
      {model.remaining.length > 0 && (
        <details className="attention-remaining">
          <summary>Weitere {model.remaining.length} Aufgaben</summary>
          {model.remaining.map(renderRow)}
        </details>
      )}
      {(financeUnavailable || missingInputs > 0) && (
        <details className="attention-availability">
          <summary>Prüfgrundlagen teilweise nicht verfügbar</summary>
          <p>
            {financeMessage !== null
              ? maskMoneyText(financeMessage)
              : `${missingInputs} ${missingInputs === 1 ? 'Regel konnte' : 'Regeln konnten'} nicht ausgewertet werden.`}{' '}
            <AppLink to="/einstellungen/regelwerk">Regeln prüfen</AppLink>
          </p>
        </details>
      )}
      {!!data.attention.monthCloseTasks?.unavailable.length && (
        <p className="heute-note">
          Ein gespeicherter Monatsabschluss kann nicht verglichen werden.
        </p>
      )}
      {!!data.attention.contactReminders?.unavailableCount && (
        <p className="heute-note">
          Kontakt-Erinnerungen für {data.attention.contactReminders.unavailableCount}{' '}
          {data.attention.contactReminders.unavailableCount === 1 ? 'Kontakt' : 'Kontakte'} ohne
          EUR-Kontoblatt nicht verfügbar.
        </p>
      )}
    </section>
  );
}

function AttentionRow({
  task,
  data,
  savingsRows,
  savingsError,
}: {
  task: AttentionTask;
  data: AttentionData;
  savingsRows: RevisionRow[];
  savingsError?: ReactNode;
}) {
  const month = data.stand.today.slice(0, 7);
  const overspending = data.nextSteps.items.filter((item) => item.kind === 'overspent').length;
  const uncategorized = data.nextSteps.items.find((item) => item.kind === 'uncategorized');
  const rules =
    'unavailable' in data.financeCheck
      ? []
      : data.financeCheck.actionRules.filter((rule) => rule.status === 'bad');
  const reminders = data.accountReminders?.length ?? 0;
  const quoteReview = data.attention.quoteReview?.count ?? 0;
  switch (task.kind) {
    case 'contact':
      return (
        <div className="attention-row">
          <span>
            {task.contact.contactName}: {eur(task.contact.overdueCents)} seit{' '}
            {longDay(task.contact.oldestDate)} offen
          </span>
          <AppLink to={`/konten/kontakte/${encodeURIComponent(task.contact.contactId)}`}>
            Kontoblatt öffnen
          </AppLink>
        </div>
      );
    case 'plan':
      return (
        <div className="attention-row">
          <span>
            {overspending} {overspending === 1 ? 'Kategorie' : 'Kategorien'} überzogen
          </span>
          <AppLink to="/plan/monat" search={{ monat: month, ansicht: 'triage' }}>
            Plan prüfen
          </AppLink>
        </div>
      );
    case 'month-close':
      return (
        <div className="attention-row">
          <span>
            {monthLabel(task.task.month)}{' '}
            {task.task.kind === 'close' ? 'abschließen' : 'nach Abschluss geändert'}
          </span>
          <AppLink to={task.task.target}>Monatsabschluss öffnen</AppLink>
        </div>
      );
    case 'rules':
      return (
        <div className="attention-row">
          <span>
            {rules.length} {rules.length === 1 ? 'Regelbefund' : 'Regelbefunde'} zum Handeln
          </span>
          <AppLink to="/einstellungen/regelwerk" hash={`rule-result-${rules[0]!.code}`}>
            Handeln
          </AppLink>
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
    case 'accounts':
      return (
        <div className="attention-row">
          <span>
            {reminders > 0 && (
              <>
                {reminders} {reminders === 1 ? 'Konto wartet' : 'Konten warten'} auf Prüfung
              </>
            )}
            {quoteReview > 0 && (
              <>
                {reminders > 0 && ' · '}
                {quoteReview}{' '}
                {quoteReview === 1
                  ? 'Wertpapier ohne aktuellen Kurs'
                  : 'Wertpapiere ohne aktuellen Kurs'}
              </>
            )}
            {data.attention.loanTermsMissing && (
              <>{(reminders > 0 || quoteReview > 0) && ' · '}Kreditkonditionen fehlen</>
            )}
          </span>
          <div className="attention-actions">
            {reminders > 0 && (
              <AppLink to="/konten/pruefen" hash="account-reminder-title">
                Prüfen
              </AppLink>
            )}
            {quoteReview > 0 && <AppLink to="/vermoegen/portfolio/positionen">Kurse prüfen</AppLink>}
            {data.attention.loanTermsMissing && (
              <AppLink to="/einstellungen/konten">Konditionen ergänzen</AppLink>
            )}
          </div>
        </div>
      );
  }
}

/** Ordinary funding work stays available below the fold, in ink. */
export function FundingNotes({ data }: { data: Heute }) {
  const month = data.stand.today.slice(0, 7);
  const budget = useQuery(budgetQuery(month));
  const savings = useQuery(goalsQuery(month));
  const previous = useQuery(goalsQuery(shiftMonth(month, -1)));
  const envelopes = budget.data?.summary.envelopes ?? [];
  const goals = envelopes.filter((e) => e.target && e.needCents > 0);
  const unfunded = unfundedSavingsGoals(
    savings.data?.goals ?? [],
    previous.data?.goals ?? [],
    envelopes.filter((e) => e.target).map((e) => e.categoryId),
  );
  if (!goals.length && !unfunded.length && !budget.isError && !savings.isError && !previous.isError)
    return null;
  return (
    <section className="heute-section" aria-label="Ziele finanzieren">
      <h2>Ziele finanzieren</h2>
      {data.stand.month !== month && (
        <p className="heute-note">Stand heute · {longDay(data.stand.today)}</p>
      )}
      {goals.length > 0 && (
        <p>
          <AppLink to="/plan/monat" search={{ monat: month, ansicht: 'triage' }}>
            {goals.length} Envelope-Ziele noch nicht finanziert
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
          what="Envelope-Ziele"
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
