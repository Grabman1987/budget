import { addMonths, lastDayOfMonth, type categoryTrend, type SpendClass } from '@budget/domain';
import {
  AxisLine,
  ChartSvg,
  ClassPatterns,
  Graticule,
  patternFill,
  usePatternPrefix,
  useAmountPrivacy,
  XTicks,
} from '@budget/ui';
import { useElementWidth } from '../charts/use-element-width';
import { chartPoints } from '../charts/tooltip-data';
import { eur } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import { kfmt, yTicks } from '../wealth/networth-model';
import { monthLong, monthShort } from './table-format';

export const categoryMonthSearch = (id: string, month: string) => ({
  kategorie: id,
  von: `${month}-01`,
  bis: lastDayOfMonth(month),
  basis: 'category-spending',
});

type Series = {
  category: { id: string; name: string; class?: SpendClass };
  points: ReturnType<typeof categoryTrend>;
};
const INKS = ['var(--line)', 'var(--line-2)', 'var(--ink-3)'];

/** One scale for the selected categories; missing months interrupt the line and stay blank. */
export function CategoryTrend({ series, previous }: { series: Series[]; previous: boolean }) {
  useAmountPrivacy();
  const prefix = usePatternPrefix('category-trend');
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const months = series[0]?.points.map((p) => p.month) ?? [];
  const values = series
    .flatMap((s) =>
      s.points.flatMap((p) => [
        p.spentCents,
        ...(series.length === 1 ? [p.assignedCents] : []),
        ...(previous ? [p.previousCents] : []),
      ]),
    )
    .filter((v): v is number => v !== null);
  const lo = Math.min(0, ...values) / 100;
  const hi = Math.max(100, ...values) / 100;
  const x = (i: number) => 48 + ((i + 0.5) * (width - 60)) / Math.max(1, months.length);
  const y = (v: number) => 192 - ((v / 100 - lo) / (hi - lo)) * 176;
  const path = (points: Series['points'], key: 'spentCents' | 'previousCents') =>
    points
      .map((p, i) =>
        p[key] === null
          ? ''
          : `${i === 0 || points[i - 1]?.[key] === null ? 'M' : 'L'}${x(i)},${y(p[key])}`,
      )
      .join(' ');
  const labelStep = Math.max(
    1,
    Math.ceil(months.length / Math.max(1, Math.floor((width - 60) / 65))),
  );
  return (
    <>
      <div ref={ref} className="tr-chart">
        {width > 60 && (
          <ChartSvg
            width={width}
            height={224}
            label="Kategorietrend"
            testId="category-trend-chart"
            role="group"
            points={chartPoints(
              months,
              x,
              series.flatMap((s, i) => [
                {
                  name: s.category.name,
                  values: s.points.map((p) => p.spentCents),
                  color: INKS[i % INKS.length]!,
                },
                ...(series.length === 1
                  ? [
                      {
                        name: 'Plan (zugeteilt)',
                        values: s.points.map((p) => p.assignedCents),
                        color: 'var(--line-2)',
                      },
                    ]
                  : []),
                ...(previous
                  ? [
                      {
                        name: `${s.category.name} · Vorjahresmonat`,
                        values: s.points.map((p) => p.previousCents),
                        color: INKS[i % INKS.length]!,
                      },
                    ]
                  : []),
              ]),
            )}
          >
            <ClassPatterns prefix={prefix} />
            <Graticule
              x1={48}
              x2={width - 12}
              lines={yTicks(lo, hi, 3).map((v) => ({ y: y(v * 100), label: kfmt(v) }))}
            />
            <AxisLine x1={48} x2={width - 12} y={y(0)} />
            {series.map((s, i) => (
              <g key={s.category.id} style={{ color: INKS[i % INKS.length] }}>
                {series.length > 1 && (
                  <path d={path(s.points, 'spentCents')} className="l-actual category-trend-line" />
                )}
                {series.length === 1 &&
                  s.points.map((p, j) =>
                    p.spentCents === null ? null : (
                      <rect
                        key={`${p.month}-bar`}
                        x={x(j) - ((width - 60) / months.length) * 0.28}
                        y={Math.min(y(0), y(p.spentCents))}
                        width={((width - 60) / months.length) * 0.56}
                        height={Math.abs(y(0) - y(p.spentCents))}
                        fill={
                          s.category.class === 'want' || s.category.class === 'future'
                            ? patternFill(prefix, s.category.class)
                            : 'var(--need)'
                        }
                        stroke="currentColor"
                      />
                    ),
                  )}
                {series.length === 1 &&
                  s.points.map((p, j) =>
                    p.assignedCents === null ? null : (
                      <line
                        key={`${p.month}-plan`}
                        x1={x(j) - ((width - 60) / months.length) * 0.4}
                        x2={x(j) + ((width - 60) / months.length) * 0.4}
                        y1={y(p.assignedCents)}
                        y2={y(p.assignedCents)}
                        className="tr-plan-tick"
                      />
                    ),
                  )}
                {previous && (
                  <path
                    d={path(s.points, 'previousCents')}
                    className="l-prev category-trend-line"
                  />
                )}
                {s.points.map((p, j) =>
                  p.spentCents === null ? null : (
                    <a
                      href={`/konten/buchungen?${new URLSearchParams(categoryMonthSearch(s.category.id, p.month))}`}
                      key={p.month}
                      aria-label={`${s.category.name} · ${monthLong(p.month)} · ${eur(p.spentCents)}`}
                    >
                      <circle cx={x(j)} cy={y(p.spentCents)} r={22} fill="transparent" />
                      <circle
                        key={p.month}
                        cx={x(j)}
                        cy={y(p.spentCents)}
                        r={3}
                        fill="currentColor"
                      />
                    </a>
                  ),
                )}
                {previous &&
                  s.points.map((p, j) =>
                    p.previousCents === null ? null : (
                      <circle
                        key={p.month}
                        cx={x(j)}
                        cy={y(p.previousCents)}
                        r={3}
                        fill="var(--surface)"
                        stroke="currentColor"
                        pointerEvents="none"
                      />
                    ),
                  )}
              </g>
            ))}
            <XTicks
              y={216}
              ticks={months.flatMap((month, i) =>
                i % labelStep === 0 ? [{ x: x(i), label: monthShort(month, true) }] : [],
              )}
            />
          </ChartSvg>
        )}
      </div>
      <ul className="chart-legend">
        {series.map((s, i) => (
          <li key={s.category.id}>
            <svg aria-hidden="true" viewBox="0 0 32 8" className="legend-tick">
              <path
                d="M0 4H32"
                className="l-actual category-trend-line"
                style={{ color: INKS[i % INKS.length] }}
              />
            </svg>
            {s.category.name}
          </li>
        ))}
        {previous && (
          <li>
            <svg aria-hidden="true" viewBox="0 0 32 8" className="legend-tick">
              <path d="M0 4H32" className="l-prev" />
            </svg>
            Vorjahresmonat
          </li>
        )}
        {series.length === 1 && (
          <li>
            <svg aria-hidden="true" viewBox="0 0 32 8" className="legend-tick">
              <line x1={0} x2={32} y1={4} y2={4} className="tr-plan-tick" />
            </svg>
            Plan (zugeteilt)
          </li>
        )}
      </ul>
      <div
        className="rscroll"
        role="region"
        aria-label="Monatswerte des Kategorietrends"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the values.
        tabIndex={0}
      >
        <table className="rtable category-trend-values">
          <caption className="sr-only">Monatswerte · Buchungen öffnen</caption>
          <thead>
            <tr>
              <th scope="col">Monat</th>
              {series.map((s) => (
                <th scope="col" key={s.category.id}>
                  {s.category.name}
                  {previous && <small>Ist / Vorjahresmonat</small>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((month, i) => (
              <tr key={month}>
                <th scope="row">{monthLong(month)}</th>
                {series.map((s) => {
                  const p = s.points[i]!;
                  const value = (amount: number | null, target: string) =>
                    amount === null ? (
                      <span>–</span>
                    ) : (
                      <AppLink
                        className="category-month-link"
                        to="/konten/buchungen"
                        search={categoryMonthSearch(s.category.id, target)}
                        aria-label={`${s.category.name} · ${monthLong(target)} · ${eur(amount)}`}
                      >
                        {eur(amount)}
                      </AppLink>
                    );
                  return (
                    <td key={s.category.id}>
                      {value(p.spentCents, month)}
                      {previous && <div>{value(p.previousCents, addMonths(month, -12))}</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
