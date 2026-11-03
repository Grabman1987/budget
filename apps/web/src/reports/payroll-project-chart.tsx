import { ChartSvg, privateAmount, useAmountPrivacy } from '@budget/ui';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { chartPoints } from '../charts/tooltip-data';
import { useElementWidth } from '../charts/use-element-width';
import { scaleLinear } from 'd3-scale';
import { line, curveStepAfter } from 'd3-shape';
import { eur } from '../ledger/format';
import { shortMonth } from './month-frame';

/** Blueprint ink lines for salary history; signed bars for each project's monthly result. */
export function PayrollProjectChart({
  months,
  values,
  gross,
  focusSalary = false,
  height = 240,
  table = false,
}: {
  months: string[];
  values: (number | null)[];
  gross?: (number | null)[];
  focusSalary?: boolean;
  height?: number;
  table?: boolean;
}) {
  useAmountPrivacy();
  const [ref, measuredWidth] = useElementWidth<HTMLDivElement>();
  const width = focusSalary ? Math.max(1, measuredWidth || 260) : Math.max(260, measuredWidth);
  const left = 72,
    bottom = height - 32;
  const known = [...values, ...(focusSalary ? [] : (gross ?? []))].filter(
    (v): v is number => v !== null,
  );
  const low = known.length ? Math.min(...known) : 0;
  const high = known.length ? Math.max(...known) : 1;
  const pad = Math.max(high - low, Math.abs(high) * 0.05, 1) * 0.1;
  const y = scaleLinear()
    .domain(focusSalary ? [low - pad, high + pad] : [Math.min(0, ...known), Math.max(1, ...known)])
    .nice()
    .range([bottom, 16]);
  const x = scaleLinear()
    .domain([0, Math.max(1, months.length - 1)])
    .range([left, width - 20]);
  const path = line<number | null>()
    .defined((v) => v !== null)
    .x((_v, i) => x(i))
    .y((v) => y(v ?? 0))
    .curve(curveStepAfter);
  return (
    <div ref={ref}>
      <ChartSvg
        table={table}
        className="pp-chart"
        width={width}
        height={height}
        points={chartPoints(
          months,
          x,
          gross && focusSalary
            ? [{ name: 'Nettogehalt ohne steuerfreie Erstattungen', values }]
            : gross
              ? [
                  { name: 'Brutto', values: gross, color: 'var(--line-2)' },
                  { name: 'Netto', values },
                ]
              : [{ name: 'Projektergebnis', values, negativeColor: 'var(--ink-2)' }],
        )}
        label={
          gross && focusSalary
            ? 'Laufendes Nettogehalt ohne steuerfreie Erstattungen; fehlende Werte unterbrechen die Linie.'
            : gross
              ? 'Brutto und Nettogehalt ohne steuerfreie Erstattungen laufend je Monat; fehlende Werte unterbrechen die Linie.'
              : 'Projektergebnis je Monat, Balken über und unter Null.'
        }
      >
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={left} x2={width - 12} y1={y(t)} y2={y(t)} className="pp-grid" />
            <text x={left - 8} y={y(t) + 4} textAnchor="end">
              {REDESIGN_ENABLED
                ? privateAmount(
                    new Intl.NumberFormat('de-AT', {
                      maximumFractionDigits: focusSalary && high - low < 100 ? 2 : 0,
                    })
                      .format(t / 100)
                      .replace('-', '−'),
                  )
                : new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 }).format(t / 100)}
            </text>
          </g>
        ))}
        {gross ? (
          <>
            {!focusSalary && <path d={path(gross) ?? ''} className="pp-gross" />}
            <path d={path(values) ?? ''} className="pp-net" />
            {values.map((v, i) =>
              v === null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r={3} className="pp-dot">
                  <title>
                    {months[i]}: {eur(v)}
                  </title>
                </circle>
              ),
            )}
          </>
        ) : (
          values.map((v, i) =>
            v === null ? null : (
              <rect
                key={i}
                x={x(i) - 7}
                width={14}
                y={Math.min(y(0), y(v))}
                height={Math.max(1, Math.abs(y(v) - y(0)))}
                className={v < 0 ? 'pp-negative' : 'pp-positive'}
              >
                <title>
                  {months[i]}: {eur(v, { sign: true })}
                </title>
              </rect>
            ),
          )
        )}
        {months.map((m, i) =>
          i % Math.max(1, Math.ceil(months.length / (width < 400 ? 3 : 6))) === 0 ? (
            <text key={m} x={x(i)} y={height - 10} textAnchor="middle">
              {shortMonth(m)}
            </text>
          ) : null,
        )}
      </ChartSvg>
    </div>
  );
}
