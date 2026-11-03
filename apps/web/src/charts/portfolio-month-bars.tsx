import { ChartSvg, Graticule, privateAmount, useAmountPrivacy } from '@budget/ui';
import { sourceMoney } from '../wealth/trade-api';
import { useElementWidth } from './use-element-width';

/** Stacked drawing coordinates only; tooltip and equivalent tables retain source-currency cents. */
export function PortfolioMonthBars({
  currency,
  rows,
  names,
  future = false,
  testId,
}: {
  currency: string;
  rows: { month: string; values: number[] }[];
  names: string[];
  future?: boolean;
  testId: string;
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>({ retainPositive: true });
  const max = Math.max(
    1,
    ...rows.map((row) => row.values.reduce((sum, value) => sum + value / 100, 0)),
  );
  const y = (value: number) => 142 - (value / max) * 120;
  const slot = Math.max(1, width - 70) / Math.max(1, rows.length);
  const x = (index: number) => 56 + slot * (index + 0.5);
  const colors = future ? ['var(--future)', 'var(--ink-3)'] : ['var(--line)', 'var(--ink-2)'];
  return (
    <div ref={ref}>
      {width > 0 && (
        <ChartSvg
          width={width}
          height={180}
          label={`${names.join(' und ')} pro Monat · ${currency}`}
          testId={testId}
          points={rows.map((row, index) => ({
            date: row.month,
            x: x(index),
            series: row.values.map((amount, series) => ({
              name: names[series]!,
              value: sourceMoney(amount, currency),
              color: colors[series % colors.length]!,
            })),
          }))}
        >
          <Graticule
            x1={56}
            x2={width - 14}
            lines={[0, max / 2, max].map((value) => ({
              y: y(value),
              label: privateAmount(
                new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(value),
              ),
            }))}
          />
          {rows.map((row, index) => {
            let offset = 0;
            return (
              <g key={row.month}>
                {row.values.map((amount, series) => {
                  const base = offset;
                  offset += amount / 100;
                  return (
                    <rect
                      key={series}
                      x={x(index) - Math.min(20, slot * 0.6) / 2}
                      y={y(offset)}
                      width={Math.min(20, slot * 0.6)}
                      height={Math.max(0, y(base) - y(offset))}
                      fill={colors[series % colors.length]}
                    />
                  );
                })}
                {(slot >= 30 || index % Math.ceil(30 / slot) === 0) && (
                  <text x={x(index)} y={169} textAnchor="middle" className="svg-label">
                    {row.month.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </ChartSvg>
      )}
      <ul className="portfolio-income-legend">
        {names.map((name, index) => (
          <li key={name}>
            <i aria-hidden="true" style={{ background: colors[index % colors.length] }} />
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
