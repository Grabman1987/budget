import { addMonths, lastDayOfMonth } from '@budget/domain';
import type { PriceRow } from '@budget/db';
import { AxisLine, Button, ChartSvg, Graticule, Line, XTicks, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { shortDay } from '../ledger/format';
import { quoteText } from './portfolio-format';
import './price-history.css';

const RANGES = ['1M', '6M', '1J', 'Max'] as const;
type Range = (typeof RANGES)[number];

export function PriceHistory({
  securityId,
  asOf,
}: {
  securityId: string;
  asOf?: string | undefined;
}) {
  useAmountPrivacy();
  const [range, setRange] = useState<Range>('Max');
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'security-prices', securityId],
    retry: false,
    queryFn: () =>
      request<{ securityId: string; currency: string; prices: PriceRow[] }>(
        'GET',
        `/api/securities/${encodeURIComponent(securityId)}/prices`,
      ),
  });
  const to = asOf ?? query.data?.prices.at(-1)?.date;
  const month =
    to && range !== 'Max'
      ? addMonths(to.slice(0, 7), -{ '1M': 1, '6M': 6, '1J': 12 }[range])
      : null;
  const from =
    month && to
      ? `${month}-${to.slice(8, 10)}` > lastDayOfMonth(month)
        ? lastDayOfMonth(month)
        : `${month}-${to.slice(8, 10)}`
      : null;
  const prices =
    query.data?.prices.filter((p) => (!from || p.date >= from) && (!to || p.date <= to)) ?? [];
  return (
    <section className="price-history" aria-labelledby="price-history-title">
      <h3 id="price-history-title">Kursverlauf</h3>
      <div className="price-history-ranges" role="group" aria-label="Zeitraum des Kursverlaufs">
        {RANGES.map((r) => (
          <Button key={r} variant="ghost" aria-pressed={range === r} onClick={() => setRange(r)}>
            {r}
          </Button>
        ))}
      </div>
      {query.isPending && <LoadingNote what="Kursverlauf" />}
      {query.isError && (
        <ErrorNote what="Kursverlauf" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.isSuccess &&
        (prices.length ? (
          <PriceChart prices={prices} />
        ) : (
          <p className="vnote">Keine gespeicherten Kurse im Zeitraum.</p>
        ))}
    </section>
  );
}

function PriceChart({ prices }: { prices: PriceRow[] }) {
  const lo = Math.min(...prices.map((p) => p.priceMicro));
  const hi = Math.max(...prices.map((p) => p.priceMicro));
  const pad = Math.max(1, (hi - lo) * 0.1);
  const first = Date.parse(prices[0]!.date);
  const duration = Date.parse(prices.at(-1)!.date) - first;
  const x = (p: PriceRow) =>
    duration ? 100 + ((Date.parse(p.date) - first) / duration) * 620 : 410;
  const y = (v: number) => 226 - ((v - lo + pad) / (hi - lo + 2 * pad)) * 200;
  const currency = prices[0]!.currency;
  return (
    <ChartSvg
      width={760}
      height={270}
      label={`Gespeicherte Kurse in ${currency}`}
      testId="price-history-chart"
      points={prices.map((p) => ({
        x: x(p),
        date: p.date,
        series: [{ name: 'Kurs', value: quoteText(p), color: 'var(--line)' }],
      }))}
    >
      <Graticule
        x1={100}
        x2={720}
        lines={[...new Set([lo, hi])].map((v) => ({
          y: y(v),
          label: quoteText({ ...prices[0]!, priceMicro: v }),
        }))}
      />
      <AxisLine x1={100} x2={720} y={226} />
      <Line kind="actual" points={prices.map((p) => [x(p), y(p.priceMicro)])} />
      {prices.map((p, i) => (
        <circle
          key={p.date}
          data-chart-point={i}
          cx={x(p)}
          cy={y(p.priceMicro)}
          r={prices.length === 1 ? 3 : 1.5}
          fill="var(--line)"
        />
      ))}
      <XTicks
        y={256}
        ticks={[prices[0]!, ...(prices.length > 1 ? [prices.at(-1)!] : [])].map((p) => ({
          x: x(p),
          label: `${shortDay(p.date)}${p.date.slice(0, 4)}`,
        }))}
      />
    </ChartSvg>
  );
}
