import { Button, useAmountPrivacy } from '@budget/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { PLAN_MONAT } from '../nav/pages';
import { monthLabel } from '../nav/month';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { useMonth } from '../shell/use-month';
import { IncomeBody } from '../expected/income-panel';
import { incomeQuery } from '../expected/api';
import { eur } from '../ledger/format';
import { IncomePayslips } from '../reports/payslip-income';
import { ExpectedDetailBack } from '../expected/detail-nav';
import { PLAN_ERWARTET } from '../nav/pages';
import { budgetActivityQuery, budgetQuery } from './budget-api';
import { ActivityContributions } from './activity-contributions';
import { EnvelopeDetails, EnvelopePanel } from './envelope-panel';
import { planRows } from './plan-model';
import './plan.css';

function PlanDetailBack({ month }: { month: string }) {
  const router = useRouter();
  const openedInApp = useLocation({ select: (location) => location.state.planDetailOpenedInApp });
  return (
    <div className="plan-detail-nav">
      <nav aria-label="Brotkrumen">
        <AppLink
          to="/plan/monat"
          search={{ monat: month }}
          onClick={(event) => {
            if (
              openedInApp &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey &&
              !event.altKey
            ) {
              event.preventDefault();
              router.history.back();
            }
          }}
        >
          Zurück zum Monat
        </AppLink>
      </nav>
    </div>
  );
}

export function EnvelopePage() {
  useAmountPrivacy();
  const { id } = useParams({ strict: false }) as { id: string };
  const [month] = useMonth();
  const client = useQueryClient();
  const query = budgetActivityQuery(month, id);
  const activity = useInfiniteQuery(query);
  const budget = { ...activity, data: activity.data?.pages[0] };
  const rows = budget.data
    ? planRows({
        ...budget.data,
        categories: budget.data.categories.map((c) => ({ ...c, hiddenAt: null })),
      })
    : [];
  const row = rows.find((r) => r.id === id);
  const [editing, setEditing] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [row?.id]);
  return (
    <PageFrame meta={PLAN_MONAT}>
      <div className="plan plan-detail">
        <PlanDetailBack month={month} />
        {budget.isPending && <LoadingNote what="Envelope" />}
        {budget.isError && (
          <ErrorNote what="Envelope" error={budget.error} onRetry={() => void budget.refetch()} />
        )}
        {budget.data && !row && <p role="status">Diese Kategorie ist nicht vorhanden.</p>}
        {row && (
          <section className="card insp-card" aria-labelledby="envelope-title">
            <h2 id="envelope-title" ref={heading} tabIndex={-1}>
              {row.name} · {monthLabel(month)}
            </h2>
            <ActivityContributions
              key={`${month}:${id}`}
              month={month}
              pages={activity.data?.pages ?? []}
              categories={budget.data!.categories}
              error={activity.error}
              loadingMore={activity.isFetchingNextPage}
              hasMore={activity.hasNextPage}
              onMore={() => void activity.fetchNextPage()}
              onReload={() => void client.resetQueries({ queryKey: query.queryKey, exact: true })}
            />
            <EnvelopeDetails month={month} row={row} />
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Zuweisen oder verschieben
            </Button>
          </section>
        )}
      </div>
      <EnvelopePanel
        month={month}
        row={editing ? row : undefined}
        rows={rows}
        toBeAssignedCents={budget.data?.summary.toBeAssignedCents ?? 0}
        onClose={() => setEditing(false)}
      />
    </PageFrame>
  );
}

export function PlanIncomePage() {
  useAmountPrivacy();
  const [month] = useMonth();
  const budget = useQuery(budgetQuery(month));
  const income = useQuery(incomeQuery(month));
  const expected = useLocation({
    select: (location) => location.pathname === '/plan/erwartet/einnahmen',
  });
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [month]);
  return (
    <PageFrame meta={expected ? PLAN_ERWARTET : PLAN_MONAT}
      income={income.data ? eur(income.data.receivedCents) : '–'}>
      <div className="plan plan-detail">
        {expected ? <ExpectedDetailBack /> : <PlanDetailBack month={month} />}
        <section className="card insp-card" aria-label="Einnahmen">
          <h2 ref={heading} tabIndex={-1}>
            Einnahmen {monthLabel(month)}
          </h2>
          <IncomeBody month={month} bookedCents={budget.data?.summary.incomeCents} />
        </section>
        <section className="card insp-card">
          <IncomePayslips key={month} month={month} />
        </section>
      </div>
    </PageFrame>
  );
}
