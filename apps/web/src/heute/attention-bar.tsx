import { unfundedSavingsGoals } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { RevisionTable, maskMoneyText, useAmountPrivacy, type RevisionRow } from '@budget/ui';
import type { ReactNode } from 'react';
import { eur, longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
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
  pending = false,
  savingsPending = false,
}: {
  data: AttentionData | undefined;
  savingsRows?: RevisionRow[];
  savingsError?: ReactNode;
  pending?: boolean;
  savingsPending?: boolean;
}) {
  useAmountPrivacy();
  const independent: AttentionTask[] = savingsRows.length || savingsError || savingsPending
    ? [{ id: 'review:work', kind: 'review' }] : [];
  const model = data ? attentionModel(data, { count: savingsRows.length, unavailable: !!savingsError || savingsPending })
    : { tasks: independent, visible: independent, remaining: [] };
  const financeMessage =
    data && 'unavailable' in data.financeCheck ? data.financeCheck.unavailable.message : null;
  const financeUnavailable = financeMessage !== null;
  const missingInputs =
    data && !('unavailable' in data.financeCheck) ? (data.financeCheck.counts?.notEvaluated ?? 0) : 0;
  if (
    data && !pending && !model.tasks.length &&
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
      savingsPending={savingsPending}
    />
  );
  return (
    <section className="heute-attention" aria-labelledby="attention-title" aria-busy={pending || undefined}>
      <h2 id="attention-title">Zu tun</h2>
      {data && data.stand.month !== data.stand.today.slice(0, 7) && (
        <p className="heute-note">Stand heute · {longDay(data.stand.today)}</p>
      )}
      {!data && (pending ? <LoadingNote what="Aufgaben aus Heute" /> : <p className="heute-note">Die weiteren Aufgaben benötigen den Heute-Abruf.</p>)}
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
      {!!data?.attention.monthCloseTasks?.unavailable.length && (
        <p className="heute-note">
          Ein gespeicherter Monatsabschluss kann nicht verglichen werden.
        </p>
      )}
      {!!data?.attention.contactReminders?.unavailableCount && (
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
  savingsPending,
}: {
  task: AttentionTask;
  data: AttentionData | undefined;
  savingsRows: RevisionRow[];
  savingsError?: ReactNode;
  savingsPending: boolean;
}) {
  if (task.kind === 'review') {
    const uncategorized = data?.nextSteps.items.find((item) => item.kind === 'uncategorized');
    return (
      <div className="attention-row">
        <span>
          {data && data.attention.inboxCount > 0 && <>{data.attention.inboxCount} unter Prüfen{uncategorized ? ` · ohne Kategorie: ${eur(uncategorized.cents)}` : ''}</>}
          {data && data.attention.pendingCount > 0 && <>{data.attention.inboxCount > 0 ? ' · ' : ''}{data.attention.pendingCount} unbestätigte Buchungen · bis {longDay(data.attention.pendingBefore)} (mindestens 7 Tage alt)</>}
        </span>
        <div className="attention-actions">
          {data && data.attention.inboxCount > 0 && <AppLink to="/konten/pruefen">Zuordnen</AppLink>}
          {data && data.attention.pendingCount > 0 && <AppLink to="/konten/buchungen" search={{ status: 'pending', bis: data.attention.pendingBefore }}>Bestätigen</AppLink>}
        </div>
        {(savingsRows.length > 0 || savingsPending || savingsError) && (
          <details className="attention-proposals" aria-busy={savingsPending || undefined}>
            <summary>{savingsRows.length > 0 ? <>{savingsRows.length} {savingsRows.length === 1 ? 'Sparplanausführung' : 'Sparplanausführungen'} prüfen</> : 'Sparplanvorschläge'}</summary>
            {savingsRows.length > 0 ? <RevisionTable rows={savingsRows} caption="Sparplanausführungen" /> : <p>{savingsPending ? 'Vorschläge werden geladen.' : 'Vorschläge nicht verfügbar.'}</p>}
          </details>
        )}
        {savingsPending && <LoadingNote what="Sparplanvorschläge" />}
        {savingsError}
      </div>
    );
  }
  if (!data) return null;
  const month = data.stand.today.slice(0, 7);
  const overspending = data.nextSteps.items.filter((item) => item.kind === 'overspent').length;
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
            {quoteReview > 0 && (
              <AppLink to="/vermoegen/portfolio/positionen">Kurse prüfen</AppLink>
            )}
            {data.attention.loanTermsMissing && (
              <AppLink to="/einstellungen/konten">Konditionen ergänzen</AppLink>
            )}
          </div>
        </div>
      );
  }
}

/** Ordinary funding work stays available below the fold, in ink. */
export function FundingNotes({ data, requestMonth }: { data: Heute | undefined; requestMonth?: string }) {
  const month = data?.stand.today.slice(0, 7) ?? requestMonth;
  // The empty key is disabled: no server month is guessed before the first verified context.
  const budget = useQuery({ ...budgetQuery(month ?? ''), enabled: !!month });
  const savings = useQuery({ ...goalsQuery(month ?? ''), enabled: !!month });
  const previous = useQuery({ ...goalsQuery(month ? shiftMonth(month, -1) : ''), enabled: !!month });
  if (!month) return <p className="heute-note">Für Finanzierungsgrundlagen fehlt der Monatskontext aus Heute.</p>;
  const budgetReady = !budget.isFetching && !budget.isPending && !budget.isError && !!budget.data;
  const savingsReady = !savings.isFetching && !savings.isPending && !savings.isError && !!savings.data;
  const previousReady = !previous.isFetching && !previous.isPending && !previous.isError && !!previous.data;
  const envelopes = budgetReady ? budget.data!.summary.envelopes : [];
  const goals = envelopes.filter((e) => e.target && e.needCents > 0);
  const complete = budgetReady && savingsReady && previousReady;
  const unfunded = complete ? unfundedSavingsGoals(
    savings.data!.goals,
    previous.data!.goals,
    envelopes.filter((e) => e.target).map((e) => e.categoryId),
  ) : [];
  if (complete && !goals.length && !unfunded.length)
    return null;
  return (
    <section className="heute-section" aria-label="Ziele finanzieren">
      <h2>Ziele finanzieren</h2>
      {!data && <p className="heute-note">Planmonat {monthLabel(month)}</p>}
      {data && data.stand.month !== month && (
        <p className="heute-note">Stand heute · {longDay(data.stand.today)}</p>
      )}
      {(budget.isFetching || budget.isPending || savings.isFetching || savings.isPending || previous.isFetching || previous.isPending) && <LoadingNote what="Finanzierungsgrundlagen" />}
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
      {budget.isError && !budget.isFetching && (
        <ErrorNote
          what="Envelope-Ziele"
          error={budget.error}
          onRetry={() => void budget.refetch()}
        />
      )}
      {savings.isError && !savings.isFetching && (
        <ErrorNote what="Sparziele" error={savings.error} onRetry={() => void savings.refetch()} />
      )}
      {previous.isError && !previous.isFetching && (
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
