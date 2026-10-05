import { unfundedSavingsGoals } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { Button, useAmountPrivacy } from '@budget/ui';
import { useState } from 'react';
import { eur, longDay } from '../ledger/format';
import { ErrorNote } from '../ledger/states';
import { budgetQuery } from '../budget/budget-api';
import { goalsQuery } from '../budget/goals-api';
import { shiftMonth } from '../nav/month';
import { AppLink } from '../shell/app-link';
import type { Heute } from './api';

/** Overspending has one home on Heute; other work is neutral until it needs action. */
export function AttentionBar({
  data,
}: {
  data: Pick<Heute, 'stand' | 'nextSteps' | 'financeCheck' | 'attention'>;
}) {
  useAmountPrivacy();
  const [expanded, setExpanded] = useState(false);
  const month = data.stand.today.slice(0, 7);
  const overspent = data.nextSteps.items.filter((i) => i.kind === 'overspent');
  const rules = 'unavailable' in data.financeCheck ? [] : data.financeCheck.actionRules;
  const amount = overspent.reduce((sum, i) => sum + i.cents, 0);
  const uncategorized = data.nextSteps.items.find((i) => i.kind === 'uncategorized');
  return (
    <section className="heute-attention" aria-labelledby="attention-title">
      <h2 id="attention-title">Braucht Aufmerksamkeit</h2>
      {overspent.length > 0 && (
        <>
          <div className="attention-row is-over">
            <strong>
              {overspent.length} {overspent.length === 1 ? 'Envelope' : 'Envelopes'} überzogen ·{' '}
              {eur(amount)} zu decken
            </strong>
            <AppLink to="/plan/monat" search={{ monat: month, ansicht: 'triage' }}>
              Alle decken
            </AppLink>
          </div>
          <ul className="attention-envelopes" id="attention-envelopes">
            {(expanded ? overspent : overspent.slice(0, 2)).map((item) => (
              <li key={item.categoryId} data-overspent={item.categoryId}>
                <span>{item.categoryName}</span>
                <AppLink to="/plan/monat" search={{ monat: month, kategorie: item.categoryId }}>
                  {eur(-item.cents)}
                </AppLink>
              </li>
            ))}
          </ul>
          {overspent.length > 2 && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              aria-controls="attention-envelopes"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Weniger zeigen' : `weitere ${overspent.length - 2}`}
            </Button>
          )}
        </>
      )}
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
          <AppLink to="/einstellungen/regelwerk">Handeln</AppLink>
        </div>
      )}
      {!overspent.length &&
        !data.attention.inboxCount &&
        !data.attention.pendingCount &&
        !rules.length && (
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
