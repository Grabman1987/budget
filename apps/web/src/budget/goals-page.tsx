import { useAmountPrivacy, ClassSwatch, Button, cx } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Plus } from 'lucide-react';
import { useState } from 'react';
import { eur, longDay } from '../ledger/format';
import { accountsQuery } from '../ledger/queries';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { PLAN_SPARZIELE } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { useMonth } from '../shell/use-month';
import { categoriesQuery } from './use-category-writes';
import type { CategoryRow } from './api';
import { budgetQuery } from './budget-api';
import { CategoryIcon } from './category-icon';
import { goalsQuery, type GoalView } from './goals-api';
import { goalBar, goalGroups, goalLine, planSummary, type GoalGroup } from './goals-model';
import { GoalPanel, type GoalPanelState } from './goals-panel';
import { CLASS_TEXT } from './plan-model';

/**
 * Plan › Sparziele: the goals as a parts list in two assemblies, "Offen" and "Erreicht". Under each
 * name a 6 px bar: the fill is what is saved (in the class hatch of the envelope), the ink tick the
 * target. Every figure comes from `/api/goals` (domain `goalProgress`); a row opens the side panel
 * (bottom sheet on the phone) to edit, adopt as the envelope's target or delete.
 */
export function GoalsPage() {
  useAmountPrivacy();
  const [month] = useMonth();
  const goals = useQuery(goalsQuery(month));
  const budget = useQuery(budgetQuery(month));
  const income = budget.data ? eur(budget.data.summary.incomeCents) : '–';
  return (
    <PageFrame meta={PLAN_SPARZIELE} income={income}>
      <div className="plan goals">
        {goals.isPending && <LoadingNote what="Sparziele" />}
        {goals.isError && (
          <ErrorNote what="Sparziele" error={goals.error} onRetry={() => void goals.refetch()} />
        )}
        {goals.data && <GoalsBody key={month} month={month} goals={goals.data.goals} />}
      </div>
    </PageFrame>
  );
}

function GoalsBody({ month, goals }: { month: string; goals: GoalView[] }) {
  useAmountPrivacy();
  const tree = useQuery(categoriesQuery()).data;
  const categories = tree?.categories ?? [];
  const accounts = useQuery(accountsQuery()).data?.accounts ?? [];
  const [panel, setPanel] = useState<GoalPanelState>({ mode: 'closed' });
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const catById = new Map(categories.map((c) => [c.id, c]));
  const groups = goalGroups(goals);
  const open = panel.mode === 'edit' ? goals.find((g) => g.id === panel.id) : undefined;

  return (
    <>
      <div className="ptoolbar goals-toolbar">
        <span className="goals-summary" data-testid="goals-summary">
          {goals.length > 0 ? planSummary(goals) : 'Noch keine Sparziele'}
        </span>
        <span className="spacer" />
        <Button size="sm" onClick={() => setPanel({ mode: 'create' })}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          Neues Sparziel
        </Button>
      </div>
      {goals.length === 0 ? (
        <EmptyNote
          action={
            <Button size="sm" variant="ghost" onClick={() => setPanel({ mode: 'create' })}>
              Sparziel anlegen
            </Button>
          }
        >
          Ein Sparziel ordnet einer Kategorie oder einem Konto einen Betrag und ein Datum zu. Die
          Seite zeigt, wie viel monatlich nötig ist.
        </EmptyNote>
      ) : (
        <section className="ptable-wrap" aria-labelledby="goals-title">
          <h2 className="sr-only" id="goals-title">
            Sparziele im Überblick
          </h2>
          <table className="ptable">
            <caption className="sr-only">
              Sparziele mit Ziel, Gespart, Fehlt, Zieldatum und nötiger Monatsrate
            </caption>
            <thead>
              <tr>
                <th className="tech col-pos" scope="col">
                  Pos.
                </th>
                <th className="tech col-name" scope="col">
                  Name
                </th>
                <th className="tech col-cat" scope="col">
                  Kategorie
                </th>
                <th className="tech col-num" scope="col">
                  Ziel
                </th>
                <th className="tech col-num" scope="col">
                  Gespart
                </th>
                <th className="tech col-num" scope="col">
                  Fehlt
                </th>
                <th className="tech col-date" scope="col">
                  Zieldatum
                </th>
                <th className="tech col-num" scope="col">
                  Nötige Rate
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isCollapsed = collapsed.has(g.key);
                return [
                  <GroupRow
                    key={g.key}
                    group={g}
                    collapsed={isCollapsed}
                    onToggle={() =>
                      setCollapsed((c) => {
                        const next = new Set(c);
                        if (next.has(g.key)) next.delete(g.key);
                        else next.add(g.key);
                        return next;
                      })
                    }
                  />,
                  ...(isCollapsed
                    ? []
                    : g.rows.map((r, i) => (
                        <GoalRow
                          key={r.id}
                          goal={r}
                          pos={`${g.no}.${i + 1}`}
                          month={month}
                          category={r.categoryId ? catById.get(r.categoryId) : undefined}
                          accountName={accounts.find((a) => a.id === r.accountId)?.name}
                          onOpen={() => setPanel({ mode: 'edit', id: r.id })}
                        />
                      ))),
                ];
              })}
            </tbody>
          </table>
          <div className="plegend" aria-hidden="true">
            <span>
              <i className="lg-bar">
                <i className="lg-fill" />
              </i>
              gespart
            </span>
            <span>
              <i className="lg-bar">
                <i className="lg-tick" style={{ left: '100%' }} />
              </i>
              Ziel
            </span>
          </div>
        </section>
      )}
      <GoalPanel
        month={month}
        state={panel}
        goal={open}
        categories={categories}
        groups={tree?.groups ?? []}
        accounts={accounts}
        onClose={() => setPanel({ mode: 'closed' })}
      />
    </>
  );
}

function GroupRow({
  group: g,
  collapsed,
  onToggle,
}: {
  group: GoalGroup;
  collapsed: boolean;
  onToggle: () => void;
}) {
  useAmountPrivacy();
  return (
    <tr className={cx('pgroup', collapsed && 'is-collapsed')} id={`grp-${g.key}`}>
      <td className="col-pos">
        <span className="grp-no">{g.no}</span>
      </td>
      <td className="col-name" colSpan={2}>
        <button type="button" className="grp-toggle" aria-expanded={!collapsed} onClick={onToggle}>
          <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="grp-title">{g.title}</span>
          <span className="grp-sub">
            {g.rows.length} {g.rows.length === 1 ? 'Sparziel' : 'Sparziele'}
          </span>
        </button>
      </td>
      <td className="col-num col-target" data-label="Ziel">
        {eur(g.totals.targetCents)}
      </td>
      <td className="col-num col-saved" data-label="Gespart">
        {eur(g.totals.savedCents)}
      </td>
      <td className="col-num col-missing" data-label="Fehlt">
        {eur(g.totals.remainingCents)}
      </td>
      <td className="col-date" />
      <td className="col-num col-rate" data-label="Nötige Rate">
        {g.key === 'open' ? eur(g.totals.neededMonthlyCents) : <span className="muted">–</span>}
      </td>
    </tr>
  );
}

function GoalRow({
  goal: g,
  pos,
  month,
  category,
  accountName,
  onOpen,
}: {
  goal: GoalView;
  pos: string;
  month: string;
  category: CategoryRow | undefined;
  accountName: string | undefined;
  onOpen: () => void;
}) {
  useAmountPrivacy();
  const bar = goalBar(g);
  const line = goalLine(g, month);
  const cls = category?.class ?? null;
  return (
    <tr className={cx('prow', 'grow', g.status === 'reached' && 'is-reached')}>
      <td className="col-pos">
        <span className="pos">{pos}</span>
      </td>
      <td className="col-name">
        <button type="button" className="pname" onClick={onOpen}>
          <span className="goal-name">{g.name}</span>
        </button>
        <span className="pbar" aria-hidden="true">
          <i
            className={cx('pbar-fill', cls ? `hatch-${cls}` : 'hatch-bound')}
            style={{ width: `${bar.fill * 100}%` }}
          />
          <i className="pbar-tick" style={{ left: `${bar.tick * 100}%` }} />
        </span>
        <span className="pmeta" data-testid="goal-line">
          {line.tone === 'done' && <Check size={13} strokeWidth={2} aria-hidden="true" />}
          {line.tone === 'ok' && <CheckCircle2 size={13} strokeWidth={1.75} aria-hidden="true" />}
          {line.tone === 'warn' && (
            <AlertTriangle size={13} strokeWidth={1.75} aria-hidden="true" />
          )}
          {line.text}
        </span>
      </td>
      <td className="col-cat" data-label="Kategorie">
        {category ? (
          <span className="goal-cat">
            <ClassSwatch kind={cls ?? 'bound'} />
            <CategoryIcon icon={category.icon} />
            {category.name}
            {cls && <span className="env-class">{CLASS_TEXT[cls]}</span>}
          </span>
        ) : (
          <span className="goal-cat">
            <ClassSwatch kind="bound" />
            {accountName ? `Konto ${accountName}` : <span className="muted">nicht verknüpft</span>}
          </span>
        )}
      </td>
      <td className="col-num col-target" data-label="Ziel">
        {eur(g.targetCents)}
      </td>
      <td className="col-num col-saved" data-label="Gespart">
        {eur(g.savedCents)}
      </td>
      <td className="col-num col-missing" data-label="Fehlt">
        {g.remainingCents > 0 ? eur(g.remainingCents) : <span className="muted">{eur(0)}</span>}
      </td>
      <td className="col-date" data-label="Zieldatum">
        {g.targetDate ? longDay(g.targetDate) : <span className="muted">ohne Datum</span>}
      </td>
      <td className="col-num col-rate" data-label="Nötige Rate">
        {g.status === 'reached' || g.neededMonthlyCents === null ? (
          <span className="muted">–</span>
        ) : (
          eur(g.neededMonthlyCents)
        )}
      </td>
    </tr>
  );
}
