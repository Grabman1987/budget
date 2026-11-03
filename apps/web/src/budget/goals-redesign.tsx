import { goalTotals, lastDayOfMonth, mulDivRound } from '@budget/domain';
import { BudgetStateMark, Button, cx, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, Info, Plus, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { eur, longDay } from '../ledger/format';
import { accountsQuery } from '../ledger/queries';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { monthLabel } from '../nav/month';
import { GoalsProgress } from '../pages/goals-progress-report';
import type { GoalReportRow } from '../pages/goals-progress-model';
import { AppLink } from '../shell/app-link';
import { useMonth } from '../shell/use-month';
import type { CategoryRow } from './api';
import { CategoryIcon } from './category-icon';
import { fundGoalRate, type GoalView } from './goals-api';
import { goalForecastLine, goalLine, goalState } from './goals-model';
import { GoalPanel, type GoalPanelState } from './goals-panel';
import { PlanPageFrame } from './plan-page-frame';
import { categoriesQuery, useBudgetWrite } from './use-category-writes';
import './goals-redesign.css';

export function GoalsRedesign({
  month,
  progress,
  goals,
  rows,
  categories,
  accounts,
  pending,
  fetching,
  error,
  onRetry,
}: {
  month: string;
  progress: boolean;
  goals?: GoalView[] | undefined;
  rows?: GoalReportRow[] | undefined;
  categories?: CategoryRow[] | undefined;
  accounts?: { id: string; name: string }[] | undefined;
  pending: boolean;
  fetching: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  useAmountPrivacy();
  const navigate = useNavigate();
  const [, , setMonth] = useMonth();
  const [panel, setPanel] = useState<GoalPanelState>({ mode: 'closed' });
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set(['completed']));
  const tree = useQuery(categoriesQuery()).data;
  const editorAccounts = useQuery(accountsQuery()).data?.accounts ?? [];
  const proven = (rows ?? []).flatMap((row) => (row.progress ? [row.progress] : []));
  const unknown = (rows ?? []).filter((row) => !row.progress);
  const current = proven.filter((goal) => goalState(goal) !== 'completed');
  const totals = goalTotals(current);
  const active = (goals ?? []).filter((goal) => goalState(goal) === 'open').length;
  const ready = goals !== undefined && !fetching && !error;
  const groups = [
    { key: 'open', label: 'Offen' },
    { key: 'reached', label: 'Erreicht' },
    { key: 'completed', label: 'Abgeschlossen' },
  ] as const;
  const changeView = (ansicht: 'ziele' | 'fortschritt') =>
    void navigate({
      to: '.',
      search: ((previous: Record<string, unknown>) => ({
        ...previous,
        ansicht: ansicht === 'fortschritt' ? ansicht : undefined,
      })) as never,
    });
  return (
    <PlanPageFrame
      page="sparziele"
      title={monthLabel(month)}
      className="goals goals-v2 goals-reference"
      actions={
        <>
          <details className="plan-v2-view">
            <summary>
              Ansicht: {progress ? 'Fortschritt' : 'Liste'}{' '}
              <ChevronDown size={14} aria-hidden="true" />
            </summary>
            <div className="plan-v2-view-menu" aria-label="Zielansicht">
              <button
                type="button"
                aria-pressed={!progress}
                onClick={(event) => {
                  changeView('ziele');
                  event.currentTarget.closest('details')!.open = false;
                }}
              >
                Liste
              </button>
              <button
                type="button"
                aria-pressed={progress}
                onClick={(event) => {
                  changeView('fortschritt');
                  event.currentTarget.closest('details')!.open = false;
                }}
              >
                Fortschritt
              </button>
              <label>
                Monat{' '}
                <input
                  type="month"
                  value={month}
                  onChange={(event) => {
                    if (/^\d{4}-\d{2}$/.test(event.target.value)) setMonth(event.target.value);
                  }}
                />
              </label>
            </div>
          </details>
          <Button size="sm" onClick={() => setPanel({ mode: 'create' })}>
            <Plus size={16} aria-hidden="true" />
            Ziel
          </Button>
        </>
      }
    >
      {progress ? (
        <GoalsProgress month={month} />
      ) : (
        <>
          {(pending || fetching) && <LoadingNote what="Sparziele und Quellen" />}
          {!!error && <ErrorNote what="Sparziele" error={error} onRetry={onRetry} />}
          {ready && (
            <>
              {proven.length === 0 && unknown.length > 0 ? (
                <p data-testid="goals-summary">
                  Keine eindeutig belegten Zielstände · {unknown.length} ungeklärt
                </p>
              ) : (
                <div className="goals-total" data-testid="goals-summary">
                  <div>
                    <span className="goals-total-label">
                      Gesamtfortschritt{' '}
                      <Info size={15} aria-label="Gespart in Zielen / Summe der Zielbeträge" />
                    </span>
                    <strong>{unknown.length ? '–' : eur(totals.savedCents)}</strong>
                  </div>
                  <span>
                    von {unknown.length ? '–' : eur(totals.targetCents)} · {active} aktive Ziele
                    {unknown.length > 0 && ' · ' + unknown.length + ' ungeklärt'}
                  </span>
                </div>
              )}
              {goals.length === 0 && (
                <EmptyNote
                  action={
                    <Button size="sm" variant="ghost" onClick={() => setPanel({ mode: 'create' })}>
                      Sparziel anlegen
                    </Button>
                  }
                >
                  Noch keine Sparziele. Ein Ziel ordnet einer Kategorie oder einem Konto einen
                  Betrag und ein Datum zu.
                </EmptyNote>
              )}
              <div
                className="goals-reference-scroll"
                role="region"
                aria-label="Ziele, seitlich scrollbar"
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard access to the complete financial table.
                tabIndex={0}
              >
                <table className="goals-reference-table">
                  <caption className="sr-only">Sparziele im Überblick</caption>
                  <thead>
                    <tr>
                      {[
                        'Name',
                        'Kategorie',
                        'Zielbetrag',
                        'Zieldatum',
                        'Rate/Monat',
                        'Fortschritt',
                        'Status',
                        '',
                      ].map((label, index) => (
                        <th key={index} scope="col">
                          {label || <span className="sr-only">Aktion</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  {groups.map((group) => {
                    const members = proven.filter((goal) => goalState(goal) === group.key);
                    const closed = collapsed.has(group.key);
                    return (
                      <tbody key={group.key} data-goal-group={group.key}>
                        <tr className="pgroup">
                          <th colSpan={8} scope="rowgroup">
                            <button
                              type="button"
                              aria-expanded={!closed}
                              onClick={() =>
                                setCollapsed((previous) => {
                                  const next = new Set(previous);
                                  if (next.has(group.key)) next.delete(group.key);
                                  else next.add(group.key);
                                  return next;
                                })
                              }
                            >
                              <ChevronDown
                                className={closed ? 'is-collapsed' : ''}
                                size={14}
                                aria-hidden="true"
                              />
                              {group.label}
                              <span>{members.length}</span>
                            </button>
                          </th>
                        </tr>
                        {!closed &&
                          members.map((goal) => (
                            <GoalListRow
                              key={goal.id}
                              goal={goal}
                              month={month}
                              category={categories?.find(
                                (category) => category.id === goal.categoryId,
                              )}
                              accountName={
                                accounts?.find((account) => account.id === goal.accountId)?.name
                              }
                            />
                          ))}
                      </tbody>
                    );
                  })}
                  {unknown.length > 0 && (
                    <tbody>
                      {unknown.map((row) => (
                        <tr className="prow" key={row.id} data-goal-unknown>
                          <td>
                            <AppLink
                              className="goal-name"
                              to={'/plan/sparziele/' + row.id}
                              search={{ monat: month }}
                            >
                              {row.name}
                            </AppLink>
                          </td>
                          <td colSpan={7}>Fortschritt und Status nicht verfügbar. {row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  )}
                </table>
              </div>
            </>
          )}
        </>
      )}
      <p className="plan-v2-source">
        Monatsstand {monthLabel(month)} · Stichtag {longDay(lastDayOfMonth(month))}
      </p>
      <GoalPanel
        month={month}
        state={panel}
        goal={panel.mode === 'edit' ? goals?.find((goal) => goal.id === panel.id) : undefined}
        categories={tree?.categories ?? []}
        groups={tree?.groups ?? []}
        accounts={editorAccounts}
        onClose={() => setPanel({ mode: 'closed' })}
      />
    </PlanPageFrame>
  );
}

function GoalListRow({
  goal,
  month,
  category,
  accountName,
}: {
  goal: GoalView;
  month: string;
  category?: CategoryRow | undefined;
  accountName?: string | undefined;
}) {
  const write = useBudgetWrite();
  const state = goalState(goal);
  const reached = state === 'reached' || state === 'completed';
  const underfunded = !reached && goal.status !== 'on_track';
  const percentage =
    goal.targetCents > 0
      ? Math.max(0, Math.min(100, mulDivRound(goal.savedCents, 100, goal.targetCents)))
      : reached
        ? 100
        : null;
  const line = goalForecastLine(goal, month);
  const rate =
    goal.funding && !goal.funding.conflict ? goal.funding.monthlyCents : goal.neededMonthlyCents;
  return (
    <tr
      className={cx('prow', reached && 'is-reached')}
      data-goal-tone={underfunded ? 'warn' : 'ok'}
    >
      <td className="col-name">
        <AppLink
          className="goal-name"
          to={'/plan/sparziele/' + goal.id}
          search={{ monat: month }}
          state={{ planPanelDetailOpenedInApp: true }}
        >
          {category && <CategoryIcon icon={category.icon} name={category.name} />}
          {goal.name}
        </AppLink>
      </td>
      <td className="col-cat">
        {category?.name ?? (accountName ? 'Konto ' + accountName : 'nicht verknüpft')}
      </td>
      <td className="col-target">{eur(goal.targetCents)}</td>
      <td className="col-date">{goal.targetDate ? longDay(goal.targetDate) : 'ohne Datum'}</td>
      <td className="col-rate" aria-describedby={'goal-future-' + goal.id}>
        <span
          data-testid="goal-rate"
          title={
            goal.neededMonthlyCents === null
              ? 'Künftige Rate nicht verfügbar'
              : 'Nötige künftige Rate: ' + eur(goal.neededMonthlyCents)
          }
        >
          {reached || rate === null ? '–' : eur(rate)}
        </span>
        <span className="sr-only" id={'goal-future-' + goal.id}>
          <span data-testid="goal-line">{goalLine(goal, month).text}</span> Nötige künftige Rate:{' '}
          <span data-testid="goal-future-rate">
            {goal.neededMonthlyCents === null ? '–' : eur(goal.neededMonthlyCents)}
          </span>
        </span>
        {goal.funding?.conflict && (
          <span
            className="goal-conflict"
            title={goalLine(goal, month).text}
            role="img"
            aria-label={'Ziel prüfen: ' + goalLine(goal, month).text}
          >
            <TriangleAlert size={14} aria-hidden="true" />
          </span>
        )}
      </td>
      <td className="col-progress">
        <span
          className="goal-progress"
          title={eur(goal.savedCents) + ' von ' + eur(goal.targetCents)}
        >
          <span className="goal-progress-track" aria-hidden="true">
            <i style={{ width: (percentage ?? 0) + '%' }} />
          </span>
          <span>{percentage === null ? '–' : maskMoneyText(percentage + ' %')}</span>
        </span>
        <span className="sr-only col-saved">{eur(goal.savedCents)}</span>
        <span className="sr-only col-missing">{eur(goal.remainingCents)}</span>
      </td>
      <td className="col-state">
        <span className="goal-status-pill" title={maskMoneyText(line.text)}>
          <BudgetStateMark
            state={underfunded ? 'open' : 'met'}
            children={
              reached
                ? state === 'completed'
                  ? 'Abgeschlossen'
                  : 'Erreicht'
                : underfunded
                  ? 'Unterfinanziert'
                  : 'Im Plan'
            }
          />
        </span>
        <span className="sr-only" data-testid="goal-future-line">
          {line.text}
        </span>
      </td>
      <td className="col-action">
        {!reached && (
          <Button
            size="sm"
            variant="ghost"
            disabled={!goal.funding || !!goal.funding.conflict || goal.funding.remainingCents <= 0}
            onClick={() =>
              void write(
                () => fundGoalRate(goal.id, month, goal.funding!.reviewToken),
                (result) =>
                  result.changedCount === 0
                    ? 'Die Rate ist bereits zugewiesen.'
                    : eur(result.assignedCents) + ' zugewiesen',
              )
            }
          >
            Rate zuweisen
          </Button>
        )}
      </td>
    </tr>
  );
}
