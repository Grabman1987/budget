import { Button, ClassTag, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useParams, useRouter, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { eur } from '../ledger/format';
import { EINSTELLUNGEN_KATEGORIEN, PLAN_SPARZIELE } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { GoalDetail, GoalHistory, goalsProgressReportQuery } from '../pages/goals-progress-report';
import { AppLink } from '../shell/app-link';
import { useMonth } from '../shell/use-month';
import { CategoryPanel, type PanelState } from './category-panel';
import { CategoryIcon } from './category-icon';
import { GoalPanel } from './goals-panel';
import { adoptGoal } from './goals-api';
import { KIND_LABEL, STAGES, targetText } from './labels';
import { CLASS_TEXT } from './plan-model';
import { categoriesQuery, useBudgetWrite } from './use-category-writes';
import './plan.css';
import './plan-panel-pages.css';

function DetailBack({
  to,
  search,
  label,
  title,
}: {
  to: string;
  search: Record<string, unknown>;
  label: string;
  title: string;
}) {
  const router = useRouter();
  const opened = useLocation({ select: (location) => location.state.planPanelDetailOpenedInApp });
  return (
    <div className="plan-panel-nav">
      <nav aria-label="Brotkrumen">
        <AppLink to={to} search={search}>
          {label}
        </AppLink>
        {' › '}
        <span aria-current="page">{title}</span>
      </nav>
      <AppLink
        to={to}
        search={search}
        onClick={(event) => {
          if (opened && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
            event.preventDefault();
            router.history.back();
          }
        }}
      >
        Zurück{' '}
        {label === 'Kategorien'
          ? 'zu Kategorien'
          : label === 'Sparziele'
            ? 'zu Sparzielen'
            : 'zum Sparzielreport'}
      </AppLink>
    </div>
  );
}

export function CategoryDetailPage() {
  useAmountPrivacy();
  const { id } = useParams({ strict: false }) as { id: string };
  const { ausgeblendet } = useSearch({ strict: false }) as { ausgeblendet?: boolean };
  const query = useQuery(categoriesQuery());
  const category = query.data?.categories.find((c) => c.id === id);
  const [panel, setPanel] = useState<PanelState>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [category?.id]);
  const target = query.data?.targets.filter((t) => t.categoryId === id).at(-1);
  return (
    <PageFrame meta={EINSTELLUNGEN_KATEGORIEN} title={category?.name ?? 'Kategorie'}>
      <div className="kview plan plan-panel-detail">
        <DetailBack
          to="/einstellungen/kategorien"
          search={{ ausgeblendet }}
          label="Kategorien"
          title={category?.name ?? 'Kategorie'}
        />
        {query.isPending && <LoadingNote what="Kategorie" />}
        {query.isError && (
          <ErrorNote what="Kategorie" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {query.data && !category && <p role="status">Diese Kategorie ist nicht vorhanden.</p>}
        {category && (
          <section className="card insp-card" aria-labelledby="category-detail-title">
            <h2 id="category-detail-title" ref={heading} tabIndex={-1}>
              <CategoryIcon icon={category.icon} /> {category.name}
            </h2>
            <dl className="kv-list">
              <div className="kv">
                <dt>Gruppe</dt>
                <dd>{query.data?.groups.find((g) => g.id === category.groupId)?.name ?? '–'}</dd>
              </div>
              <div className="kv">
                <dt>Art</dt>
                <dd>{KIND_LABEL[category.kind]}</dd>
              </div>
              <div className="kv">
                <dt>Klasse</dt>
                <dd>
                  {category.class ? (
                    <ClassTag kind={category.class}>{CLASS_TEXT[category.class]}</ClassTag>
                  ) : (
                    'ohne Klasse'
                  )}
                </dd>
              </div>
              <div className="kv">
                <dt>Stufe im Wasserfall</dt>
                <dd>
                  {category.stage
                    ? `${category.stage} · ${STAGES[category.stage - 1]?.short}`
                    : 'keine Stufe'}
                </dd>
              </div>
              <div className="kv">
                <dt>Ziel</dt>
                <dd>{target ? targetText(target) : 'kein Ziel'}</dd>
              </div>
              <div className="kv">
                <dt>Buchungen</dt>
                <dd>{category.splitCount}</dd>
              </div>
              <div className="kv">
                <dt>Sichtbarkeit</dt>
                <dd>{category.hiddenAt ? 'ausgeblendet' : 'sichtbar'}</dd>
              </div>
            </dl>
            <Button
              variant="ghost"
              onClick={() => setPanel({ mode: 'edit', groupId: category.groupId, category })}
            >
              Kategorie bearbeiten
            </Button>
          </section>
        )}
      </div>
      {query.data && (
        <CategoryPanel
          state={panel}
          tree={query.data}
          onClose={() => setPanel(null)}
          onSwitch={setPanel}
        />
      )}
    </PageFrame>
  );
}

export function GoalDetailPage() {
  useAmountPrivacy();
  const { id } = useParams({ strict: false }) as { id: string };
  const { quelle } = useSearch({ strict: false }) as { quelle?: string };
  const [month] = useMonth();
  const query = useQuery(goalsProgressReportQuery(month));
  // Keep the editor and its return-focus target mounted during audited write refreshes.
  const ready = query.data;
  const row = ready?.rows.find((r) => r.id === id);
  const goal = query.data?.goals.find((g) => g.id === id);
  const [editing, setEditing] = useState(false);
  const write = useBudgetWrite();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [row?.id]);
  const title = row?.name ?? 'Sparziel';
  const category = query.data?.categories.categories.find((c) => c.id === goal?.categoryId);
  return (
    <PageFrame meta={PLAN_SPARZIELE} title={title}>
      <div className="plan plan-panel-detail">
        <DetailBack
          to={quelle === 'report' ? '/reports/sparziele' : '/plan/sparziele'}
          search={quelle === 'report' ? {} : { monat: month }}
          label={quelle === 'report' ? 'Sparzielreport' : 'Sparziele'}
          title={title}
        />
        {(query.isPending || query.isFetching) && <LoadingNote what="Sparziel und Quellen" />}
        {!query.isFetching && query.isError && (
          <ErrorNote
            what="Sparziel und Quellen"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {ready && !query.isFetching && !query.isError && !row && (
          <p role="status">Dieses Sparziel ist nicht vorhanden.</p>
        )}
        {ready && row && (
          <section
            className="card insp-card"
            aria-labelledby="goal-detail-title"
            hidden={query.isFetching || query.isError}
          >
            <h2 id="goal-detail-title" ref={heading} tabIndex={-1}>
              {row.name}
            </h2>
            <GoalDetail row={row} month={month} />
            <h3>Historie · Stand {ready.report.month}</h3>
            <GoalHistory
              points={ready.report.history.find((h) => h.id === id)?.points ?? []}
              name={row.name}
            />
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Sparziel bearbeiten
            </Button>
            {goal && category && (
              <div className="panel-actions">
                <Button
                  variant="ghost"
                  disabled={!goal.targetDate}
                  onClick={() =>
                    void write(
                      () => adoptGoal(id, month),
                      () => `${category.name}: Ziel ${eur(goal.targetCents)} übernommen`,
                    )
                  }
                >
                  Als Ziel der Kategorie übernehmen
                </Button>
              </div>
            )}
          </section>
        )}
      </div>
      {query.data && (
        <GoalPanel
          month={month}
          state={editing ? { mode: 'edit', id } : { mode: 'closed' }}
          goal={goal}
          categories={query.data.categories.categories}
          groups={query.data.categories.groups}
          accounts={query.data.accounts}
          onClose={() => setEditing(false)}
        />
      )}
    </PageFrame>
  );
}
