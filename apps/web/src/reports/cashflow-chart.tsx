import {
  AxisLine,
  BarsAroundZero,
  ChartSvg,
  ClassPatterns,
  Graticule,
  Line,
  patternFill,
  usePatternPrefix,
  type Bar,
  type Point,
} from '@budget/ui';
import { MINUS } from '@budget/domain';
import { useElementWidth } from '../charts/use-element-width';
import { eur, monthName } from '../ledger/format';
import { kfmt, yTicks } from '../wealth/networth-model';
import type { CashflowReport } from './cashflow-api';

const L = 56;
const R = 14;

const label = (month: string) => `${monthName(`${month}-01`).slice(0, 3)} ${month.slice(2, 4)}`;
const long = (month: string) => `${monthName(`${month}-01`)} ${month.slice(0, 4)}`;

/** Every n-th label so that they fit. */
const every = (count: number, width: number) => Math.max(1, Math.ceil((count * 46) / width));

/**
 * Cashflow-Verlauf, two drawings on one scale of months: spending as columns (Bedarf solid, Wunsch
 * hatched) with the household income as line, and beneath it the net cashflow as bars around zero
 * next to the Kapitalerträge in pale ink, which are shown separately and never part of the income.
 * Port of the two charts of `R.cashflow` in `design/prototype/reports-zukunft.js`.
 */
export function CashflowChart({ report }: { report: CashflowReport }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="rf-chart rf-chart-stack">
      {width > 0 && report.months.length > 0 && <Drawing report={report} width={width} />}
    </div>
  );
}

function Drawing({ report, width: W }: { report: CashflowReport; width: number }) {
  const prefix = usePatternPrefix('cf');
  const { months } = report;
  const n = months.length;
  const H1 = 230;
  const H2 = 170;
  const slot = (W - L - R) / n;
  const x = (i: number) => L + slot * (i + 0.5);
  const barW = Math.max(3, slot * 0.56);

  // Drawing geometry only: euros as plain numbers, never stored or summed again.
  const top = Math.max(...months.flatMap((m) => [m.incomeCents, m.consumptionCents]), 1) / 100;
  const y = (v: number) => H1 - 26 - (v / (top * 1.08)) * (H1 - 26 - 12);
  const grid = yTicks(0, top * 1.08).map((v) => ({ y: y(v), label: kfmt(v) }));
  const income: Point[] = months.map((m, i) => [x(i), y(m.incomeCents / 100)]);
  const step = every(n, W - L - R);

  const nets = months.map((m) => m.netCents / 100);
  const caps = months.map((m) => m.capitalCents / 100);
  const hi = Math.max(0, ...nets, ...caps, 1);
  const lo = Math.min(0, ...nets);
  const y2 = (v: number) => H2 - 14 - ((v - lo) / (hi - lo || 1)) * (H2 - 14 - 12);
  const grid2 = [
    { y: y2(hi), label: `+${kfmt(hi)}` },
    { y: y2(0), label: '0' },
    ...(lo < 0 ? [{ y: y2(lo), label: `${MINUS}${kfmt(-lo)}` }] : []),
  ];
  const bw = Math.max(2, barW / 2 - 1);
  const netBars: Bar[] = months.map((m, i) => ({
    x: x(i) - bw / 2 - 1,
    value: nets[i] as number,
    title: `Nettocashflow ${long(m.month)}: ${eur(m.netCents, { sign: true })}`,
  }));
  const capBars: Bar[] = months.map((m, i) => ({
    x: x(i) + bw / 2 + 1,
    value: caps[i] as number,
    title: `Kapitalerträge ${long(m.month)}: ${eur(m.capitalCents)}`,
  }));
  const first = months[0]!;
  const last = months[n - 1]!;
  const summary =
    `Ausgaben je Monat als Säulen, Einnahmen als Linie, ${long(first.month)} bis ${long(last.month)}; ` +
    `darunter Nettocashflow und Kapitalerträge je Monat.`;
  const summary2 = `Nettocashflow je Monat als Balken um Null, Kapitalerträge daneben, ${long(first.month)} bis ${long(last.month)}.`;
  const ticks = (h: number) =>
    months.map((m, i) =>
      i % step === 0 ? (
        <text key={m.month} x={x(i)} y={h - 6} textAnchor="middle" className="svg-label">
          {label(m.month)}
        </text>
      ) : null,
    );

  return (
    <>
      <ChartSvg width={W} height={H1} label={summary} testId="cashflow-chart">
        <ClassPatterns prefix={prefix} />
        <Graticule x1={L} x2={W - R} lines={grid} />
        {months.map((m, i) => {
          const need = m.needCents / 100;
          const want = m.wantCents / 100;
          return (
            <g key={m.month}>
              <rect
                x={x(i) - barW / 2}
                y={y(need)}
                width={barW}
                height={Math.max(0, y(0) - y(need))}
                fill="var(--need)"
              >
                <title>{`Bedarf ${long(m.month)}: ${eur(m.needCents)}`}</title>
              </rect>
              <rect
                x={x(i) - barW / 2}
                y={y(need + want)}
                width={barW}
                height={Math.max(0, y(need) - y(need + want))}
                fill={patternFill(prefix, 'want')}
                className="rf-want"
              >
                <title>{`Wunsch ${long(m.month)}: ${eur(m.wantCents)}`}</title>
              </rect>
            </g>
          );
        })}
        <AxisLine x1={L} x2={W - R} y={y(0)} />
        <Line kind="actual" points={income} draw />
        {months.map((m, i) => (
          <circle key={m.month} cx={x(i)} cy={income[i]![1]} r={2.5} className="dot-actual">
            <title>{`Einnahmen ${long(m.month)}: ${eur(m.incomeCents)}`}</title>
          </circle>
        ))}
        {ticks(H1)}
      </ChartSvg>
      <ChartSvg width={W} height={H2} label={summary2} testId="cashflow-net-chart">
        <Graticule x1={L} x2={W - R} lines={grid2} />
        <AxisLine x1={L} x2={W - R} y={y2(0)} />
        <BarsAroundZero bars={netBars} y={y2} barWidth={bw} tone="ink" />
        <BarsAroundZero bars={capBars} y={y2} barWidth={bw} tone="pale" />
        {ticks(H2)}
      </ChartSvg>
    </>
  );
}
