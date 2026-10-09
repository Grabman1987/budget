import { unfundedSavingsGoals } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useAmountPrivacy } from '@budget/ui';
import { eur, longDay } from '../ledger/format';
import { ErrorNote } from '../ledger/states';
import { budgetQuery } from '../budget/budget-api';
import { goalsQuery } from '../budget/goals-api';
import { shiftMonth } from '../nav/month';
import { AppLink } from '../shell/app-link';
import type { Heute } from './api';

/** Overspending lives in the global top-bar chip; other work is neutral until it needs action. */
export function AttentionBar({
  data,
}: {
  data: Pick<Heute, 'stand' | 'nextSteps' | 'financeCheck' | 'attention'>;
}) {
  useAmountPrivacy();
  const rules = 'unavailable' in data.financeCheck ? [] : data.financeCheck.actionRules;
  const uncategorized = data.nextSteps.items.find((i) => i.kind === 'uncategorized');
  const overspending = data.nextSteps.items.some((i) => i.kind === 'overspent');
  const month = data.stand.today.slice(0, 7);
  return (
    <section className="heute-attention" aria-labelledby="attention-title">
      <h2 id="attention-title">Braucht Aufmerksamkeit</h2>
      {data.attention.inboxCount > 0 && (
        <div className="attention-row">
          <span>
            {data.attention.inboxCount} offen im Posteingang
            {uncategorized ? ` · ohne Kategorie: ${eur(uncategorized.cents)}` : ''}
          </span>
          <AppLink to="/konten/posteingang">Zuordnen</AppLink>
        </div>
      )}
      {data.attention.pendingCount > 0 && (
        <div className="attention-row">
          <span>
            {data.attention.pendingCount} unbestätigte Buchungen · bis{' '}
            {longDay(data.attention.pendingBefore)} (mindestens 7 Tage alt)
          </span>
          <AppLink
            to="/konten/buchungen"
            search={{ status: 'pending', bis: data.attention.pendingBefore }}
          >
            Bestätigen
          </AppLink>
        </div>
      )}
      {rules.length > 0 && (
        <div className="attention-row">
          <span>{rules.length} Regelbefunde zum Handeln</span>
          <AppLink to="/einstellungen/regelwerk" hash={`rule-result-${rules[0]!.code}`}>
            Handeln
          </AppLink>
        </div>
      )}
      {overspending && (
        <div className="attention-row">
          <span>Überziehungen im Plan prüfen</span>
          <AppLink to="/plan/monat" search={{ monat: month, ansicht: 'triage' }}>
            Plan prüfen
          </AppLink>
        </div>
      )}
      {!data.attention.inboxCount &&
        !data.attention.pendingCount &&
        !rules.length &&
        !('unavailable' in data.financeCheck) &&
        !data.financeCheck.counts?.notEvaluated &&
        !overspending && (
          <p className="heute-note">Keine offenen Aufgaben aus den Heute-Prüfungen.</p>
        )}
      {'unavailable' in data.financeCheck && (
        <p className="heute-note">
          Regelprüfungen nicht verfügbar: {data.financeCheck.unavailable.message}
        </p>
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
  return (
    <section className="heute-section" aria-label="Ziele finanzieren">
      <h2>Ziele finanzieren</h2>
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
