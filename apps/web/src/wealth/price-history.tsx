import { addMonths, lastDayOfMonth, periodWindow, type Period } from '@budget/domain';
import type { InstrumentHistory, PriceRow } from '@budget/db';
import {
  AxisLine,
  Button,
  ChartSvg,
  Graticule,
  Line,
  maskMoneyText,
  useAmountPrivacy,
} from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { eur, longDay } from '../ledger/format';
import { quoteText, unitsText } from './portfolio-format';
import { sourceMoney } from './trade-api';
import { TRADE_LABELS } from './trade-draft';
import { instrumentHistoryQuery } from './portfolio-api';
import { useElementWidth } from '../charts/use-element-width';
import { euroAxis } from './networth-model';
import './price-history.css';

const SOURCE_LABELS = {
  quote: 'Gespeicherter Kurs',
  execution: 'Ausführungskurs',
  cost: 'Einstandsschätzung',
  missing: 'Wert fehlt',
};
const FX_LABELS = {
  identity: 'EUR ohne Umrechnung',
  rate: 'Gespeicherter Wechselkurs',
  missing: 'Wechselkurs fehlt',
  'not-evaluated': 'Umrechnung nicht angewendet',
};
const RANGES = ['1M', '6M', '1J', 'Max'] as const;
type Range = (typeof RANGES)[number];

/** One snapshot feeds the chart and the visible end-position/basis; form dates remain separate. */
export function useInstrumentHistory(securityId: string, asOf: string | undefined, period: Period) {
  const [range, setRange] = useState<Range | null>(null);
  const window = asOf ? periodWindow(period, asOf) : undefined;
  const to = window?.to;
  const month =
    to && range && range !== 'Max'
      ? addMonths(to.slice(0, 7), -{ '1M': 1, '6M': 6, '1J': 12 }[range])
      : undefined;
  const rangeFrom =
    month && to
      ? `${month}-${to.slice(8, 10)}` > lastDayOfMonth(month)
        ? lastDayOfMonth(month)
        : `${month}-${to.slice(8, 10)}`
      : undefined;
  const from =
    range === 'Max' || (range === null && period === 'Alles')
      ? undefined
      : (rangeFrom ?? window?.from);
  const query = useQuery(instrumentHistoryQuery(securityId, from, to));
  return { range, setRange, from, to, query };
}
export type InstrumentHistoryController = ReturnType<typeof useInstrumentHistory>;

export function PriceHistory({
  securityId,
  controller,
}: {
  securityId: string;
  controller: InstrumentHistoryController;
}) {
  useAmountPrivacy();
  const [mode, setMode] = useState<'value' | 'price'>('value');
  const [frame, width] = useElementWidth<HTMLDivElement>();
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'security-prices', securityId],
    retry: false,
    queryFn: () =>
      request<{ securityId: string; currency: string; prices: PriceRow[] }>(
        'GET',
        `/api/securities/${encodeURIComponent(securityId)}/prices`,
      ),
  });
  const history = controller.query.isError ? undefined : controller.query.data?.history;
  const from = mode === 'price' ? controller.from : (history?.from ?? controller.from);
  const to =
    history?.to ??
    controller.to ??
    (mode === 'price' ? query.data?.prices.at(-1)?.date : undefined);
  const prices =
    query.data?.prices.filter((p) => (!from || p.date >= from) && (!to || p.date <= to)) ?? [];
  return (
    <section className="price-history" aria-labelledby="price-history-title">
      <h3 id="price-history-title">Wert und Kurs</h3>
      <div className="price-history-ranges" role="group" aria-label="Darstellung des Instruments">
        <Button variant="ghost" aria-pressed={mode === 'value'} onClick={() => setMode('value')}>
          Wert €
        </Button>
        <Button variant="ghost" aria-pressed={mode === 'price'} onClick={() => setMode('price')}>
          Kurs
        </Button>
      </div>
      <div
        className="price-history-ranges"
        role="group"
        aria-label="Zeitraum des Instrumentverlaufs"
      >
        <Button
          variant="ghost"
          aria-pressed={controller.range === null}
          onClick={() => controller.setRange(null)}
        >
          Portfolio-Zeitraum
        </Button>
        {RANGES.map((range) => (
          <Button
            key={range}
            variant="ghost"
            aria-pressed={controller.range === range}
            onClick={() => controller.setRange(range)}
          >
            {range}
          </Button>
        ))}
      </div>
      {to && (
        <p className="vnote">
          {from ? `${longDay(from)} bis ` : 'Gesamte gespeicherte Historie bis '}
          {longDay(to)} ·{' '}
          {mode === 'value'
            ? 'Wert aller Kontobestände in EUR, ohne Kassa'
            : `Gespeicherter Kurs je Stück in ${query.data?.currency ?? 'Kurswährung'}`}
        </p>
      )}
      {controller.query.isPending && <LoadingNote what="Wertverlauf" />}
      {controller.query.isError && (
        <ErrorNote
          what="Wertverlauf"
          error={controller.query.error}
          onRetry={() => void controller.query.refetch()}
        />
      )}
      {controller.query.isFetching && !controller.query.isPending && (
        <p className="vnote" role="status">
          Wertverlauf und Stichtagsbestand werden gemeinsam aktualisiert.
        </p>
      )}
      {history?.unavailable && (
        <p className="vnote" role="status">
          Wertverlauf nicht verfügbar:{' '}
          {history.unavailable === 'missing_fx'
            ? 'Ein Wechselkurs fehlt.'
            : 'Der darstellbare Zahlenbereich wird überschritten.'}{' '}
          Gespeicherte Kurse bleiben separat verfügbar.
        </p>
      )}
      {mode === 'price' && query.isPending && <LoadingNote what="Kursverlauf" />}
      {mode === 'price' && query.isError && (
        <ErrorNote what="Kursverlauf" error={query.error} onRetry={() => void query.refetch()} />
      )}
      <div ref={frame} className="instrument-history-frame">
        {width > 100 &&
          to &&
          ((mode === 'value' && history && !history.unavailable && history.points.length > 0) ||
            (mode === 'price' && query.isSuccess && prices.length > 0)) && (
            <Drawing
              mode={mode}
              width={width}
              prices={prices}
              history={history}
              from={from ?? prices[0]?.date ?? to}
              to={to}
            />
          )}
      </div>
      {mode === 'value' && history && (
        <p className="vnote">
          Täglich gerundete EUR-Kontopositionen, keine Multiplikation gerundeter Gesamtstücke mit
          einem Anzeigekurs.{' '}
          {history.unavailable || history.position?.costCents == null ? (
            'Für diesen Verlauf wird keine Einstandslinie angezeigt.'
          ) : (
            <>
              Gestrichelt: dokumentierter Stichtag-Einstand vom {longDay(history.to)} (
              {history.costMethod === 'fifo' ? 'FIFO' : 'gleitender Durchschnitt'}), kein
              historischer Einstandsverlauf.
            </>
          )}{' '}
          Fehlende Werte unterbrechen die Linie; Tagesquelle und Qualität stehen in der Inspektion.
        </p>
      )}
      {mode === 'price' && query.isSuccess && prices.length === 0 && (
        <p className="vnote">Keine gespeicherten Kurse im Zeitraum.</p>
      )}
      <p className="vnote">
        Käufe und Verkäufe stehen am tatsächlichen Handelsdatum. Ereignisse ohne Bewertung
        erscheinen am unteren Rand und sind keine Wertpunkte.
      </p>
    </section>
  );
}

function Drawing({
  mode,
  width,
  prices,
  history,
  from,
  to,
}: {
  mode: 'value' | 'price';
  width: number;
  prices: PriceRow[];
  history: InstrumentHistory | undefined;
  from: string;
  to: string;
}) {
  useAmountPrivacy();
  const height = 280,
    left = 64,
    right = 16,
    top = 20,
    bottom = 232;
  const rows =
    mode === 'value'
      ? (history?.points ?? []).map((p) => ({ date: p.date, value: p.valueCents }))
      : prices.map((p) => ({ date: p.date, value: p.priceMicro }));
  const basis =
    mode === 'value' && !history?.unavailable ? (history?.position?.costCents ?? null) : null;
  const known = rows.flatMap((p) => (p.value === null ? [] : [p.value]));
  if (basis !== null) known.push(basis);
  const lo = mode === 'price' && known.length ? Math.min(...known) : Math.min(0, ...known);
  const hi = mode === 'price' && known.length ? Math.max(...known) : Math.max(0, ...known);
  const pad = (hi - lo) * 0.08 || (mode === 'price' ? Math.max(Math.abs(hi) * 0.02, 1) : 1);
  const ticks = [...new Set([lo, hi])];
  const valueAxis = euroAxis(ticks.map((value) => value / 100));
  const day = (date: string) => Date.parse(`${date}T00:00:00Z`);
  const duration = day(to) - day(from);
  const x = (date: string) =>
    left + (duration === 0 ? 0.5 : (day(date) - day(from)) / duration) * (width - left - right);
  const y = (value: number) => bottom - ((value - lo + pad) / (hi - lo + pad * 2)) * (bottom - top);
  const byDate = new Map(rows.map((p) => [p.date, p]));
  const facts = new Map(history?.points.map((p) => [p.date, p]));
  const events = (history?.events ?? []).filter(
    (e) => (e.kind === 'buy' || e.kind === 'sell') && e.date >= from && e.date <= to,
  );
  const dates = [...new Set([...rows.map((p) => p.date), ...events.map((e) => e.date)])].sort();
  const quotes = new Map(prices.map((p) => [p.date, p]));
  const points = dates.map((date) => {
    const fact = facts.get(date),
      quote = quotes.get(date);
    return {
      x: x(date),
      date,
      series: [
        {
          name: mode === 'value' ? 'Wert in EUR' : 'Kurs je Stück',
          value:
            mode === 'value'
              ? fact?.valueCents === null || !fact
                ? 'Nicht verfügbar'
                : eur(fact.valueCents)
              : quote
                ? quoteText(quote)
                : 'Kein gespeicherter Kurs an diesem Tag',
        },
        ...(mode === 'value' && fact
          ? [
              { name: 'Stück', value: unitsText(fact.unitsE8) },
              {
                name: 'Bewertung',
                value:
                  fact.quality === 'exact'
                    ? 'Bekannt'
                    : fact.quality === 'stale'
                      ? 'Kurs veraltet'
                      : fact.quality === 'estimated'
                        ? 'Geschätzt'
                        : 'Fehlend',
              },
              ...fact.observations.map((source) => ({
                name: maskMoneyText(
                  `Tagesquelle · ${history?.position?.accounts.find((a) => a.accountId === source.accountId)?.name ?? 'Konto ohne Stichtagsbestand'}`,
                ),
                value: `${SOURCE_LABELS[source.kind]} · ${source.date ?? 'ohne Kursdatum'} · ${source.currency ?? 'Währung unbekannt'}${source.lookAhead ? ' · spätere Ausführung als Bewertungsquelle' : ''} · ${FX_LABELS[source.fx.kind]}${source.fx.kind === 'rate' ? ` ${source.fx.date}` : ''}`,
              })),
            ]
          : []),
        ...(basis !== null
          ? [{ name: `Stichtag-Einstand ${history!.to}`, value: eur(basis) }]
          : []),
        ...events
          .filter((e) => e.date === date)
          .map((e) => ({
            name: TRADE_LABELS[e.kind],
            value: `${unitsText(e.unitsE8)} Stück · ${sourceMoney(e.amountCents, e.currency)}`,
          })),
      ],
    };
  });
  const segments: Array<Array<[number, number]>> = [[]];
  for (const row of rows) {
    if (row.value === null) segments.push([]);
    else segments[segments.length - 1]!.push([x(row.date), y(row.value)]);
  }
  return (
    <ChartSvg
      width={width}
      height={height}
      testId={mode === 'value' ? 'instrument-value-chart' : 'price-history-chart'}
      label={
        mode === 'value'
          ? 'Täglicher Instrumentwert in EUR und dokumentierter Stichtag-Einstand'
          : `Gespeicherter Kurs je Stück in ${prices[0]?.currency ?? 'Kurswährung'}`
      }
      points={points}
      table
    >
      {mode === 'value' && (
        <text x={left} y={12} className="svg-label">
          Wert · {valueAxis.unit}
        </text>
      )}
      <Graticule
        x1={left}
        x2={width - right}
        lines={ticks.map((v) => ({
          y: y(v),
          label:
            mode === 'value'
              ? valueAxis.label(v / 100)
              : quoteText(prices[0] ? { ...prices[0], priceMicro: v } : null),
        }))}
      />
      <AxisLine x1={left} x2={width - right} y={mode === 'price' ? bottom : y(0)} />
      {segments
        .filter((segment) => segment.length > 0)
        .map((segment, i) => (
          <g key={i}>
            <Line kind="actual" points={segment} />
            {segment.length === 1 && (
              <circle cx={segment[0]![0]} cy={segment[0]![1]} r={3} className="dot-actual" />
            )}
          </g>
        ))}
      {basis !== null && (
        <line
          x1={left}
          x2={width - right}
          y1={y(basis)}
          y2={y(basis)}
          className="instrument-cost-line"
        />
      )}
      {mode === 'price' &&
        prices.map((quote) => (
          <circle
            key={quote.date}
            data-chart-point={dates.indexOf(quote.date)}
            cx={x(quote.date)}
            cy={y(quote.priceMicro)}
            r={prices.length === 1 ? 3 : 1.5}
            fill="var(--line)"
          />
        ))}
      {[...new Set(events.map((e) => e.date))].map((date) => (
        <g key={date} data-trade-date={date}>
          <circle
            cx={x(date)}
            cy={
              byDate.get(date)?.value === null || byDate.get(date)?.value === undefined
                ? bottom
                : y(byDate.get(date)!.value!)
            }
            r={4}
            className="instrument-trade-marker"
          />
        </g>
      ))}
      <text x={left} y={height - 8} className="svg-label" textAnchor="start">
        {longDay(from)}
      </text>
      <text x={width - right} y={height - 8} className="svg-label" textAnchor="end">
        {longDay(to)}
      </text>
    </ChartSvg>
  );
}
