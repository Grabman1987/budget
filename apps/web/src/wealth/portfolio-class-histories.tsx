import type { PortfolioPerformanceHistory } from '@budget/db';
import { ChartSvg, Line, privateAmount, useAmountPrivacy, type Point } from '@budget/ui';
import { useElementWidth } from '../charts/use-element-width';
import { chartPoints } from '../charts/tooltip-data';
import { longDay } from '../ledger/format';
import { performanceDecimal } from '../pages/performance-chart';
import { portfolioIndexAxis } from './networth-model';

type History = Pick<PortfolioPerformanceHistory, 'index' | 'classes'>;
const indexText = (value: number | null | undefined) =>
  value == null ? 'Nicht verfügbar' : privateAmount(performanceDecimal(value));

/** Monthly class TTWROR from the already selected report window; never EUR attribution. */
export function PortfolioClassHistories({ history }: { history: History }) {
  useAmountPrivacy();
  const axis = portfolioIndexAxis([
    100,
    ...history.classes.flatMap((cls) =>
      cls.index.flatMap((point) => (point.portfolio === null ? [] : [point.portfolio])),
    ),
  ]);
  return (
    <section className="portfolio-class-histories" aria-labelledby="portfolio-class-history-title">
      <h2 id="portfolio-class-history-title">Anlageklassen im Verlauf</h2>
      <p className="vnote">
        Monatliche TTWROR · Indexbasis 100 · gemeinsame Zeit- und Indexskala. Start, Monatsenden und
        letzter Teilmonat im gewählten Zeitraum; Lücken bleiben offen. Klassenzuordnung am
        Bewertungstag, einschließlich verkaufter Positionen. Keine addierbaren Eurobeträge.
      </p>
      <div className="portfolio-class-history-grid">
        {history.classes.map((cls) => (
          <ClassHistory
            key={cls.assetClassId ?? 'unclassified'}
            cls={cls}
            rows={history.index}
            axis={axis}
          />
        ))}
      </div>
      {history.classes.length > 0 && history.index.length > 0 ? (
        <details className="wealth-details">
          <summary>Klassenverläufe als Tabelle</summary>
          <div
            className="wealth-table-scroll"
            role="region"
            aria-label="Monatliche Klassenindexwerte"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users scroll the full monthly class table.
            tabIndex={0}
          >
            <table className="wealth-trades" data-testid="portfolio-class-history-table">
              <caption>
                TTWROR-Index je Anlageklasse · Nicht verfügbar = Bewertungslücke oder ohne Kapital
              </caption>
              <thead>
                <tr>
                  <th scope="col">Bewertungsdatum</th>
                  {history.classes.map((cls) => (
                    <th scope="col" key={cls.assetClassId ?? 'unclassified'}>
                      {cls.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.index.map((point) => (
                  <tr key={point.date}>
                    <th scope="row">{longDay(point.date)}</th>
                    {history.classes.map((cls) => (
                      <td className="num" key={cls.assetClassId ?? 'unclassified'}>
                        {indexText(cls.index.find((entry) => entry.date === point.date)?.portfolio)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : (
        <p className="vnote">Noch keine Klassenhistorie für diesen Zeitraum.</p>
      )}
    </section>
  );
}

function ClassHistory({
  cls,
  rows,
  axis,
}: {
  cls: History['classes'][number];
  rows: History['index'];
  axis: ReturnType<typeof portfolioIndexAxis>;
}) {
  useAmountPrivacy();
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const width = measured || 300;
  const height = 96,
    left = 4,
    right = width - 4,
    top = 6,
    bottom = height - 24;
  const first = Date.parse(rows[0]?.date ?? '1970-01-01');
  const span = Math.max(1, Date.parse(rows.at(-1)?.date ?? '1970-01-01') - first);
  const x = (date: string) => left + ((Date.parse(date) - first) / span) * (right - left);
  const y = (value: number) => top + ((axis.max - value) / (axis.max - axis.min)) * (bottom - top);
  const byDate = new Map(cls.index.map((point) => [point.date, point.portfolio]));
  const values = rows.map((row) => byDate.get(row.date) ?? null);
  const segments: Point[][] = [[]];
  values.forEach((value, i) => {
    if (value === null) segments.push([]);
    else segments.at(-1)!.push([x(rows[i]!.date), y(value)]);
  });
  return (
    <figure className="portfolio-class-history" data-testid="portfolio-class-history">
      <figcaption>
        <h3>{cls.name}</h3>
        <span>Letzter Index: {indexText(values.at(-1))}</span>
      </figcaption>
      <div ref={ref}>
        {rows.length > 0 && (
          <ChartSvg
            width={width}
            height={height}
            label={`${cls.name}: monatliche Klassenentwicklung, TTWROR-Indexbasis 100`}
            testId="portfolio-class-history-chart"
            tooltipNote="Monatliche, zeitgewichtete Entwicklung je Klasse; Kurs- oder Kapitallücken bleiben offen."
            points={chartPoints(
              rows.map((row) => row.date),
              (i) => x(rows[i]!.date),
              [{ name: cls.name, values, format: indexText }],
            )}
          >
            <line x1={left} x2={right} y1={y(100)} y2={y(100)} className="graticule" />
            <g className="portfolio-class-history-line">
              {segments
                .filter((segment) => segment.length > 0)
                .map((segment, i) =>
                  segment.length > 1 ? (
                    <Line key={i} points={segment} kind="actual" draw={false} />
                  ) : (
                    <circle
                      key={i}
                      cx={segment[0]![0]}
                      cy={segment[0]![1]}
                      r={3}
                      fill="var(--line)"
                    />
                  ),
                )}
            </g>
            <text x={left} y={height - 4} className="svg-label">
              {longDay(rows[0]!.date)}
            </text>
            {rows.length > 1 && (
              <text x={right} y={height - 4} textAnchor="end" className="svg-label">
                {longDay(rows.at(-1)!.date)}
              </text>
            )}
          </ChartSvg>
        )}
      </div>
    </figure>
  );
}
