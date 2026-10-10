import { Button, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useParams, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { PLAN_MONAT } from '../nav/pages';
import { monthLabel } from '../nav/month';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { useMonth } from '../shell/use-month';
import { IncomeBody } from '../expected/income-panel';
import { ExpectedDetailBack } from '../expected/detail-nav';
import { PLAN_ERWARTET } from '../nav/pages';
import { budgetQuery } from './budget-api';
import { EnvelopeDetails, EnvelopePanel } from './envelope-panel';
import { planRows } from './plan-model';
import './plan.css';

function PlanDetailBack({ month, title }: { month: string; title: string }) {
  const router = useRouter();
  const openedInApp = useLocation({ select: (location) => location.state.planDetailOpenedInApp });
  return (
    <div className="plan-detail-nav">
      <nav aria-label="Brotkrumen">
        <AppLink to="/plan/monat" search={{ monat: month }}>
          Plan · Monat
        </AppLink>
        {' › '}
        <span aria-current="page">{title}</span>
      </nav>
      <AppLink
        to="/plan/monat"
        search={{ monat: month }}
        onClick={(event) => {
          if (openedInApp && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
            event.preventDefault();
            router.history.back();
          }
        }}
      >
        Zurück zum Monat
      </AppLink>
    </div>
  );
}

export function EnvelopePage() {
  useAmountPrivacy();
  const { id } = useParams({ strict: false }) as { id: string };
  const [month] = useMonth();
  const budget = useQuery(budgetQuery(month));
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
  const title = row?.name ?? 'Envelope';
  return (
    <PageFrame meta={PLAN_MONAT} title={title}>
      <div className="plan plan-detail">
        <PlanDetailBack month={month} title={title} />
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
  const [month] = useMonth();
  const budget = useQuery(budgetQuery(month));
  const expected = useLocation({
    select: (location) => location.pathname === '/plan/erwartet/einnahmen',
  });
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [month]);
  return (
    <PageFrame
      meta={expected ? PLAN_ERWARTET : PLAN_MONAT}
      title={`Einnahmen ${monthLabel(month)}`}
    >
      <div className="plan plan-detail">
        {expected ? (
          <ExpectedDetailBack title="Einnahmen" />
        ) : (
          <PlanDetailBack month={month} title="Einnahmen" />
        )}
        <section className="card insp-card" aria-label="Einnahmen">
          {expected && (
            <h2 ref={heading} tabIndex={-1}>
              Einnahmen {monthLabel(month)}
            </h2>
          )}
          <IncomeBody month={month} bookedCents={budget.data?.summary.incomeCents} />
        </section>
      </div>
    </PageFrame>
  );
}
