import { maskMoneyText, privateAmount, useAmountPrivacy } from '../amount-privacy';
import { chartDate, type ChartTooltipPoint } from './frame';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

/** Use the inspected values verbatim: no scaling, rounding, aggregation or invented gaps. */
export function ChartDataTable({
  label,
  points,
  deferRows = false,
}: {
  label: string;
  points: ReadonlyArray<ChartTooltipPoint>;
  deferRows?: boolean;
}) {
  useAmountPrivacy();
  const [open, setOpen] = useState(false);
  return (
    <details
      className="chart-data-table"
      onToggle={deferRows ? (event) => setOpen(event.currentTarget.open) : undefined}
    >
      <summary>
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
        Tabelle anzeigen
      </summary>
      <div
        className="chart-data-scroll"
        role="region"
        aria-label={maskMoneyText(`${label} – dargestellte Werte`)}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users can scroll wide chart data.
        tabIndex={0}
      >
        <table>
          <caption className="sr-only">{maskMoneyText(label)}</caption>
          <thead>
            <tr>
              <th scope="col">Zeitpunkt / Position</th>
              <th scope="col">Datenreihe</th>
              <th scope="col">Wert</th>
            </tr>
          </thead>
          <tbody>
            {(!deferRows || open) &&
              points.flatMap((point, pointIndex) =>
                point.series.map((series, seriesIndex) => (
                  <tr key={`${pointIndex}-${seriesIndex}`}>
                    <th scope="row">{maskMoneyText(chartDate(point.date))}</th>
                    <td>{maskMoneyText(series.name)}</td>
                    <td className="chart-data-value">{privateAmount(series.value)}</td>
                  </tr>
                )),
              )}
          </tbody>
        </table>
      </div>
    </details>
  );
}
