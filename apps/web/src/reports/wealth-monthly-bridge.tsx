import { useQuery } from '@tanstack/react-query';
import type { Period } from '@budget/domain';
import { ChartSvg, Graticule, AxisLine, BarsAroundZero, useAmountPrivacy } from '@budget/ui';
import { useElementWidth } from '../charts/use-element-width';
import { chartPoints } from '../charts/tooltip-data';
import { eur } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { kfmt, yTicks } from '../wealth/networth-model';
import { wholePictureQuery } from './whole-picture-report';
import { monthLong } from './overview-format';

/** Existing monthly bridge reader; only chart coordinates are calculated here. */
export function WealthMonthlyBridge({ period }: { period: Period }) {
  useAmountPrivacy();
  const query = useQuery(wholePictureQuery(period));
  const [ref, width] = useElementWidth<HTMLDivElement>({ retainPositive: true });
  const rows = query.isError ? [] : (query.data?.rows ?? []);
  const lo = Math.min(0, ...rows.flatMap((row) => [row.savedCents, row.marketCents])) / 100;
  const hi = Math.max(1, ...rows.flatMap((row) => [row.savedCents, row.marketCents])) / 100;
  const pad = (hi - lo) * 0.1;
  const y = (value: number) => 140 - ((value - lo + pad) / (hi - lo + pad * 2)) * 124;
  const slot = (width - 70) / Math.max(1, rows.length);
  const x = (index: number) => 56 + slot * (index + 0.5);
  const barWidth = Math.max(1, Math.min(16, slot * 0.28));
  return (
    <section className="card rf-card rf-wide" aria-labelledby="wealth-monthly-title">
      <div className="tbd-head">
        <h2 id="wealth-monthly-title">Veränderung je Monat</h2>
      </div>
      {query.isPending && <LoadingNote what="Monatliche Veränderung" />}
      {query.isError && (
        <ErrorNote
          what="Monatliche Veränderung"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isSuccess && rows.length === 0 && (
        <EmptyNote>Keine Monatsdaten im gewählten Zeitraum.</EmptyNote>
      )}
      <div ref={ref}>
        {width > 0 && rows.length > 0 && (
          <ChartSvg
            width={width}
            height={170}
            label="Gespart und Markt je Monat in Euro"
            testId="wealth-monthly-bridge"
            table
            points={chartPoints(
              rows.map((row) => row.month),
              x,
              [
                {
                  name: 'Gespart',
                  values: rows.map((row) => row.savedCents),
                  color: 'var(--line)',
                },
                {
                  name: 'Markt',
                  values: rows.map((row) => row.marketCents),
                  color: 'var(--ink-2)',
                },
              ],
            )}
          >
            <Graticule
              x1={56}
              x2={width - 14}
              lines={yTicks(lo - pad, hi + pad).map((v) => ({ y: y(v), label: kfmt(v) }))}
            />
            <AxisLine x1={56} x2={width - 14} y={y(0)} />
            <BarsAroundZero
              bars={rows.map((row, i) => ({
                x: x(i) - barWidth / 2,
                value: row.savedCents / 100,
                title: `Gespart ${monthLong(row.month)}: ${eur(row.savedCents)}`,
              }))}
              y={y}
              barWidth={barWidth}
              tone="ink"
              negativeTone="ink"
            />
            <BarsAroundZero
              bars={rows.map((row, i) => ({
                x: x(i) + barWidth / 2,
                value: row.marketCents / 100,
                title: `Markt ${monthLong(row.month)}: ${eur(row.marketCents)}`,
              }))}
              y={y}
              barWidth={barWidth}
              tone="pale"
              negativeTone="ink"
            />
            {rows.map(
              (row, i) =>
                (slot >= 32 || i % Math.ceil(32 / slot) === 0) && (
                  <text key={row.month} x={x(i)} y={163} textAnchor="middle" className="svg-label">
                    {row.month.slice(5)}
                  </text>
                ),
            )}
          </ChartSvg>
        )}
      </div>
      <ul className="rf-legend">
        <li>
          <i className="rf-sq rf-sq-ink" aria-hidden="true" />
          Gespart
        </li>
        <li>
          <i className="rf-sq rf-sq-pale" aria-hidden="true" />
          Markt
        </li>
      </ul>
      <p className="vnote">
        Monatsbrücke aus der Gesamtübersicht: Sparbetrag aus Haushaltseinnahmen und Konsum;
        Markteffekt der Investments einschließlich Anlage-Cash nach externen Nettoflüssen. Die
        tägliche Nettovermögenskette nutzt ihre eigene ausgewiesene Abgrenzung.{' '}
        {query.data?.incomplete?.length ? '≈ Bewertungen teilweise geschätzt.' : ''}
      </p>
    </section>
  );
}
