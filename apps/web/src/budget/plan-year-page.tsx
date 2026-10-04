import { reportTablesQuery } from '../reports/table-reports-api';
import { useAmountPrivacy, Registers, Select, TitleBlock, cx } from '@budget/ui';
import {
  buildYearView,
  savingsRateOf,
  planYearMonths,
  planYearRows,
  sumPlanYearRows,
  type PlanYearAmounts,
  type PlanYearRow,
} from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { eur } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { areaById } from '../nav/areas';
import { monthLabel } from '../nav/month';
import { AppLink } from '../shell/app-link';
import { useMonth } from '../shell/use-month';
import { budgetMonthsQuery, type BudgetMonthView } from './budget-api';
import { CategoryIcon } from './category-icon';
import './plan-year.css';
import { YearPlanning } from './year-planning';

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
    <>
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
              <ChevronLeft aria-hidden="true" size={20} />
            </button>
            <h1>{year}</h1>
            <button
              className="icon-btn"
              type="button"
              aria-label="Nächstes Jahr"
              disabled={year >= 9999}
              onClick={() => setMonth(`${year + 1}-${month.slice(5)}`)}
            >
              <ChevronRight aria-hidden="true" size={20} />
            </button>
          </div>
        }
        fields={[{ label: 'Ansicht', value: 'Jahresplanung', labelOnMobile: true }]}
      />
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
      <div className="plan-year">
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
            {reports.isError ? (
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
                  <section className="card year-sheet" aria-label="Jahressummen des Haushalts">
                    <dl className="year-totals">
                      <div>
                        <dt>Haushaltseinnahmen</dt>
                        <dd>{eur(totals.incomeCents)}</dd>
                      </div>
                      <div>
                        <dt>Konsum (Bedarf und Wunsch)</dt>
                        <dd>{eur(totals.consumptionCents)}</dd>
                      </div>
                    </dl>
                    <p className="year-note">
                      Abgeschlossene Monate wie im Jahresreport. Erstattungen mindern Konsum;
                      Kapitalerträge, Umbuchungen und Eröffnungssalden sind keine
                      Haushaltseinnahmen. Die Envelope-Tabelle zeigt Budgetbewegungen und den
                      gespeicherten Plan.
                    </p>
                  </section>
                );
              })()
            ) : (
              <LoadingNote what="Jahressummen" />
            )}
            <YearPlanning key={`events-${year}`} year={year} selectedMonth={month} views={views} />
            <YearOverview
              key={year}
              year={year}
              selectedMonth={month}
              months={months}
              views={views}
            />
          </>
        )}
      </div>
    </>
  );
}

function YearOverview({
  year,
  selectedMonth,
  months,
  views,
}: {
  year: number;
  selectedMonth: string;
  months: string[];
  views: BudgetMonthView[];
}) {
  useAmountPrivacy();
  const [metric, setMetric] = useState<Metric>('assignedCents');
  const [phoneMonth, setPhoneMonth] = useState(selectedMonth);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
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
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const name = (id: string) => metadata.get(id)?.name ?? 'Kategorie nicht mehr verfügbar';
  const label = metrics.find(([key]) => key === metric)![1];
  return (
    <section className="card year-sheet" aria-labelledby="year-title">
      <div className="year-toolbar">
        <h2 id="year-title">Jahresübersicht</h2>
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
      <p className="year-note">
        Zugewiesen und Aktivität: Summe des Jahres. Verfügbar: Stand im Dezember, inklusive
        Übertrag. Künftige Monate zeigen den gespeicherten Plan, keine Prognose.
      </p>
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
                      <abbr title={monthLabel(m)}>{monthLabel(m).split(' ')[0]}</abbr>
                    </th>
                  ))}
                  <th scope="col">{metric === 'availableCents' ? 'Stand Dez.' : 'Jahr'}</th>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.id}>
                  <tr className="year-group">
                    <th scope="row">
                      <button
                        type="button"
                        aria-expanded={!collapsed.has(group.id)}
                        onClick={() => toggle(group.id)}
                      >
                        <ChevronDown
                          size={16}
                          aria-hidden="true"
                          className={cx(collapsed.has(group.id) && 'is-closed')}
                        />
                        {group.name}
                      </button>
                    </th>
                    <YearCells row={sumPlanYearRows(group.rows)} metric={metric} />
                  </tr>
                  {!collapsed.has(group.id) &&
                    group.rows.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">
                          <CategoryIcon icon={metadata.get(row.id)?.icon ?? null} />
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
              </tfoot>
            </table>
          </div>
          <div className="year-phone">
            <label className="year-month-choice">
              Monat
              <Select value={phoneMonth} onChange={(e) => setPhoneMonth(e.target.value)}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </Select>
            </label>
            <div className="year-phone-head">
              <span>Kategorie</span>
              <span>{label}</span>
            </div>
            {groups.map((group) => (
              <section key={group.id} className="year-phone-group" aria-label={group.name}>
                <button
                  className="year-phone-summary"
                  type="button"
                  aria-expanded={!collapsed.has(group.id)}
                  onClick={() => toggle(group.id)}
                >
                  <span>
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className={cx(collapsed.has(group.id) && 'is-closed')}
                    />
                    {group.name}
                  </span>
                  <Amount
                    amount={sumPlanYearRows(group.rows).months[monthIndex]!}
                    metric={metric}
                  />
                </button>
                {!collapsed.has(group.id) &&
                  group.rows.map((row) => (
                    <div className="year-phone-row" key={row.id}>
                      <span>
                        <CategoryIcon icon={metadata.get(row.id)?.icon ?? null} />
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
          <dl className="year-totals" aria-label="Jahreswerte aller Envelopes">
            {metrics.map(([key, text]) => (
              <div key={key}>
                <dt>{key === 'availableCents' ? 'Verfügbar · Dezember' : `${text} · Jahr`}</dt>
                <dd>{eur(total.year[key])}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

function Amount({ amount, metric }: { amount: PlanYearAmounts; metric: Metric }) {
  useAmountPrivacy();
  return (
    <span
      className={cx('year-amount', metric === 'availableCents' && amount[metric] < 0 && 'is-over')}
    >
      {eur(amount[metric])}
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
      <td className="year-end">
        <Amount amount={row.year} metric={metric} />
      </td>
    </>
  );
}
