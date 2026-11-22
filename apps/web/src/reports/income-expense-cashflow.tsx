import { addMonths, cashflowDevelopment, cashflowStatement } from '@budget/domain';
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
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { monthShort } from './table-format';

/** The statement sentence of the period (at most 140 characters, the verdict contract): cashflow, average, comparison; says if the running month counts. */
export function cashflowStatementLine(data: IncomeExpenseReportData, months: string[]): string {
  const statement = cashflowStatement(data.months, months, data);
  const running = data.currentMonth && months.includes(data.currentMonth);
  return `Cashflow${running ? ' inkl. laufendem Monat' : ''}: ${statement ? eur(statement.total) : '—'}, durchschnittlich ${statement ? eur(statement.averagePerMonth) : '—'} pro Monat${
    statement?.comparison
      ? `; ${statement.comparison.kind === 'previous-year' ? 'Vorjahr' : 'Vorperiode'} ${eur(statement.comparison.total)}, Veränderung ${eur(statement.comparison.delta)}`
      : ''
  }.`;
}

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
  const previousMonths = new Set(rows.map((r) => addMonths(r.month, -12)));
  const previous = new Map(
    (REDESIGN_ENABLED
      ? cashflowDevelopment(
          data.months.filter((m) => previousMonths.has(m.month)),
          data,
        )
      : []
    ).map((r) => [r.month, r.cashflow]),
  );
  const priorValues = rows.map((r) => previous.get(addMonths(r.month, -12)));
  const values = rows.flatMap((r) => [r.cashflow, r.cumulative]);
  values.push(...previous.values());
  const lo = Math.min(0, ...values);
  const hi = Math.max(1, ...values);
  const left = 64;
  const slot = 680 / rows.length;
  const x = (i: number) => left + (i + 0.5) * slot;
  const y = (v: number) => 150 - ((v - lo) / (hi - lo)) * 130;
  const barWidth = Math.max(2, slot * 0.5);
  const last = rows.at(-1)!;
  const running = (m: string) => m === data.currentMonth;
  const priorSegments: Array<Array<[number, number]>> = [];
  let priorSegment: Array<[number, number]> | undefined;
  priorValues.forEach((value, index) => {
    if (value === undefined) {
      priorSegment = undefined;
      return;
    }
    if (!priorSegment) {
      priorSegment = [];
      priorSegments.push(priorSegment);
    }
    priorSegment.push([x(index), y(value)]);
  });
  return (
    <section
      id={REDESIGN_ENABLED ? 'cashflow' : undefined}
      className="income-expense-cashflow"
      aria-labelledby="ie-cashflow-title"
      data-testid="income-expense-cashflow"
    >
      <h3 id="ie-cashflow-title" tabIndex={REDESIGN_ENABLED ? -1 : undefined}>
        Cashflow
      </h3>
      <p className="r8-scope" data-testid="cashflow-statement">
        {cashflowStatementLine(data, months)}
      </p>
      <ChartSvg
        width={760}
        height={190}
        label={`Monatlicher Cashflow als Säulen um die Nulllinie und kumulierter Cashflow als Linie${previous.size ? ', mit monatlichem Cashflow im Vorjahr' : ''}`}
        testId="cashflow-development-chart"
        points={chartPoints(
          rows.map((r) => r.month),
          x,
          [
            { name: 'Cashflow', values: rows.map((r) => r.cashflow) },
            { name: 'Kumuliert', values: rows.map((r) => r.cumulative), color: 'var(--future)' },
            ...(previous.size ? [{ name: 'Cashflow Vorjahr', values: priorValues }] : []),
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
              fillOpacity={running(r.month) ? 0.4 : undefined}
              stroke={r.cashflow >= 0 && !running(r.month) ? 'none' : 'var(--ink)'}
              strokeWidth={1.5}
              strokeOpacity={REDESIGN_ENABLED && running(r.month) ? 0.55 : undefined}
              strokeDasharray={r.cashflow >= 0 && !running(r.month) ? undefined : '3 2'}
            />
          </g>
        ))}
        <Line kind="actual" points={rows.map((r, i) => [x(i), y(r.cumulative)])} />
        {priorSegments.map((segment) => (
          <g key={segment[0]![0]} data-testid="cashflow-previous-year-series">
            {segment.length === 1 ? (
              <circle cx={segment[0]![0]} cy={segment[0]![1]} r={3} fill="var(--ink)" />
            ) : (
              <Line kind="previous" points={segment} />
            )}
          </g>
        ))}
        <XTicks
          y={182}
          ticks={rows.flatMap((r, i) =>
            i % Math.max(1, Math.ceil(rows.length / 8)) === 0
              ? [{ x: x(i), label: monthShort(r.month, true) }]
              : [],
          )}
        />
      </ChartSvg>
      <LineLegend
        items={[
          { kind: 'actual', label: 'Kumulierter Cashflow' },
          ...(previous.size ? [{ kind: 'previous' as const, label: 'Cashflow Vorjahr' }] : []),
        ]}
      />
      <p className="r8-scope">
        Säulen: Cashflow je Monat; gefüllt über der Nulllinie positiv, gestrichelt umrandet unter
        der Nulllinie negativ. Linie: kumulierter Cashflow, aktuell {eur(last.cumulative)}. Der
        laufende Monat ist heller und gestrichelt dargestellt.
        {REDESIGN_ENABLED ? (
          <>
            {' '}
            Cashflow = Einnahmen − Ausgaben. Als Ausgaben zählen auch kategorisierte
            Zukunft-Umbuchungen sowie Ausgaben ohne Kategorie. Der frühere Cashflow-Verlauf zog nur
            Bedarf und Wunsch ab.{' '}
            {previous.size > 0 &&
              'Die Vorjahreslinie zeigt den monatlichen Cashflow der entsprechenden vollen Monate.'}
          </>
        ) : (
          <> Zukunft-Umbuchungen sind als Ausgaben enthalten (siehe Hinweis zur Datenbasis).</>
        )}
      </p>
      <div
        className="r8-month-table"
        role="region"
        aria-label="Cashflow je Monat, horizontal verschiebbar"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users can scroll the exact-value table.
        tabIndex={0}
        style={rows.length > 12 ? { maxHeight: '24rem', overflowY: 'auto' } : undefined}
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
            {rows.map((r) => (
              <tr key={r.month}>
                <th scope="row">
                  {monthShort(r.month, true)}
                  {running(r.month) ? ' · laufend' : ''}
                </th>
                <td>{eur(r.income)}</td>
                <td>{eur(r.expenses)}</td>
                <td>{eur(r.cashflow)}</td>
                <td>{eur(r.cumulative)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Summe · {rows.length} Monate</th>
              <td>{eur(rows.reduce((a, r) => a + r.income, 0))}</td>
              <td>{eur(rows.reduce((a, r) => a + r.expenses, 0))}</td>
              <td>{eur(last.cumulative)}</td>
              <td>{eur(last.cumulative)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
