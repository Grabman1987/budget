import {
  cents,
  incomeExpenseNet,
  incomeExpenseRows,
  monthHouseholdIncome,
  monthTotalSpending,
  tableRowTotal,
} from '@budget/domain';
import type { IncomeExpenseReportData } from '@budget/db';
import {
  AxisLine,
  ChartSvg,
  Graticule,
  Line,
  XTicks,
  LineLegend,
  useAmountPrivacy,
  useMediaQuery,
} from '@budget/ui';
import type { ReactNode } from 'react';
import { useSearch } from '@tanstack/react-router';
import { useElementWidth } from '../charts/use-element-width';
import { chartPoints } from '../charts/tooltip-data';
import { eur } from '../ledger/format';
import { useStoredFlag } from '../shell/use-stored-flag';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { AppLink } from '../shell/app-link';
import type { ReportCalculation } from './report-frame';
import { monthShort } from './table-format';
import './income-spending-redesign.css';

/** Use precisely the rows and totals exported by the existing table, including Zukunft. */
export function incomeOverviewModel(data: IncomeExpenseReportData, months: string[]) {
  const selected = data.months.filter((row) => months.includes(row.month));
  const rows = incomeExpenseRows(selected, data, new Set());
  const total = (key: string) => tableRowTotal(rows.find((row) => row.key === key)!);
  const income = total('inc'),
    expenses = total('exp'),
    net = total('net');
  const calculation: ReportCalculation | undefined =
    income !== null && expenses !== null && net !== null
      ? {
          label: 'Berechnung Einnahmen und Ausgaben',
          signed: true,
          terms: [
            { label: 'Haushaltseinnahmen', value: cents(income) },
            { op: '-', label: 'Ausgaben inkl. Zukunft', value: cents(expenses) },
          ],
          result: { label: 'Netto nach Zukunft · Buchungsdatum', value: net, unit: 'money' },
        }
      : undefined;
  return { selected, income, expenses, net, calculation };
}

export function IncomeOverviewDetails({ children }: { children: ReactNode }) {
  const [open, setOpen] = useStoredFlag('budget-report-income-details');
  const printing = useMediaQuery('print');
  if (!REDESIGN_ENABLED) return <>{children}</>;
  return (
    <details
      className="r8-income-details"
      open={open || printing}
      onKeyDownCapture={(event) => {
        // The table region scrolls; the surrounding chart still handles its own inspection keys.
        if (
          event.target instanceof HTMLElement &&
          event.target.matches('.rscroll') &&
          (event.key === 'ArrowRight' || event.key === 'ArrowLeft')
        ) {
          event.target.scrollBy({ left: event.key === 'ArrowRight' ? 48 : -48 });
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onToggle={(event) => {
        if (!printing && event.currentTarget.open !== open) setOpen(event.currentTarget.open);
      }}
    >
      <summary>Einnahmen nach Quelle und vollständige Tabelle</summary>
      {children}
    </details>
  );
}

export function IncomeExpenseSummary({
  data,
  months,
}: {
  data: IncomeExpenseReportData;
  months: string[];
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const search = useSearch({ strict: false });
  const m = incomeOverviewModel(data, months);
  const income = m.selected.map((r) => monthHouseholdIncome(r, data));
  const expenses = m.selected.map(monthTotalSpending);
  const net = m.selected.map((r) => incomeExpenseNet(r, data));
  const low = Math.min(0, ...income, ...expenses, ...net),
    high = Math.max(1, ...income, ...expenses, ...net);
  const height = 180,
    left = 56,
    right = 16,
    bottom = 150;
  const slot = (width - left - right) / Math.max(1, m.selected.length);
  const x = (i: number) => left + (i + 0.5) * slot;
  const y = (v: number) => bottom - ((v - low) / (high - low)) * (bottom - 18);
  return (
    <div className="r8-income-summary" data-testid="income-overview-summary">
      <div ref={ref} className="r8-overview-chart">
        {width > 0 && (
          <ChartSvg
            table
            width={width}
            height={height}
            testId="income-expense-chart"
            label="Haushaltseinnahmen und Ausgaben einschließlich Zukunft, Netto nach Buchungsdatum"
            points={chartPoints(
              m.selected.map((r) => r.month),
              x,
              [
                { name: 'Haushaltseinnahmen', values: income },
                { name: 'Ausgaben inkl. Zukunft', values: expenses, color: 'var(--ink-3)' },
                { name: 'Netto nach Zukunft', values: net, color: 'var(--ink)' },
              ],
            )}
          >
            <Graticule
              x1={left}
              x2={width - right}
              lines={[low, high].map((v) => ({ y: y(v), label: eur(v, { cents: false }) }))}
            />
            <AxisLine x1={left} x2={width - right} y={y(0)} />
            {m.selected.map((r, i) => (
              <g key={r.month} data-chart-point={i}>
                {[income[i]!, expenses[i]!].map((v, j) => (
                  <rect
                    key={j}
                    x={x(i) + (j === 0 ? -0.36 : 0.02) * slot}
                    y={Math.min(y(0), y(v))}
                    height={Math.abs(y(0) - y(v))}
                    width={Math.max(1, slot * 0.32)}
                    fill={j === 0 ? 'var(--primary)' : 'var(--line-2)'}
                  />
                ))}
              </g>
            ))}
            <Line kind="actual" points={net.map((v, i) => [x(i), y(v)])} draw={false} />
            <XTicks
              y={height - 6}
              ticks={m.selected.flatMap((r, i) =>
                i % Math.max(1, Math.ceil(m.selected.length / (width < 500 ? 4 : 12))) === 0
                  ? [{ x: x(i), label: monthShort(r.month) }]
                  : [],
              )}
            />
          </ChartSvg>
        )}
      </div>
      <LineLegend items={[{ kind: 'actual', label: 'Netto nach Zukunft' }]} />
      <p className="r8-scope">
        Säulen: Haushaltseinnahmen und Ausgaben inkl. Zukunft. Tatsächliches Buchungsdatum;
        Kapitalerträge und Erstattungen ohne Kategorie sind keine Haushaltseinnahmen.
      </p>
      <div
        className="r8-month-table"
        role="region"
        aria-label="Monatliche Einnahmen, Ausgaben und Netto, horizontal verschiebbar"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users can scroll the exact-value table.
        tabIndex={0}
      >
        <table className="r8-months">
          <caption className="sr-only">
            Letzte drei Monate des gewählten Zeitraums und vollständige Summe
          </caption>
          <thead>
            <tr>
              <th>Monat</th>
              <th>Einnahmen</th>
              <th>Ausgaben inkl. Zukunft</th>
              <th>Netto</th>
            </tr>
          </thead>
          <tbody>
            {m.selected
              .slice(-3)
              .reverse()
              .map((r) => (
                <tr key={r.month}>
                  <th scope="row">{monthShort(r.month, true)}</th>
                  <td>{eur(monthHouseholdIncome(r, data))}</td>
                  <td>{eur(monthTotalSpending(r))}</td>
                  <td>{eur(incomeExpenseNet(r, data))}</td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Summe · {months.length} Monate</th>
              <td>{m.income === null ? '—' : eur(m.income)}</td>
              <td>{m.expenses === null ? '—' : eur(m.expenses)}</td>
              <td>{m.net === null ? '—' : eur(m.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <nav className="r8-income-links" aria-label="Weitere Einnahmenansichten">
        <AppLink
          to="/reports/einnahmen-ausgaben"
          search={{ ...search, darstellung: 'income' } as never}
        >
          Soll und Ist je Einnahme
        </AppLink>
        <AppLink
          to="/reports/einnahmen-ausgaben"
          search={{ ...search, darstellung: 'projekte' } as never}
        >
          Projekte und Nebeneinkünfte
        </AppLink>
      </nav>
    </div>
  );
}
