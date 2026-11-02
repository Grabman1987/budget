import '../nav/registers.css';
import { reportTablesQuery } from '../reports/table-reports-api';
import { useAmountPrivacy, Registers, Select, TitleBlock, cx } from '@budget/ui';
import {
  buildYearView,
  savingsRateOf,
  planYearMonths,
  planYearRows,
  sumPlanYearRows,
  mulDivRound,
  type PlanYearAmounts,
  type PlanYearRow,
  type planYearScenario,
} from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronDown, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { eur } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { areaById } from '../nav/areas';
import { monthLabel } from '../nav/month';
import { AppLink } from '../shell/app-link';
import { useMonth } from '../shell/use-month';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { validatePlanYearSearch } from './plan-year-search';
import { budgetMonthsQuery, type BudgetMonthView } from './budget-api';
import { CategoryIcon } from './category-icon';
import './plan-year.css';
import { YearPlanning } from './year-planning';
import { PlanPageFrame } from './plan-page-frame';

const metrics = [
  ['assignedCents', 'Zugewiesen'],
  ['activityCents', 'Aktivität'],
  ['availableCents', 'Verfügbar'],
] as const;
type Metric = (typeof metrics)[number][0];

/** Existing envelope-month reads remain the sole source of every amount, including carryover. */
export function PlanYearPage() {
  useAmountPrivacy();
  const [month, , setMonth] = useMonth();
  const year = Number(month.slice(0, 4));
  const months = useMemo(() => planYearMonths(year), [year]);
  const reports = useQuery(reportTablesQuery(false));
  // One call for the twelve months: the server reads the ledger once for all of them.
  const yearQuery = useQuery(budgetMonthsQuery(months));
  const failed = yearQuery.isError ? yearQuery : undefined;
  const views = useMemo(
    () => months.flatMap((m) => yearQuery.data?.months[m] ?? []),
    [months, yearQuery.data],
  );
  const loaded = views.length === months.length;
  return (
    <YearFrame year={year} month={month} onMonth={setMonth}>
      {!REDESIGN_ENABLED && (
        <TitleBlock
          compactOnMobile
          titleOnMobile
          title={
            <div className="month-switch">
              <button
                className="icon-btn"
                type="button"
                aria-label="Vorjahr"
                disabled={year <= 1900}
                onClick={() => setMonth(`${year - 1}-${month.slice(5)}`)}
              >
                <ChevronLeft aria-hidden="true" size={20} strokeWidth={1.5} />
              </button>
              <h1>{year}</h1>
              <button
                className="icon-btn"
                type="button"
                aria-label="Nächstes Jahr"
                disabled={year >= 9999}
                onClick={() => setMonth(`${year + 1}-${month.slice(5)}`)}
              >
                <ChevronRight aria-hidden="true" size={20} strokeWidth={1.5} />
              </button>
            </div>
          }
          fields={[{ label: 'Ansicht', value: 'Jahresplanung', labelOnMobile: true }]}
        />
      )}
      {!REDESIGN_ENABLED && (
        <Registers
          label="Register von Plan"
          current="jahr"
          items={areaById('plan').registers.map((r) => ({ id: r.id, label: r.label, href: r.to }))}
          renderLink={(item, props) => (
            <AppLink to={item.href ?? '/plan/monat'} search={{ monat: month }} {...props}>
              {item.label}
            </AppLink>
          )}
        />
      )}
      <div className={cx('plan-year', REDESIGN_ENABLED && 'plan-year-v2')}>
        {failed ? (
          <ErrorNote
            what="Jahresplan"
            error={failed.error}
            onRetry={() => void yearQuery.refetch()}
          />
        ) : !loaded ? (
          <LoadingNote what="Jahresplan" />
        ) : (
          <>
            <YearPlanning
              key={`events-${year}`}
              year={year}
              selectedMonth={month}
              views={views}
              overview={
                REDESIGN_ENABLED
                  ? (scenario, without) => (
                      <YearOverview
                        key={year}
                        year={year}
                        selectedMonth={month}
                        onMonth={setMonth}
                        months={months}
                        views={views}
                        scenario={scenario}
                        without={without}
                      />
                    )
                  : undefined
              }
              context={
                reports.isError ? (
                  <ErrorNote
                    what="Jahressummen"
                    error={reports.error}
                    onRetry={() => void reports.refetch()}
                  />
                ) : reports.data ? (
                  (() => {
                    const source = reports.data;
                    const period = buildYearView(
                      source.months,
                      year,
                      source.lastFullMonth,
                    ).months.filter((m) => m !== null);
                    const totals = savingsRateOf(period, source);
                    return (
                      <>
                        <span>
                          Einnahmen: <strong>{eur(totals.incomeCents)}</strong>
                        </span>
                        <span>
                          Konsum: <strong>{eur(totals.consumptionCents)}</strong>
                        </span>
                        <small>Abgeschlossene Monate · wie im Jahresreport</small>
                      </>
                    );
                  })()
                ) : (
                  <LoadingNote what="Jahressummen" />
                )
              }
            />
            {!REDESIGN_ENABLED && (
              <YearOverview
                key={year}
                year={year}
                selectedMonth={month}
                onMonth={setMonth}
                months={months}
                views={views}
              />
            )}
          </>
        )}
      </div>
    </YearFrame>
  );
}

function YearFrame({
  year,
  month,
  onMonth,
  children,
}: {
  year: number;
  month: string;
  onMonth: (month: string) => void;
  children: ReactNode;
}) {
  const search = validatePlanYearSearch(useSearch({ strict: false }) as Record<string, unknown>);
  const navigate = useNavigate();
  const metric = search.kennzahl ?? 'assignedCents';
  if (!REDESIGN_ENABLED) return <>{children}</>;
  return (
    <PlanPageFrame
      page="jahr"
      title={String(year)}
      period={
        <div className="year-reference-period">
          <button
            type="button"
            className="icon-btn"
            aria-label="Vorjahr"
            disabled={year <= 1900}
            onClick={() => onMonth(year - 1 + '-' + month.slice(5))}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <strong>{year}</strong>
          <button
            type="button"
            className="icon-btn"
            aria-label="Nächstes Jahr"
            disabled={year >= 9999}
            onClick={() => onMonth(year + 1 + '-' + month.slice(5))}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      }
      actions={
        <details className="plan-v2-view year-reference-metric">
          <summary>
            Ansicht: {metrics.find(([key]) => key === metric)![1]}{' '}
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className="plan-v2-view-menu">
            <label>
              <span>Kennzahl</span>
              <Select
                aria-label="Kennzahl im Jahresplan"
                value={metric}
                onChange={(event) =>
                  void navigate({
                    to: '.',
                    search: ((previous: Record<string, unknown>) => ({
                      ...previous,
                      kennzahl: event.target.value,
                    })) as never,
                  })
                }
              >
                {metrics.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Monat{' '}
              <input
                type="month"
                value={month}
                min="1900-01"
                max="9999-12"
                onChange={(event) => {
                  if (/^\d{4}-\d{2}$/.test(event.target.value)) onMonth(event.target.value);
                }}
              />
            </label>
          </div>
        </details>
      }
    >
      {children}
    </PlanPageFrame>
  );
}

export function YearOverview({
  year,
  selectedMonth,
  months,
  views,
  onMonth,
  scenario,
  without = false,
}: {
  year: number;
  selectedMonth: string;
  months: string[];
  views: BudgetMonthView[];
  onMonth: (month: string) => void;
  scenario?: ReturnType<typeof planYearScenario> | undefined;
  without?: boolean;
}) {
  useAmountPrivacy();
  const search = validatePlanYearSearch(useSearch({ strict: false }) as Record<string, unknown>);
  const navigate = useNavigate();
  const [legacyMetric, setLegacyMetric] = useState<Metric>('assignedCents');
  const metric = REDESIGN_ENABLED ? (search.kennzahl ?? 'assignedCents') : legacyMetric;
  const setMetric = (next: Metric) =>
    REDESIGN_ENABLED
      ? void navigate({
          to: '.',
          search: ((previous: Record<string, unknown>) => ({
            ...previous,
            kennzahl: next,
          })) as never,
        })
      : setLegacyMetric(next);
  const [legacyMonth, setLegacyMonth] = useState(selectedMonth);
  const phoneMonth = REDESIGN_ENABLED ? selectedMonth : legacyMonth;
  const setPhoneMonth = REDESIGN_ENABLED ? onMonth : setLegacyMonth;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        REDESIGN_ENABLED
          ? (views[0]?.groups
              .filter((group) =>
                views[0]!.categories.some((category) => category.groupId === group.id),
              )
              .slice(0, 1)
              .map((group) => group.id) ?? [])
          : [],
      ),
  );
  const isCollapsed = (id: string) => !expanded.has(id);
  const rows = planYearRows(
    year,
    views.map((v) => v.summary),
  );
  const metadata = new Map(views.flatMap((v) => v.categories.map((c) => [c.id, c] as const)));
  const groupMeta = new Map(views.flatMap((v) => v.groups.map((g) => [g.id, g] as const)));
  const shown = rows.filter((row) => {
    const category = metadata.get(row.id);
    return (
      !category?.hiddenAt ||
      row.months.some(
        (m) => m.assignedCents !== 0 || m.activityCents !== 0 || m.availableCents !== 0,
      )
    );
  });
  const groups = [...groupMeta.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((group) => ({
      ...group,
      rows: shown
        .filter((row) => metadata.get(row.id)?.groupId === group.id)
        .sort(
          (a, b) => (metadata.get(a.id)?.sortOrder ?? 0) - (metadata.get(b.id)?.sortOrder ?? 0),
        ),
    }))
    .filter((group) => group.rows.length > 0);
  // Retain values even when category metadata is unavailable; never silently lose an envelope.
  const known = new Set(groups.flatMap((group) => group.rows.map((row) => row.id)));
  const unknown = shown.filter((row) => !known.has(row.id));
  if (unknown.length)
    groups.push({
      id: 'unassigned-metadata',
      name: 'Ohne Kategoriegruppe',
      sortOrder: 0,
      rows: unknown,
    });
  const total = sumPlanYearRows(shown);
  const monthIndex = months.indexOf(phoneMonth);
  const toggle = (id: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const name = (id: string) => metadata.get(id)?.name ?? 'Kategorie nicht mehr verfügbar';
  const label = metrics.find(([key]) => key === metric)![1];
  const totals = (
    <dl className="year-totals" aria-label="Jahreswerte aller Envelopes">
      {metrics.map(([key, text]) => (
        <div key={key}>
          <dt>{key === 'availableCents' ? 'Verfügbar · Dezember' : `${text} · Jahr`}</dt>
          <dd>{eur(total.year[key])}</dd>
        </div>
      ))}
    </dl>
  );
  const instructions = (
    <details className="year-instructions">
      <summary>
        <Info aria-hidden="true" size={16} strokeWidth={1.75} /> Kennzahlen der Jahrestabelle
      </summary>
      <p className="year-note">
        Zugewiesen und Aktivität: Summe des Jahres. Verfügbar: Stand im Dezember, inklusive
        Übertrag. Künftige Monate zeigen den gespeicherten Plan, keine Prognose.
      </p>
    </details>
  );
  return (
    <section className="card year-sheet" aria-labelledby="year-title">
      <div className="year-toolbar">
        <h2 id="year-title">Jahresübersicht</h2>
        <label className="year-month-choice">
          <span className="sr-only">Monat</span>
          <Select value={phoneMonth} onChange={(e) => setPhoneMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </Select>
        </label>
        <div className="seg year-metric" role="group" aria-label="Kennzahl im Jahresplan">
          {metrics.map(([key, text]) => (
            <button
              key={key}
              type="button"
              aria-pressed={metric === key}
              onClick={() => setMetric(key)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      {!REDESIGN_ENABLED && instructions}
      {shown.length === 0 ? (
        <p className="year-empty">
          Noch keine Envelopes vorhanden. Kategorien legst du unter Einstellungen an.
        </p>
      ) : (
        <>
          <div
            className="year-desktop"
            role="region"
            aria-label="Zwölf Monate, horizontal scrollbar"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll all twelve months.
            tabIndex={0}
          >
            <table className="year-table">
              <caption className="sr-only">
                {label} je Kategorie und Monat {year}.{' '}
                {metric === 'availableCents'
                  ? 'Jahreswert ist der Dezemberstand.'
                  : 'Jahreswert ist die Summe.'}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Kategorie</th>
                  {months.map((m) => (
                    <th key={m} scope="col">
                      <abbr title={monthLabel(m)}>
                        {REDESIGN_ENABLED
                          ? monthLabel(m).split(' ')[0]!.slice(0, 3)
                          : monthLabel(m).split(' ')[0]}
                      </abbr>
                    </th>
                  ))}
                  {REDESIGN_ENABLED && <th scope="col">Ø</th>}
                  <th scope="col">
                    {metric === 'availableCents'
                      ? 'Stand Dez.'
                      : REDESIGN_ENABLED
                        ? 'Summe'
                        : 'Jahr'}
                  </th>
                </tr>
              </thead>
              {REDESIGN_ENABLED && (
                <tbody>
                  <tr className="year-income-row">
                    <th scope="row">Einnahmen</th>
                    {views.map((view) => (
                      <td key={view.summary.month}>{yearFormat(view.summary.incomeCents)}</td>
                    ))}
                    <td>
                      {yearFormat(
                        mulDivRound(
                          views.reduce((sum, view) => sum + view.summary.incomeCents, 0),
                          1,
                          12,
                        ),
                      )}
                    </td>
                    <td>
                      {yearFormat(views.reduce((sum, view) => sum + view.summary.incomeCents, 0))}
                    </td>
                  </tr>
                </tbody>
              )}
              {groups.map((group) => (
                <tbody key={group.id}>
                  <tr className="year-group">
                    <th scope="row">
                      <button
                        type="button"
                        aria-expanded={!isCollapsed(group.id)}
                        onClick={() => toggle(group.id)}
                      >
                        <ChevronDown
                          size={16}
                          strokeWidth={1.75}
                          aria-hidden="true"
                          className={cx(isCollapsed(group.id) && 'is-closed')}
                        />
                        {group.name}
                      </button>
                    </th>
                    <YearCells row={sumPlanYearRows(group.rows)} metric={metric} />
                  </tr>
                  {!isCollapsed(group.id) &&
                    group.rows.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">
                          <CategoryIcon
                            icon={metadata.get(row.id)?.icon ?? null}
                            name={name(row.id)}
                          />
                          {name(row.id)}
                        </th>
                        <YearCells row={row} metric={metric} />
                      </tr>
                    ))}
                </tbody>
              ))}
              <tfoot>
                <tr>
                  <th scope="row">Alle Envelopes</th>
                  <YearCells row={total} metric={metric} />
                </tr>
                {REDESIGN_ENABLED && scenario && (
                  <>
                    <tr className="year-events-row">
                      <th scope="row">Ereignisse</th>
                      {scenario.months.map((row) => (
                        <td key={row.month}>{yearFormat(without ? 0 : row.eventCents)}</td>
                      ))}
                      <td>
                        {yearFormat(mulDivRound(without ? 0 : scenario.yearEnd.effectCents, 1, 12))}
                      </td>
                      <td>{yearFormat(without ? 0 : scenario.yearEnd.effectCents)}</td>
                    </tr>
                    <tr className="year-free-row">
                      <th scope="row">Frei kumuliert</th>
                      {scenario.months.map((row) => (
                        <td key={row.month}>
                          {yearFormat(without ? row.withoutCents : row.withCents)}
                        </td>
                      ))}
                      <td>–</td>
                      <td>
                        {yearFormat(
                          without ? scenario.yearEnd.withoutCents : scenario.yearEnd.withCents,
                        )}
                      </td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>
          </div>
          <div className="year-phone">
            <div className="year-phone-head">
              <span>Kategorie</span>
              <span>{label}</span>
            </div>
            {groups.map((group) => (
              <section key={group.id} className="year-phone-group" aria-label={group.name}>
                <button
                  className="year-phone-summary"
                  type="button"
                  aria-expanded={!isCollapsed(group.id)}
                  onClick={() => toggle(group.id)}
                >
                  <span>
                    <ChevronDown
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden="true"
                      className={cx(isCollapsed(group.id) && 'is-closed')}
                    />
                    {group.name}
                  </span>
                  <Amount
                    amount={sumPlanYearRows(group.rows).months[monthIndex]!}
                    metric={metric}
                  />
                </button>
                {!isCollapsed(group.id) &&
                  group.rows.map((row) => (
                    <div className="year-phone-row" key={row.id}>
                      <span>
                        <CategoryIcon
                          icon={metadata.get(row.id)?.icon ?? null}
                          name={name(row.id)}
                        />
                        {name(row.id)}
                      </span>
                      <Amount amount={row.months[monthIndex]!} metric={metric} />
                    </div>
                  ))}
              </section>
            ))}
            <div className="year-phone-total">
              <strong>Alle Envelopes</strong>
              <Amount amount={total.months[monthIndex]!} metric={metric} />
            </div>
            <details className="year-phone-annual">
              <summary>Jahreswerte je Kategorie</summary>
              {totals}
              {groups.map((group) => (
                <section key={group.id}>
                  <h3>{group.name}</h3>
                  {group.rows.map((row) => (
                    <div className="year-phone-row" key={row.id}>
                      <span>{name(row.id)}</span>
                      <Amount amount={row.year} metric={metric} />
                    </div>
                  ))}
                </section>
              ))}
            </details>
          </div>
          {REDESIGN_ENABLED ? (
            <details className="year-desktop-totals">
              <summary>Jahreswerte aller Envelopes</summary>
              {totals}
            </details>
          ) : (
            <div className="year-desktop-totals">{totals}</div>
          )}
        </>
      )}
      {REDESIGN_ENABLED && instructions}
    </section>
  );
}

function yearFormat(value: number) {
  const text = eur(value);
  return REDESIGN_ENABLED ? text.replace(/\s*€$/, '') : text;
}

function Amount({ amount, metric }: { amount: PlanYearAmounts; metric: Metric }) {
  useAmountPrivacy();
  return (
    <span
      className={cx('year-amount', metric === 'availableCents' && amount[metric] < 0 && 'is-over')}
      title={REDESIGN_ENABLED ? eur(amount[metric]) : undefined}
    >
      {yearFormat(amount[metric])}
    </span>
  );
}

function YearCells({ row, metric }: { row: PlanYearRow; metric: Metric }) {
  useAmountPrivacy();
  return (
    <>
      {row.months.map((amount, i) => (
        <td key={i}>
          <Amount amount={amount} metric={metric} />
        </td>
      ))}
      {REDESIGN_ENABLED && (
        <td className="year-average">
          {metric === 'availableCents' ? '–' : yearFormat(mulDivRound(row.year[metric], 1, 12))}
        </td>
      )}
      <td className="year-end">
        <Amount amount={row.year} metric={metric} />
      </td>
    </>
  );
}
