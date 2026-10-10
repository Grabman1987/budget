import { ChartSvg } from '@budget/ui';
import { chartPoints } from '../charts/tooltip-data';
import { ReportPeriodControl } from './period-quick-select';
import { useAmountPrivacy, ClassSwatch } from '@budget/ui';
import {
  categoryOverview,
  categoryTrend,
  reportPeriodMonths,
  SPEND_CLASS_LABEL,
  type CategoryOverviewRow,
} from '@budget/domain';
import { useId, useMemo } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ZEITRAUM_VALUES, useZeitraum } from '../wealth/zeitraum';
import { eur } from '../ledger/format';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { CategoryTrend } from './category-trend';
import { monthLong, percentTenth, percentWhole, periodName } from './table-format';
import { TableReportFrame, useReportTables } from './table-report-frame';
import type { ReportTables } from './table-reports-api';

const PERIOD_OPTIONS = ZEITRAUM_VALUES.map((value) => ({ value, label: value }));
const KIND_LABEL: Record<string, string> = {
  fixed: 'Fixkosten',
  variable: 'variabel',
  periodic: 'periodisch',
  project: 'Projekt',
  debt: 'Kredit',
  invest: 'Investieren',
};

/** 1.6 Kategorieübersicht: every category with its course, against the period before. */
export function CategoryReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const [period, setPeriod] = useZeitraum();
  const query = useReportTables();
  return (
    <TableReportFrame
      report={report}
      meta={meta}
      through="full"
      verdictPeriod={period}
      currentAllowed={period.includes('..')}
      query={query}
      className="category-report"
      extraFields={[
        {
          label: 'Zeitraum',
          value: (
            <ReportPeriodControl
              label="Zeitraum"
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              className="seg-period"
            />
          ),
        },
      ]}
    >
      {(data) => <CategoryBody data={data} period={period} />}
    </TableReportFrame>
  );
}

function Sparkline({
  values,
  months,
}: {
  values: ReadonlyArray<number>;
  months: readonly string[];
}) {
  useAmountPrivacy();
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const points = values
    .map(
      (v, i) =>
        `${((i / (values.length - 1)) * 100).toFixed(1)},${(22 - (v / max) * 20).toFixed(1)}`,
    )
    .join(' ');
  return (
    <ChartSvg
      width={100}
      height={24}
      className="spark"
      label="Kategorieausgaben je Monat"
      points={chartPoints(months, (i) => (i / (values.length - 1)) * 100, [
        { name: 'Ausgaben', values },
      ])}
    >
      <polyline points={points} vectorEffect="non-scaling-stroke" />
    </ChartSvg>
  );
}

function CategoryBody({
  data,
  period,
}: {
  data: ReportTables;
  period: (typeof ZEITRAUM_VALUES)[number];
}) {
  useAmountPrivacy();
  const search = useSearch({ strict: false }) as { kategorien?: string[]; vorjahr?: boolean };
  const navigate = useNavigate();
  const setChoice = (patch: Record<string, unknown>) =>
    void navigate({
      to: '.',
      search: ((prev: Record<string, unknown>) => ({ ...prev, ...patch })) as never,
      replace: true,
    });
  const window = useMemo(
    () =>
      data.firstMonth && (data.lastFullMonth || period.includes('..'))
        ? reportPeriodMonths(
            period,
            period.includes('..') ? data.currentMonth : data.lastFullMonth!,
            data.firstMonth,
          )
        : [],
    [data.firstMonth, data.lastFullMonth, data.currentMonth, period],
  );
  const overview = useMemo(
    () =>
      categoryOverview(
        data.months,
        data,
        window,
        period.includes('..') ? data.currentMonth : data.lastFullMonth,
      ),
    [data, window, period],
  );
  const rows = overview.rows;
  const selectedIds = search.kategorien ?? (rows[0] ? [rows[0].category.id] : []);
  const selected = data.categories.filter((c) => selectedIds.includes(c.id));
  const prefix = useId();

  return (
    <section className="tr-card" aria-labelledby="categories-title">
      <div className="tbd-head">
        <h2 id="categories-title">
          {rows.length} Kategorien · {periodName(period, window)}
        </h2>
        <span className="tbd-state">
          <span className="ink">Konsum {eur(overview.consumptionCents, { cents: false })}</span>
        </span>
      </div>
      <div className="category-trend-detail">
        <h3>Kategorietrend</h3>
        <details className="category-trend-picker">
          <summary>Kategorien wählen · {selected.length} ausgewählt</summary>
          <fieldset className="category-trend-choice">
            <legend>Kategorien vergleichen</legend>
            {data.categories.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(c.id)}
                  onChange={(e) =>
                    setChoice({
                      kategorien: e.target.checked
                        ? [...selectedIds, c.id]
                        : selectedIds.filter((id) => id !== c.id),
                    })
                  }
                />
                <ClassSwatch kind={c.class} />
                {c.name}
              </label>
            ))}
          </fieldset>
        </details>
        <label className="category-trend-previous">
          <input
            type="checkbox"
            checked={search.vorjahr === true}
            onChange={(e) => setChoice({ vorjahr: e.target.checked || undefined })}
          />
          Vorjahresmonat anzeigen
        </label>
        {selected.length ? (
          <CategoryTrend
            series={selected.map((category) => ({
              category,
              points: categoryTrend(data.months, category.id, window),
            }))}
            previous={search.vorjahr === true}
          />
        ) : (
          <p role="status">Wähle mindestens eine Kategorie für den Verlauf.</p>
        )}
        <p className="vnote">
          Monatswerte öffnen die zugehörigen Buchungen. Ausgaben und Erstattungen sind netto;
          Zukunft bleibt vom Konsum getrennt. Monate ohne Daten: –.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="vnote" role="status">
          Im gewählten Zeitraum gibt es keine Ausgaben in Kategorien.
        </p>
      ) : (
        <div
          className="rscroll"
          role="region"
          aria-label="Kategorien, bei Bedarf horizontal verschiebbar"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the complete table.
          tabIndex={0}
        >
          <table className="rtable rcats">
            <caption className="sr-only">
              Kategorien mit Summe, Durchschnitt je Monat, Vergleich zur Vorperiode und Anteil am
              Konsum
            </caption>
            <thead>
              <tr>
                <th scope="col" className="tech">
                  Kategorie
                </th>
                <th scope="col" className="tech">
                  Verlauf 12 M
                </th>
                <th scope="col" className="tech n">
                  Summe
                </th>
                <th scope="col" className="tech n">
                  Ø Monat
                </th>
                <th scope="col" className="tech n">
                  Zur Vorperiode
                </th>
                <th scope="col" className="tech n">
                  Anteil am Konsum
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = row.category.id;
                const isOpen = selectedIds.includes(id);
                const detailId = `${prefix}-${id}`;
                return (
                  <CategoryRows
                    key={id}
                    row={row}
                    isOpen={isOpen}
                    detailId={detailId}
                    onToggle={() =>
                      setChoice({
                        kategorien: isOpen ? [] : [id],
                      })
                    }
                    payees={data.payees[id] ?? []}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="vnote">
        Summe, Durchschnitt, Anteil und Detailverlauf beziehen sich auf den gewählten Zeitraum. Die
        kleinen Verläufe zeigen die letzten zwölf vollständigen Monate. Zur Vorperiode: der Zeitraum
        gleicher Länge davor, nur wenn er vollständig vorliegt. Der Anteil am Konsum ist für Zukunft
        leer, weil Sparen kein Konsum ist. Rückerstattungen in derselben Kategorie sind abgezogen.
      </p>
    </section>
  );
}

function CategoryRows({
  row,
  isOpen,
  detailId,
  onToggle,
  payees,
}: {
  row: CategoryOverviewRow;
  isOpen: boolean;
  detailId: string;
  onToggle: () => void;
  payees: ReadonlyArray<string>;
}) {
  useAmountPrivacy();
  const c = row.category;
  const history = row.history;
  const total12 = history.reduce((a, h) => a + h.spentCents, 0);
  const highest = history.reduce<(typeof history)[number] | null>(
    (best, h) => (best === null || h.spentCents > best.spentCents ? h : best),
    null,
  );
  const delta = row.previousCents === null ? null : row.sumCents - row.previousCents;
  return (
    <>
      <tr className={`rc-row${isOpen ? ' is-open' : ''}`} data-category={c.id}>
        <th scope="row" className="rc-name">
          <button
            type="button"
            className="rc-btn"
            aria-expanded={isOpen}
            aria-controls={detailId}
            onClick={onToggle}
          >
            <ClassSwatch kind={c.class} />
            <span>{c.name}</span>
            <small>{c.groupName}</small>
          </button>
        </th>
        <td>
          <Sparkline
            values={history.map((h) => h.spentCents)}
            months={history.map((h) => h.month)}
          />
        </td>
        <td className="n">
          <strong>{eur(row.sumCents, { cents: false })}</strong>
        </td>
        <td className="n">{eur(row.avgCents, { cents: false })}</td>
        <td className="n">
          {delta === null || row.previousCents === 0 ? (
            <span className="muted">–</span>
          ) : (
            <>
              {eur(delta, { cents: false, sign: true })}
              <small className="muted">
                {' '}
                {percentWhole(Math.round((delta * 10_000) / (row.previousCents as number)), true)}
              </small>
            </>
          )}
        </td>
        <td className="n">
          {row.shareBp === null ? (
            <span className="muted">Zukunft</span>
          ) : (
            percentTenth(row.shareBp)
          )}
        </td>
      </tr>
      {isOpen && (
        <tr className="rc-detail" id={detailId}>
          <td colSpan={6}>
            <div className="rc-d">
              <dl className="rc-facts">
                <div>
                  <dt className="tech">Ø {history.length} M</dt>
                  <dd>{history.length === 0 ? '–' : eur(Math.round(total12 / history.length))}</dd>
                </div>
                <div>
                  <dt className="tech">Höchster Monat</dt>
                  <dd>
                    {highest ? (
                      <>
                        {eur(highest.spentCents)}
                        <small>{monthLong(highest.month)}</small>
                      </>
                    ) : (
                      '–'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="tech">Art</dt>
                  <dd>
                    {KIND_LABEL[c.kind] ?? c.kind} · {SPEND_CLASS_LABEL[c.class]}
                  </dd>
                </div>
                <div>
                  <dt className="tech">Empfänger</dt>
                  <dd>{payees.length > 0 ? payees.join(', ') : '–'}</dd>
                </div>
              </dl>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
