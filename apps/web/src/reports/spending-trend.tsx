import type { SpendingReport } from '@budget/db';
import { ChartSvg, Graticule, AxisLine, XTicks, useAmountPrivacy } from '@budget/ui';
import { chartPoints } from '../charts/tooltip-data';
import { useElementWidth } from '../charts/use-element-width';
import { eur, longDay } from '../ledger/format';

/** Exact-day snapshots from this reader; never infer a daily plan or incomplete monthly history. */
export function SpendingTrend({ data }: { data: SpendingReport }) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  if (!data.months.length) return null;
  const values = [data.answerComparison.previousCents, data.consumptionCents];
  const dates = [data.answerComparison.previousTo ?? 'Nicht verfügbar', data.to ?? 'Aktuell'];
  const supplied = values.filter((v): v is number => v !== null);
  const low = Math.min(0, ...supplied),
    high = Math.max(1, ...supplied);
  const x = (i: number) => 54 + ((i + 0.5) / 2) * (width - 76);
  const y = (v: number) => 146 - ((v - low) / (high - low)) * 126;
  return (
    <section className="r8-spending-trend" aria-labelledby="r8-spending-trend-title">
      <div className="sr-head">
        <h2 id="r8-spending-trend-title">Konsum im Zeitraumvergleich</h2>
      </div>
      <div ref={ref}>
        {width > 0 && (
          <ChartSvg
            testId="spending-period-chart"
            width={width}
            height={180}
            label="Konsum im aktuellen und gleich langen vorherigen Zeitraum, einschließlich Erstattungen"
            points={chartPoints(dates, x, [{ name: 'Konsum', values }])}
          >
            <Graticule
              x1={54}
              x2={width - 22}
              lines={[low, high].map((v) => ({ y: y(v), label: eur(v, { cents: false }) }))}
            />
            <AxisLine x1={54} x2={width - 22} y={y(0)} />
            {values.map((v, i) =>
              v === null ? null : (
                <rect
                  key={i}
                  x={x(i) - Math.max(1, (width - 76) / 8)}
                  y={Math.min(y(0), y(v))}
                  width={Math.max(2, (width - 76) / 4)}
                  height={Math.abs(y(v) - y(0))}
                  fill={i ? 'var(--primary)' : 'var(--line-2)'}
                />
              ),
            )}
            <XTicks
              y={174}
              ticks={[
                { x: x(0), label: 'Vorzeitraum' },
                { x: x(1), label: 'Aktuell' },
              ]}
            />
          </ChartSvg>
        )}
      </div>
      <p className="r8-scope">
        Bedarf und Wunsch · netto nach Erstattungen · ohne Zukunft.{' '}
        {data.from && data.to ? `${longDay(data.from)} bis ${longDay(data.to)}.` : ''}{' '}
        {data.answerComparison.previousCents === null
          ? 'Vorzeitraum nicht verfügbar.'
          : `Vergleich: jeweils ${data.answerComparison.days} Tage.`}
      </p>
    </section>
  );
}
