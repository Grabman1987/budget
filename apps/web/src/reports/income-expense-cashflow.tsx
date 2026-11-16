import { cashflowDevelopment, cashflowStatement } from '@budget/domain';
import type { IncomeExpenseReportData } from '@budget/db';
import {
  AxisLine,
  ChartSvg,
  Graticule,
  Line,
  LineLegend,
  XTicks,
  useAmountPrivacy,
} from '@budget/ui';
import { chartPoints } from '../charts/tooltip-data';
import { eur } from '../ledger/format';
import { monthShort } from './table-format';

/** Cashflow of the period: statement line, monthly bars around zero plus cumulative line, table. */
export function IncomeExpenseCashflow({
  data,
  months,
}: {
  data: IncomeExpenseReportData;
  months: string[];
}) {
  useAmountPrivacy();
  const selected = data.months.filter((m) => months.includes(m.month));
  if (!selected.length) return null;
  const rows = cashflowDevelopment(selected, data);
  const statement = cashflowStatement(data.months, months, data);
  const values = rows.flatMap((r) => [r.cashflow, r.cumulative]);
  const lo = Math.min(0, ...values);
  const hi = Math.max(1, ...values);
  const left = 64;
  const slot = 680 / rows.length;
  const x = (i: number) => left + (i + 0.5) * slot;
  const y = (v: number) => 150 - ((v - lo) / (hi - lo)) * 130;
  const barWidth = Math.max(2, slot * 0.5);
  const last = rows.at(-1)!;
  return (
    <section
      className="income-expense-cashflow"
      aria-labelledby="ie-cashflow-title"
      data-testid="income-expense-cashflow"
    >
      <h3 id="ie-cashflow-title">Cashflow</h3>
      <p className="r8-scope" data-testid="cashflow-statement">
        Cashflow = Einnahmen − Ausgaben. Im Zeitraum {statement ? eur(statement.total) : '—'},
        durchschnittlich {statement ? eur(statement.averagePerMonth) : '—'} pro Monat
        {statement?.comparison
          ? `; ${statement.comparison.kind === 'previous-year' ? 'Vorjahreszeitraum' : 'Vorperiode'} ${eur(statement.comparison.total)}, Veränderung ${eur(statement.comparison.delta)}`
          : ''}
        .
      </p>
      <ChartSvg
        width={760}
        height={190}
        label="Monatlicher Cashflow als Säulen um die Nulllinie und kumulierter Cashflow als Linie"
        testId="cashflow-development-chart"
        points={chartPoints(
          rows.map((r) => r.month),
          x,
          [
            { name: 'Cashflow', values: rows.map((r) => r.cashflow) },
            { name: 'Kumuliert', values: rows.map((r) => r.cumulative), color: 'var(--future)' },
          ],
        )}
      >
        <Graticule
          x1={left}
          x2={744}
          lines={[lo, 0, hi].map((v) => ({ y: y(v), label: eur(Math.round(v), { cents: false }) }))}
        />
        <AxisLine x1={left} x2={744} y={y(0)} />
        {rows.map((r, i) => (
          <g key={r.month} data-chart-point={i}>
            <rect
              x={x(i) - barWidth / 2}
              y={Math.min(y(0), y(r.cashflow))}
              width={barWidth}
              height={Math.abs(y(0) - y(r.cashflow))}
              fill={r.cashflow >= 0 ? 'var(--primary)' : 'none'}
              stroke={r.cashflow >= 0 ? 'none' : 'var(--ink)'}
              strokeWidth={1.5}
              strokeDasharray={r.cashflow >= 0 ? undefined : '3 2'}
            />
          </g>
        ))}
        <Line kind="actual" points={rows.map((r, i) => [x(i), y(r.cumulative)])} />
        <XTicks
          y={182}
          ticks={rows.flatMap((r, i) =>
            i % Math.max(1, Math.ceil(rows.length / 8)) === 0
              ? [{ x: x(i), label: monthShort(r.month, true) }]
              : [],
          )}
        />
      </ChartSvg>
      <LineLegend items={[{ kind: 'actual', label: 'Kumulierter Cashflow' }]} />
      <p className="r8-scope">
        Säulen: Cashflow je Monat; gefüllt über der Nulllinie positiv, gestrichelt umrandet unter
        der Nulllinie negativ. Linie: kumulierter Cashflow, aktuell {eur(last.cumulative)}.
        Zukunft-Umbuchungen sind als Ausgaben enthalten (siehe Hinweis zur Datenbasis).
      </p>
      <div
        className="r8-month-table"
        role="region"
        aria-label="Cashflow je Monat, horizontal verschiebbar"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users can scroll the exact-value table.
        tabIndex={0}
      >
        <table className="r8-months">
          <caption className="sr-only">Cashflow je Monat mit kumuliertem Verlauf</caption>
          <thead>
            <tr>
              <th>Monat</th>
              <th>Einnahmen</th>
              <th>Ausgaben</th>
              <th>Cashflow</th>
              <th>kumuliert</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.month}>
                <th scope="row">{monthShort(r.month, true)}</th>
                <td>{eur(r.income)}</td>
                <td>{eur(r.expenses)}</td>
                <td>{eur(r.cashflow)}</td>
                <td>{eur(r.cumulative)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
