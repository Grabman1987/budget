import {
  incomeExpenseRows,
  incomeExpenseSources,
  reportPeriodMonths,
  tableCsv,
  tableRowTotal,
  tableRowAverage,
  monthHouseholdIncome,
  type OverviewSplit,
  type TableRow,
} from '@budget/domain';
import {
  AxisLine,
  Button,
  ChartSvg,
  DetailPanel,
  Graticule,
  Line,
  LineLegend,
  XTicks,
  useAmountPrivacy,
} from '@budget/ui';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { chartPoints } from '../charts/tooltip-data';
import { eur, longDay } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { AppLink } from '../shell/app-link';
import { ZEITRAUM_VALUES, useZeitraum } from '../wealth/zeitraum';
import { ReportPeriodControl } from './period-quick-select';
import { RowsGrid } from './table-grid';
import { monthShort } from './table-format';
import { TableReportFrame } from './table-report-frame';
import type { ReportTables } from './table-reports-api';

const queryOptionsForReport = queryOptions({
  queryKey: [...LEDGER_KEY, 'income-expense'],
  retry: false,
  queryFn: () =>
    request<ReportTables & { splits: OverviewSplit[] }>('GET', '/api/report-tables/income-expense'),
});
export function IncomeExpenseReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  const [period, setPeriod] = useZeitraum();
  const query = useQuery(queryOptionsForReport);
  const [expanded, setExpanded] = useState(new Set<string>());
  const [selected, setSelected] = useState<{ row: TableRow; months: string[] } | null>(null);
  const data = !query.isFetching && query.isSuccess ? query.data : null;
  const window = data?.firstMonth
    ? reportPeriodMonths(
        period,
        period.includes('..') ? data.currentMonth! : (data.lastFullMonth ?? ''),
        data.firstMonth,
      )
    : [];
  const months = data?.months.filter((m) => window.includes(m.month)) ?? [];
  const rows = data ? incomeExpenseRows(months, data, expanded) : [];
  const detail =
    selected && data
      ? incomeExpenseSources(data.splits, data, selected.row.key, selected.months)
      : [];
  const download = () => {
    const csv = tableCsv(
      rows.map((r) => ({ ...r, vals: [...r.vals, tableRowTotal(r), tableRowAverage(r)] })),
      [...window.map((m) => monthShort(m, true)), 'Summe', 'Ø Monat'],
    );
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `einnahmen-ausgaben-${window[0]}-${window.at(-1)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  return (
    <>
      <TableReportFrame
        report={report}
        meta={meta}
        through="full"
        currentAllowed={period.includes('..')}
        query={query}
        className="income-expense-report"
        extraFields={[
          {
            label: 'Zeitraum',
            value: (
              <ReportPeriodControl
                trend={false}
                label="Zeitraum"
                value={period}
                onChange={(p) => {
                  setSelected(null);
                  setPeriod(p);
                }}
                options={ZEITRAUM_VALUES.map((value) => ({ value, label: value }))}
              />
            ),
          },
        ]}
      >
        {() =>
          data && (
            <section
              className="tr-card"
              aria-labelledby="ie-title"
              data-testid="income-expense-report"
            >
              <div className="tbd-head">
                <h2 id="ie-title">Einnahmen und Ausgaben</h2>
                <Button variant="ghost" onClick={download}>
                  CSV
                </Button>
              </div>
              <IncomeExpenseChart data={data} months={window} />
              <LineLegend items={[{ kind: 'actual', label: 'Netto' }]} />
              <RowsGrid
                rows={rows}
                columns={window.map((m) => ({ key: m, label: monthShort(m, true) }))}
                caption="Einnahmen und Ausgaben in Euro"
                regionLabel="Einnahmen und Ausgaben, seitlich scrollbar"
                average
                onCell={(row, column) =>
                  setSelected({ row, months: column === null ? window : [window[column]!] })
                }
                renderLabel={(r) =>
                  r.key.startsWith('group:') ? (
                    <button
                      type="button"
                      className="table-cell-open"
                      aria-expanded={expanded.has(r.key.slice(6))}
                      onClick={() =>
                        setExpanded((old) => {
                          const next = new Set(old);
                          const id = r.key.slice(6);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        })
                      }
                    >
                      {expanded.has(r.key.slice(6)) ? '−' : '+'} {r.label}
                    </button>
                  ) : (
                    r.label
                  )
                }
              />
              <p className="vnote">
                Haushaltseinnahmen minus tatsächliche Ausgaben. Kapitalerträge und Erstattungen ohne
                Kategorie stehen außerhalb der Haushaltseinnahmen; kategorisierte Erstattungen
                mindern die Ausgaben. Umbuchungen zwischen eigenen Konten und Kontakt-Rückzahlungen
                fehlen. Eine Zelle öffnet ihre Buchungen; CSV enthält genau die sichtbaren Zeilen,
                Monate, Summe und Ø. Der laufende Monat reicht bis heute.
              </p>
            </section>
          )
        }
      </TableReportFrame>
      <DetailPanel
        open={Boolean(selected && data)}
        title={selected?.row.label ?? 'Buchungen'}
        onClose={() => setSelected(null)}
      >
        {detail.length ? (
          <ul>
            {detail.map((s, i) => (
              <li key={`${s.bookingId}:${i}`}>
                <AppLink to="/konten/buchungen" search={{ buchung: s.bookingId }}>
                  {longDay(s.date)} · {s.payeeName ?? 'Ohne Empfänger'} · {eur(s.amountCents)}
                </AppLink>
              </li>
            ))}
          </ul>
        ) : (
          <p>Keine Buchungen in dieser Zelle.</p>
        )}
      </DetailPanel>
    </>
  );
}
function IncomeExpenseChart({ data, months }: { data: ReportTables; months: string[] }) {
  useAmountPrivacy();
  const points = data.months.filter((m) => months.includes(m.month));
  const income = points.map((m) => monthHouseholdIncome(m, data));
  const expenses = points.map((m) => -Object.values(m.spending).reduce((a, v) => a + v, 0));
  const net = points.map((_, i) => income[i]! + expenses[i]!);
  const lo = Math.min(0, ...expenses, ...income, ...net);
  const hi = Math.max(1, ...income, ...expenses, ...net);
  const x = (i: number) => 64 + ((i + 0.5) * 680) / Math.max(1, points.length);
  const y = (v: number) => 220 - ((v - lo) / (hi - lo)) * 200;
  const width = (680 / Math.max(1, points.length)) * 0.65;
  return (
    <ChartSvg
      width={760}
      height={260}
      label="Monatliche Einnahmen oben, Ausgaben unten und Netto als Linie"
      testId="income-expense-chart"
      points={chartPoints(months, x, [
        { name: 'Einnahmen · Haushalt', values: income },
        { name: 'Ausgaben', values: expenses, color: 'var(--ink-3)' },
        { name: 'Netto', values: net, color: 'var(--future)' },
      ])}
    >
      <Graticule
        x1={64}
        x2={744}
        lines={[lo, 0, hi].map((v) => ({ y: y(v), label: eur(Math.round(v), { cents: false }) }))}
      />
      <AxisLine x1={64} x2={744} y={y(0)} />
      {points.map((p, i) => (
        <g key={p.month} data-chart-point={i}>
          <rect
            x={x(i) - width / 2}
            y={Math.min(y(income[i]!), y(0))}
            width={width}
            height={Math.abs(y(0) - y(income[i]!))}
            fill="var(--line)"
          />
          <rect
            x={x(i) - width / 2}
            y={Math.min(y(0), y(expenses[i]!))}
            width={width}
            height={Math.abs(y(expenses[i]!) - y(0))}
            fill="var(--ink-3)"
          />
        </g>
      ))}
      <Line kind="actual" points={net.map((v, i) => [x(i), y(v)])} />
      <XTicks
        y={248}
        ticks={months.flatMap((m, i) =>
          i % Math.max(1, Math.ceil(months.length / 8)) === 0
            ? [{ x: x(i), label: monthShort(m, true) }]
            : [],
        )}
      />
    </ChartSvg>
  );
}
