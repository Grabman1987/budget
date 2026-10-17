import { closeEntryMonth, unfundedSavingsGoals } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { RevisionTable, useAmountPrivacy, type RevisionRow } from '@budget/ui';
import type { ReactNode } from 'react';
import { eur, longDay } from '../ledger/format';
import { ErrorNote } from '../ledger/states';
import { budgetQuery } from '../budget/budget-api';
import { goalsQuery } from '../budget/goals-api';
import { monthLabel, shiftMonth } from '../nav/month';
import { AppLink } from '../shell/app-link';
import type { Heute } from './api';

/** One row per source; the existing destinations own all writes and undo. */
export function AttentionBar({
  data,
  savingsRows = [],
  savingsError,
}: {
  data: Pick<Heute, 'stand' | 'nextSteps' | 'financeCheck' | 'attention' | 'accountReminders'>;
  savingsRows?: RevisionRow[];
  savingsError?: ReactNode;
}) {
  useAmountPrivacy();
  const rules = 'unavailable' in data.financeCheck ? [] : data.financeCheck.actionRules;
  const uncategorized = data.nextSteps.items.find((i) => i.kind === 'uncategorized');
  const overspending = data.nextSteps.items.filter((i) => i.kind === 'overspent').length;
  const reminders = data.accountReminders?.length ?? 0;
  const loanTermsMissing = data.attention.loanTermsMissing;
  const month = data.stand.today.slice(0, 7);
  const closeMonth = closeEntryMonth(data.stand.today);
  if (
    !overspending &&
    !closeMonth &&
    !rules.length &&
    !data.attention.inboxCount &&
    !data.attention.pendingCount &&
    !savingsRows.length &&
    !savingsError &&
    !reminders &&
    !loanTermsMissing
  )
    return null;
  return (
    <section className="heute-attention" aria-labelledby="attention-title">
      <h2 id="attention-title">Zu tun</h2>
      {data.stand.month && data.stand.month !== month && (
        <p className="heute-note">Stand heute · {longDay(data.stand.today)}</p>
      )}
      {(overspending > 0 || closeMonth) && (
        <div className="attention-row">
          <span>
            {overspending > 0
              ? `${overspending} ${overspending === 1 ? 'Kategorie' : 'Kategorien'} überzogen`
              : 'Monat abschließen'}
          </span>
          <div className="attention-actions">
            {overspending > 0 && (
              <AppLink to="/plan/monat" search={{ monat: month, ansicht: 'triage' }}>
                Plan prüfen
              </AppLink>
            )}
            {closeMonth && (
              <AppLink to={`/monatsabschluss/${closeMonth}`}>
                Monatsabschluss · {monthLabel(closeMonth)}
              </AppLink>
            )}
          </div>
        </div>
      )}
      {rules.length > 0 && (
        <div className="attention-row">
          <span>
            {rules.length} {rules.length === 1 ? 'Regelbefund' : 'Regelbefunde'} zum Handeln
          </span>
          <AppLink to="/einstellungen/regelwerk" hash={`rule-result-${rules[0]!.code}`}>
            Handeln
          </AppLink>
        </div>
      )}
      {(data.attention.inboxCount > 0 ||
        data.attention.pendingCount > 0 ||
        savingsRows.length > 0 ||
        savingsError) && (
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
      )}
      {reminders > 0 && (
        <div className="attention-row">
          <span>
            {reminders} {reminders === 1 ? 'Konto wartet' : 'Konten warten'} auf Prüfung
          </span>
          <AppLink to="/konten/pruefen" hash="account-reminder-title">
            Prüfen
          </AppLink>
        </div>
      )}
      {loanTermsMissing && (
        <div className="attention-row">
          <span>Kreditkonditionen fehlen</span>
          <AppLink to="/einstellungen/konten">Konditionen ergänzen</AppLink>
        </div>
      )}
    </section>
  );
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
