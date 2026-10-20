import { tableRowAverage, type ExplorerTemplateModel } from '@budget/domain';
import { AxisLine, ChartSvg, Graticule, Line, XTicks, useAmountPrivacy } from '@budget/ui';
import { chartPoints } from '../charts/tooltip-data';
import { useElementWidth } from '../charts/use-element-width';
import { eur } from '../ledger/format';
import { kfmt, yTicks } from '../wealth/networth-model';
import { monthShort } from './table-format';

/** The owner-defined single-category line, independent of the future generic chart toggle. */
export function ExplorerTemplateTrend({ model }: { model: ExplorerTemplateModel }) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const row = model.rows[0];
  if (!row) return null;
  const values = row.vals.filter((value): value is number => value !== null);
  const average = tableRowAverage(row);
  const low = Math.min(0, ...values) / 100;
  const high = Math.max(1, ...values) / 100;
  const x = (index: number) =>
    48 + ((index + 0.5) * (width - 60)) / Math.max(model.months.length, 1);
  const y = (value: number) => 192 - ((value / 100 - low) / (high - low)) * 176;
  const segments: Array<Array<[number, number]>> = [];
  let segment: Array<[number, number]> = [];
  row.vals.forEach((value, index) => {
    if (value === null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push([x(index), y(value)]);
  });
  if (segment.length) segments.push(segment);
  const step = Math.max(
    1,
    Math.ceil(model.months.length / Math.max(1, Math.floor((width - 60) / 65))),
  );
  return (
    <div className="ex-template-trend" ref={ref}>
      <p>
        {row.label} · Ø je Monat: <strong>{average === null ? '–' : eur(average)}</strong>
      </p>
      {width > 60 && values.length > 0 && (
        <ChartSvg
          width={width}
          height={224}
          label={`${row.label}: Monatsausgaben; Ø je Monat ${average === null ? '–' : eur(average)}`}
          points={chartPoints(model.months, x, [
            { name: row.label, values: row.vals, color: 'var(--line)' },
            { name: 'Ø je Monat', values: model.months.map(() => average), color: 'var(--line-2)' },
          ])}
        >
          <Graticule
            x1={48}
            x2={width - 12}
            lines={yTicks(low, high, 3).map((value) => ({ y: y(value * 100), label: kfmt(value) }))}
          />
          <AxisLine x1={48} x2={width - 12} y={y(0)} />
          {segments.map((points, index) => (
            <Line key={index} points={points} kind="actual" draw={false} />
          ))}
          {average !== null && (
            <Line
              points={[
                [48, y(average)],
                [width - 12, y(average)],
              ]}
              kind="benchmark"
              draw={false}
            />
          )}
          {row.vals.map((value, index) =>
            value === null ? null : (
              <circle
                key={model.months[index]}
                cx={x(index)}
                cy={y(value)}
                r={3}
                fill="currentColor"
                data-chart-point={index}
              />
            ),
          )}
          <XTicks
            y={216}
            ticks={model.months.flatMap((month, index) =>
              index % step === 0 ? [{ x: x(index), label: monthShort(month, true) }] : [],
            )}
          />
        </ChartSvg>
      )}
      <p className="ov-note">
        Durchgezogen: Ausgaben. Strichpunktiert: Ø je Monat. Fehlende Monatswerte bleiben Lücken;
        die genauen Werte und ihre Buchungen stehen in der Tabelle.
      </p>
    </div>
  );
}
