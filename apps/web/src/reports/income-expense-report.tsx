import {
  incomeExpenseRows,
  incomeExpenseNet,
  monthTotalSpending,
  incomeExpenseSources,
  reportPeriodMonths,
  tableCsv,
  tableRowTotal,
  tableRowAverage,
  monthHouseholdIncome,
  type OverviewSplit,
} from '@budget/domain';
import {
  AxisLine,
  Button,
  ChartSvg,
  Graticule,
  Line,
  LineLegend,
  XTicks,
  useAmountPrivacy,
} from '@budget/ui';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ReportDetailNav } from './report-detail-nav';
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
export function IncomeExpenseReport({
  report,
  meta,
  sources = false,
}: {
  report: ReportEntry;
  meta: PageMeta;
  sources?: boolean;
}) {
  const [period, setPeriod] = useZeitraum();
  const query = useQuery(queryOptionsForReport);
  const { zelle, spalte, gruppen } = useSearch({ strict: false }) as {
    zelle?: string;
    spalte?: string;
    gruppen?: string[];
  };
  const navigate = useNavigate();
  const expanded = new Set(gruppen ?? []);
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
  const selected = data
    ? incomeExpenseRows(months, data, new Set(data.categories.map((c) => c.groupId))).find(
        (r) => r.key === zelle,
      )
    : undefined;
  const selectedMonths =
    spalte === 'summe' ? window : spalte && window.includes(spalte) ? [spalte] : [];
  const detail =
    selected && data ? incomeExpenseSources(data.splits, data, selected.key, selectedMonths) : [];
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
      {sources && (
        <ReportDetailNav
          to="/reports/einnahmen-ausgaben"
          search={{ zeitraum: period, gruppen }}
          report="Einnahmen und Ausgaben"
          title="Buchungen"
          backLabel="Zurück zu Einnahmen und Ausgaben"
        />
      )}
      <TableReportFrame
        report={report}
        meta={meta}
        through="full"
        verdictEnd={window.at(-1)}
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
                  setPeriod(p);
                }}
                options={ZEITRAUM_VALUES.map((value) => ({ value, label: value }))}
              />
            ),
          },
        ]}
      >
        {() =>
          data &&
          (sources ? (
            <>
              <section
                className="tr-card"
                aria-labelledby="ie-sources-title"
                data-testid="income-expense-sources"
              >
                <h2 id="ie-sources-title">{selected?.label ?? 'Buchungen'}</h2>
                <p>{selectedMonths.map((m) => monthShort(m, true)).join(' · ')}</p>
                {!selected || selectedMonths.length === 0 ? (
                  <p>Diese Zelle ist im Reportzeitraum nicht verfügbar.</p>
                ) : detail.length ? (
                  <ul>
                    {detail.map((s, i) => (
                      <li key={`${s.bookingId}:${i}`}>
                        <AppLink
                          className="report-source-link"
                          to="/konten/buchungen"
                          search={{
                            buchung: s.bookingId,
                            von: selectedMonths[0] + '-01',
                            bis: new Date(
                              Date.UTC(
                                Number(selectedMonths.at(-1)!.slice(0, 4)),
                                Number(selectedMonths.at(-1)!.slice(5, 7)),
                                0,
                              ),
                            )
                              .toISOString()
                              .slice(0, 10),
                            ruecksprung:
                              '/reports/einnahmen-ausgaben/buchungen?' +
                              new URLSearchParams({
                                zeitraum: period,
                                zelle: zelle!,
                                spalte: spalte!,
                                ...(gruppen ? { gruppen: JSON.stringify(gruppen) } : {}),
                              }),
                          }}
                        >
                          {longDay(s.date)} · {s.payeeName ?? 'Ohne Empfänger'} ·{' '}
                          {eur(s.amountCents)}
                        </AppLink>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Keine Buchungen in dieser Zelle.</p>
                )}
              </section>
            </>
          ) : (
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
                cellLink={(row, column) => ({
                  to: '/reports/einnahmen-ausgaben/buchungen',
                  search: {
                    zeitraum: period,
                    gruppen,
                    zelle: row.key,
                    spalte: column === null ? 'summe' : window[column],
                  },
                })}
                renderLabel={(r) =>
                  r.key.startsWith('group:') ? (
                    <button
                      type="button"
                      className="table-cell-open"
                      aria-expanded={expanded.has(r.key.slice(6))}
                      onClick={() =>
                        void navigate({
                          to: '.',
                          search: ((old: Record<string, unknown>) => ({
                            ...old,
                            gruppen: expanded.has(r.key.slice(6))
                              ? [...expanded].filter((id) => id !== r.key.slice(6))
                              : [...expanded, r.key.slice(6)],
                          })) as never,
                          replace: true,
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
                Haushaltseinnahmen minus Bedarf, Wunsch, Zukunft und Ausgaben ohne Kategorie.
                Kapitalerträge und Erstattungen ohne Kategorie stehen außerhalb der
                Haushaltseinnahmen; kategorisierte Erstattungen mindern die Ausgaben. Kategorisierte
                Zukunft-Umbuchungen zählen wie in der Gesamttabelle. Netto = Übrig nach Zukunft
                minus Ohne Kategorie. Zuflüsse ohne Einkommensart werden nicht gezählt. Eine Zelle
                öffnet ihre Buchungen; CSV enthält genau die sichtbaren Zeilen, Monate, Summe und Ø.
                Der laufende Monat reicht bis heute.
              </p>
            </section>
          ))
        }
      </TableReportFrame>
    </>
  );
}
function IncomeExpenseChart({ data, months }: { data: ReportTables; months: string[] }) {
  useAmountPrivacy();
  const points = data.months.filter((m) => months.includes(m.month));
  const income = points.map((m) => monthHouseholdIncome(m, data));
  const expenses = points.map((m) => -monthTotalSpending(m));
  const net = points.map((m) => incomeExpenseNet(m, data));
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
