import { unfundedSavingsGoals } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { budgetQuery } from '../budget/budget-api';
import { goalsQuery } from '../budget/goals-api';
import { inboxCountQuery } from '../inbox/api';
import { shiftMonth } from '../nav/month';
import { AppLink } from '../shell/app-link';
import type { Heute } from './api';

/** All attention links use today's month, even when Heute shows a bookmarked past month. */
export function AttentionBar({ data }: { data: Heute }) {
  const month = data.stand.today.slice(0, 7);
  const budget = useQuery(budgetQuery(month));
  const inbox = useQuery(inboxCountQuery());
  const savings = useQuery(goalsQuery(month));
  const previousSavings = useQuery(goalsQuery(shiftMonth(month, -1)));
  const envelopes = budget.data?.summary.envelopes ?? [];
  const overspent = envelopes.filter((e) => e.overspentCents > 0);
  const goals = envelopes.filter((e) => e.target && e.needCents > 0);
  const unfundedSavings = unfundedSavingsGoals(
    savings.data?.goals ?? [],
    previousSavings.data?.goals ?? [],
    envelopes.filter((e) => e.target).map((e) => e.categoryId),
  );
  const uncovered = data.upcoming14.filter((p) => p.covered === false);
  if (
    !overspent.length &&
    !goals.length &&
    !unfundedSavings.length &&
    !inbox.data?.count &&
    !uncovered.length
  )
    return null;
  return (
    <section className="heute-attention" aria-labelledby="attention-title">
      <h2 id="attention-title">
        <AlertTriangle size={18} aria-hidden="true" />
        Braucht Aufmerksamkeit
      </h2>
      <div>
        {overspent.length > 0 && (
          <AppLink to="/plan/monat" search={{ monat: month, ansicht: 'triage' }}>
            {overspent.length} überzogene Envelopes
          </AppLink>
        )}
        {goals.length > 0 && (
          <AppLink to="/plan/monat" search={{ monat: month, ansicht: 'triage' }}>
            {goals.length} Ziele diesen Monat nicht finanziert
          </AppLink>
        )}
        {unfundedSavings.length > 0 && (
          <AppLink to="/plan/sparziele" search={{ monat: month }}>
            {unfundedSavings.length} Sparziele diesen Monat nicht finanziert
          </AppLink>
        )}
        {(inbox.data?.count ?? 0) > 0 && (
          <AppLink to="/konten/posteingang">{inbox.data!.count} offen im Posteingang</AppLink>
        )}
        {uncovered.map((p) => (
          <AppLink
            key={`${p.paymentId}-${p.dueDate}`}
            to="/plan/monat"
            search={{
              monat: p.dueDate.slice(0, 7),
              ...(p.categoryId ? { kategorie: p.categoryId } : {}),
            }}
          >
            {p.name}: nicht gedeckt
          </AppLink>
        ))}
      </div>
    </section>
  );
}
