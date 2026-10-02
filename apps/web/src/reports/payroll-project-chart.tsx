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
}: {
  months: string[];
  values: (number | null)[];
  gross?: (number | null)[];
}) {
  const [ref, measuredWidth] = useElementWidth<HTMLDivElement>();
  const width = Math.max(260, measuredWidth),
    height = 240,
    left = 72,
    bottom = 208;
  const known = [...values, ...(gross ?? [])].filter((v): v is number => v !== null);
  const y = scaleLinear()
    .domain([Math.min(0, ...known), Math.max(1, ...known)])
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
      <svg
        className="pp-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          gross
            ? 'Brutto und Auszahlung laufend je Monat; fehlende Werte unterbrechen die Linie.'
            : 'Projektergebnis je Monat, Balken über und unter Null.'
        }
      >
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={left} x2={width - 12} y1={y(t)} y2={y(t)} className="pp-grid" />
            <text x={left - 8} y={y(t) + 4} textAnchor="end">
              {new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 }).format(t / 100)}
            </text>
          </g>
        ))}
        {gross ? (
          <>
            <path d={path(gross) ?? ''} className="pp-gross" />
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
            <text key={m} x={x(i)} y={230} textAnchor="middle">
              {shortMonth(m)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
