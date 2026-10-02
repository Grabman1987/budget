import {
  buildTableRows,
  buildYearView,
  cents,
  compareYear,
  monthClassSpending,
  monthConsumption,
  monthHouseholdIncome,
  previousTotals,
  yearsWithData,
  type TableMeta,
  type TableMonth,
} from '@budget/domain';
import { DimensionChain, Segmented } from '@budget/ui';
import { useMemo, useState } from 'react';
import { eur } from '../ledger/format';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { RowsGrid } from './table-grid';
import { MONTH_SHORT, monthShort, percentTenth } from './table-format';
import { TableReportFrame, useReportTables } from './table-report-frame';
import type { ReportTables } from './table-reports-api';

const DEPTH = [
  { value: 'gruppen', label: 'Gruppen' },
  { value: 'kategorien', label: 'Kategorien' },
] as const;

const sum = (months: ReadonlyArray<TableMonth | null>, pick: (m: TableMonth) => number) =>
  months.reduce((total, m) => total + (m ? pick(m) : 0), 0);

/** 1.5 Jahresansicht: category by month for one year, against the same months of the year before. */
export function YearReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  const query = useReportTables();
  const [picked, setPicked] = useState<number | null>(null);
  const tables = query.data;
  const years = useMemo(
    () => (tables ? yearsWithData(tables.months, tables.lastFullMonth) : []),
    [tables],
  );
  const year =
    picked !== null && years.includes(picked) ? picked : (years[years.length - 1] ?? null);
  return (
    <TableReportFrame
      report={report}
      meta={meta}
      through="full"
      query={query}
      className="year-report"
      extraFields={
        years.length > 0 && year !== null
          ? [
              {
                label: 'Jahr',
                value: (
                  <Segmented
                    label="Jahr"
                    options={years.map((y) => ({ value: String(y), label: String(y) }))}
                    value={String(year)}
                    onChange={(value) => setPicked(Number(value))}
                  />
                ),
              },
            ]
          : undefined
      }
    >
      {(data) => (year === null ? null : <YearBody data={data} year={year} />)}
    </TableReportFrame>
  );
}

function YearBody({ data, year }: { data: ReportTables; year: number }) {
  const [depth, setDepth] = useState<(typeof DEPTH)[number]['value']>('gruppen');
  const meta: TableMeta = data;
  const view = useMemo(
    () => buildYearView(data.months, year, data.lastFullMonth),
    [data.months, year, data.lastFullMonth],
  );
  const detail = depth === 'kategorien';
  const rows = useMemo(() => buildTableRows(view.months, meta, detail), [view, meta, detail]);
  const previous = useMemo(
    () => previousTotals(buildTableRows(view.previous, meta, detail)),
    [view, meta, detail],
  );
  const have = view.months.filter((m): m is TableMonth => m !== null);
  const income = sum(have, (m) => monthHouseholdIncome(m, meta));
  const consumption = sum(have, (m) => monthConsumption(m, meta));
  const future = sum(have, (m) => monthClassSpending(m, meta, 'future'));
  const comparison = compareYear(view, meta);
  const pairs = view.pairs;
  const first = pairs[0];
  const last = pairs[pairs.length - 1];
  const previousLabel = `${year - 1}${pairs.length < 12 ? '*' : ''}`;
  const compared =
    pairs.length === 12 || first === undefined || last === undefined
      ? 'ganzes Jahr'
      : `${MONTH_SHORT[first]}–${MONTH_SHORT[last]} verglichen`;

  return (
    <section className="tr-card" aria-labelledby="year-title">
      <div className="tbd-head">
        <h2 id="year-title">
          {year}
          {have.length < 12 ? ` · ${have.length} Monate` : ''}
        </h2>
        <Segmented
          label="Detailtiefe"
          options={DEPTH}
          value={depth}
          onChange={setDepth}
          className="seg-depth"
        />
      </div>
      <DimensionChain
        label="Maßkette des Jahres"
        terms={[
          { label: 'Einnahmen', value: cents(income) },
          { label: 'Konsum', value: cents(consumption), op: '-' },
          { label: 'Zukunft', value: cents(future), op: '-' },
          { label: 'Übrig', value: cents(income - consumption - future), op: '=', result: true },
        ]}
      />
      {comparison ? (
        <div className="year-compare" data-testid="year-compare">
          <div>
            <span className="tech">Konsum gegen {year - 1}</span>
            <strong>{eur(comparison.consumptionDeltaCents, { cents: false, sign: true })}</strong>
            <small>
              {comparison.consumptionDeltaBp === null
                ? '–'
                : percentTenth(comparison.consumptionDeltaBp, true)}{' '}
              · {compared}
            </small>
          </div>
          <div>
            <span className="tech">Einnahmen gegen {year - 1}</span>
            <strong>{eur(comparison.incomeDeltaCents, { cents: false, sign: true })}</strong>
            <small>
              {comparison.incomeDeltaBp === null
                ? '–'
                : percentTenth(comparison.incomeDeltaBp, true)}
            </small>
          </div>
          <div>
            <span className="tech">Sparquote</span>
            <strong>
              {comparison.savingsRateBp === null ? '–' : percentTenth(comparison.savingsRateBp)}
            </strong>
            <small>
              {year - 1}:{' '}
              {comparison.previousSavingsRateBp === null
                ? '–'
                : percentTenth(comparison.previousSavingsRateBp)}
            </small>
          </div>
        </div>
      ) : (
        <p className="vnote">Für {year - 1} liegen keine Monate zum Vergleich vor.</p>
      )}
      <RowsGrid
        rows={rows}
        columns={MONTH_SHORT.map((label, i) => ({
          key: `${year}-${i}`,
          label,
          title: monthShort(`${year}-${String(i + 1).padStart(2, '0')}`),
        }))}
        caption={`Jahresansicht ${year}: Kategorien nach Monat in Euro`}
        regionLabel={`Jahresansicht ${year}, bei Bedarf horizontal verschiebbar`}
        average
        previous={pairs.length > 0 ? { label: previousLabel, totals: previous } : null}
        className="rg-year"
      />
      <p className="vnote">
        Beträge in Euro. Farbe je Zeile gegen den Durchschnitt der Zeile: Rot = teurer Monat (bei
        Einnahmen und Zukunft: schwächerer Monat), Grün = günstiger. Veränderung grün = besser, rot
        = schlechter.
        {pairs.length > 0 && pairs.length < 12 && first !== undefined && last !== undefined
          ? ` * ${year - 1} nur für dieselben Monate (${MONTH_SHORT[first]}–${MONTH_SHORT[last]}).`
          : ''}{' '}
        Kapitalerträge und Erstattungen stehen getrennt unter der Tabelle und zählen nicht zu den
        Einnahmen oder zur Sparquote.
      </p>
    </section>
  );
}
