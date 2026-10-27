import { Button, cx, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { eur } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { budgetQuery, type BudgetMonthView } from './budget-api';
import { monthLabel } from '../nav/month';
import { monthOverviewAmounts, nextMonthPreparation } from './plan-overview-model';

export const PLAN_OVERVIEW_KEY = 'budget.plan.overview';
const DEFAULTS = {
  collapsed: false,
  month: true,
  split: true,
  automatic: false,
  income: false,
  money: false,
  rail: false,
};
type Preferences = typeof DEFAULTS;
function readPreferences(): Preferences {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(PLAN_OVERVIEW_KEY) ?? '{}');
    const valid =
      typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
    return Object.fromEntries(
      Object.entries(DEFAULTS).map(([key, fallback]) => [
        key,
        typeof valid[key] === 'boolean' ? valid[key] : fallback,
      ]),
    ) as Preferences;
  } catch {
    return { ...DEFAULTS };
  }
}

export function MonthStatement({ data }: { data: BudgetMonthView }) {
  useAmountPrivacy();
  const amounts = monthOverviewAmounts(data.summary.envelopes);
  return (
    <dl className="insp-list month-statement" data-testid="month-statement">
      {(['carryCents', 'assignedCents', 'activityCents', 'availableCents'] as const).map(
        (key, index) => (
          <div key={key} className={index === 3 ? 'insp-total' : undefined}>
            <dt>
              <span aria-hidden="true">{['→', '+', '+', '='][index]} </span>
              {['Übertrag', 'Zugewiesen', 'Aktivität', 'Verfügbar'][index]}
            </dt>
            <dd data-testid={`month-statement-${key}`}>
              {index === 3 ? (
                <span
                  className={cx(
                    'pill',
                    amounts[key] > 0 ? 'is-good' : amounts[key] < 0 && 'is-bad',
                  )}
                >
                  {eur(amounts[key])}
                </span>
              ) : (
                eur(amounts[key])
              )}
            </dd>
          </div>
        ),
      )}
    </dl>
  );
}

export function NextMonthCoverage({
  month,
  view,
}: {
  month: string;
  view?: BudgetMonthView | undefined;
}) {
  const hidden = useAmountPrivacy();
  const query = useQuery({ ...budgetQuery(month), enabled: !view });
  const data = view ?? query.data;
  const facts =
    data?.summary.month === month ? nextMonthPreparation(data.summary.envelopes) : undefined;
  return (
    <section className="next-month-coverage" aria-labelledby="next-month-title">
      <h3 id="next-month-title">Nächster Monat · {monthLabel(month)}</h3>
      {query.isPending && !view && <LoadingNote what="Ziele des nächsten Monats" />}
      {(query.isError || (data && !facts)) && (
        <ErrorNote
          what="Ziele des nächsten Monats"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {facts && (
        <>
          <p className="next-month-state">
            {facts.percent === null
              ? facts.targetCount === 0
                ? 'Keine Ziele für diesen Monat.'
                : facts.missingCents > 0
                  ? 'Keine prozentuale Zieldeckung verfügbar.'
                  : 'Keine neue Zuweisung nötig.'
              : hidden
                ? '••• % vorbereitet'
                : `${facts.percent} % vorbereitet`}
          </p>
          {facts.percent !== null && !hidden && (
            <progress
              aria-label="Zieldeckung nächster Monat"
              max={facts.goalCents}
              value={facts.coveredCents}
            />
          )}
          <p
            className={facts.missingCents > 0 ? 'is-short' : 'is-prepared'}
            data-testid="next-month-difference"
          >
            {facts.missingCents > 0
              ? `fehlt ${eur(facts.missingCents)}`
              : facts.excessCents > 0
                ? `${eur(facts.excessCents, { sign: true })} über Ziel`
                : facts.targetCount > 0 && facts.goalCents > 0
                  ? 'Ziele vollständig vorbereitet.'
                  : ''}
          </p>
        </>
      )}
    </section>
  );
}

/** No-selection frame only. The existing selected-category inspector keeps its own controls. */
export function MonthOverviewInspector({
  month,
  overview,
  next,
  split,
  income,
  money,
  rail,
  automatic,
}: {
  month: string;
  overview: ReactNode;
  next: ReactNode;
  split: ReactNode;
  income: ReactNode;
  money: ReactNode;
  rail: ReactNode;
  automatic?: ReactNode;
}) {
  useAmountPrivacy();
  const [preferences, setPreferences] = useState(readPreferences);
  const bodyId = useId();
  useEffect(() => {
    try {
      localStorage.setItem(PLAN_OVERVIEW_KEY, JSON.stringify(preferences));
    } catch {
      /* Choice still holds for this visit. */
    }
  }, [preferences]);
  const toggle = (key: keyof Preferences) => (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (event.target !== event.currentTarget) return;
    const open = event.currentTarget.open;
    setPreferences((current) => (current[key] === open ? current : { ...current, [key]: open }));
  };
  const section = (
    key: Exclude<keyof Preferences, 'collapsed' | 'money'>,
    label: string,
    content: ReactNode,
    id?: string,
  ) => (
    <details
      key={key}
      className="inspector-section"
      data-overview-section={key}
      open={preferences[key]}
      onToggle={toggle(key)}
      id={id}
    >
      <summary>
        <ChevronDown className="insp-chev" size={16} strokeWidth={1.75} aria-hidden="true" />
        {label}
      </summary>
      {content}
    </details>
  );
  const rememberedMoney = isValidElement<{
    open?: boolean;
    onToggle?: (event: SyntheticEvent<HTMLDetailsElement>) => void;
  }>(money)
    ? cloneElement(money, { open: preferences.money, onToggle: toggle('money') })
    : money;
  return (
    <aside className="plan-inspector card month-overview-inspector" aria-label="Plan-Inspektor">
      <div className="month-overview-head">
        <h2>
          Monatsüberblick <span>{monthLabel(month)}</span>
        </h2>
        <Button
          variant="ghost"
          aria-label={
            preferences.collapsed ? 'Monatsüberblick ausklappen' : 'Monatsüberblick einklappen'
          }
          aria-expanded={!preferences.collapsed}
          aria-controls={bodyId}
          onClick={() =>
            setPreferences((current) => ({ ...current, collapsed: !current.collapsed }))
          }
        >
          {preferences.collapsed ? (
            <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          )}
        </Button>
      </div>
      <div id={bodyId} hidden={preferences.collapsed}>
        {section(
          'month',
          'Monatsaufstellung',
          <>
            {overview}
            {next}
          </>,
        )}
        {section('split', '50/30/20', split)}
        {automatic && section('automatic', 'Automatisch zuweisen', automatic)}
        {section('income', 'Erwartetes Einkommen vs. Monatsziele', income, 'inspector-income')}
        {rememberedMoney}
        {section('rail', 'Wasserfall-Stufen', rail)}
      </div>
    </aside>
  );
}
