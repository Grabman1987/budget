import { ChartSvg, useAmountPrivacy } from '@budget/ui';
import { runningNetAverage, type payrollNetComposition } from '@budget/domain';
import { chartPoints } from '../charts/tooltip-data';
import { useElementWidth } from '../charts/use-element-width';
import { eur } from '../ledger/format';
import { shortMonth } from './month-frame';

type Row = ReturnType<typeof payrollNetComposition>;

/**
 * Monthly pay: regular/combined slips solid, separate special slips hatched in the same month.
 * Amounts come from `payrollNetComposition`; tax is never re-allocated between the parts.
 */
export function PayrollNetComposition({ rows, height = 220 }: { rows: Row[]; height?: number }) {
  useAmountPrivacy();
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const width = Math.max(260, measured);
  const left = 56;
  const bottom = height - 28;
  const top = Math.max(1, ...rows.map((r) => r.totalCents ?? 0));
  const y = (v: number) => bottom - (v / top) * (bottom - 14);
  const slot = (width - left - 12) / Math.max(1, rows.length);
  const x = (i: number) => left + (i + 0.5) * slot;
  const bar = Math.max(3, slot * 0.6);
  const average = runningNetAverage(rows);
  const openTasks = rows.filter((r) => r.openMappingSlipIds.length > 0);
  return (
    <div ref={ref} className="pp-net-composition" data-testid="payroll-net-composition">
      <ChartSvg
        className="pp-chart"
        width={width}
        height={height}
        label="Netto je Monat inklusive Sonderzahlungen; Sonderzahlungen schraffiert"
        points={chartPoints(
          rows.map((r) => r.month),
          x,
          [
            { name: 'Regulär / kombiniert', values: rows.map((r) => r.runningCents) },
            {
              name: 'Sonderzahlung · Bonus',
              values: rows.map((r) => (r.recorded ? r.specialCents : null)),
            },
            { name: 'Summe', values: rows.map((r) => r.totalCents), color: 'var(--ink-2)' },
          ],
        )}
      >
        <defs>
          <pattern id="pp-special-hatch" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M0 5 L5 0" className="pp-hatch-line" />
          </pattern>
        </defs>
        {[0, top / 2, top].map((t) => (
          <g key={t}>
            <line x1={left} x2={width - 12} y1={y(t)} y2={y(t)} className="pp-grid" />
            <text x={left - 8} y={y(t) + 4} textAnchor="end">
              {eur(Math.round(t), { cents: false })}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          if (r.totalCents === null) return null;
          const running = r.runningCents ?? 0;
          const special = r.specialCents;
          return (
            <g key={r.month} data-chart-point={i}>
              <rect
                x={x(i) - bar / 2}
                y={y(running)}
                width={bar}
                height={Math.max(0, y(0) - y(running))}
                className="pp-running"
              />
              {special > 0 && (
                <rect
                  x={x(i) - bar / 2}
                  y={y(running + special)}
                  width={bar}
                  height={Math.max(1, y(running) - y(running + special))}
                  fill="url(#pp-special-hatch)"
                  className="pp-special"
                />
              )}
            </g>
          );
        })}
        {rows.map((r, i) =>
          i % Math.max(1, Math.ceil(rows.length / (width < 400 ? 3 : 6))) === 0 ? (
            <text key={r.month} x={x(i)} y={height - 8} textAnchor="middle">
              {shortMonth(r.month)}
            </text>
          ) : null,
        )}
      </ChartSvg>
      <p className="r9-meta" data-testid="payroll-net-legend">
        Jeder Monat zeigt sein volles Netto inklusive Sonderzahlungen (Summe). Säule voll: regulärer
        oder kombinierter Zettel · schraffiert: eigener Sonderzahlungs-Zettel desselben Monats.
        Kombinierte Zettel bleiben ungeteilt; ihr Netto ist kein vergleichbares laufendes
        Monatsnetto. Telearbeit und Fahrgeld zählen als Gehalt, Reisespesen sind ausgenommen.
      </p>
      <p className="r9-meta" data-testid="payroll-running-average">
        {average.averageCents === null
          ? 'Ø laufendes Netto: keine auswertbaren Monate ohne Sonderzahlung.'
          : `Ø laufendes Netto: ${eur(average.averageCents)} (${average.months} ${average.months === 1 ? 'Monat' : 'Monate'}${
              average.excludedMonths
                ? `, ${average.excludedMonths} ${average.excludedMonths === 1 ? 'Monat' : 'Monate'} inkl. Sonderzahlung nicht berücksichtigt`
                : ''
            }${
              average.openMappingMonths
                ? `, ${average.openMappingMonths} ${average.openMappingMonths === 1 ? 'Monat' : 'Monate'} nicht zuordenbar`
                : ''
            }).`}
      </p>
      {openTasks.length > 0 && (
        <p className="r9-meta" role="note" data-testid="payroll-open-mapping">
          Unbekannte Lohnarten zuordnen: {openTasks.map((r) => shortMonth(r.month)).join(', ')} –
          die Bezüge liegen über dem bisherigen laufenden Brutto; eine Sonderzahlung wird erst nach
          der Zuordnung gekennzeichnet.
        </p>
      )}
      <div
        className="rscroll pp-scroll"
        role="region"
        aria-label="Netto je Monat mit Sonderzahlungen, horizontal verschiebbar"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users can scroll the exact-value table.
        tabIndex={0}
      >
        <table className="rtable" data-testid="payroll-net-table">
          <caption className="sr-only">
            Netto je Monat: regulär / kombiniert, Sonderzahlung und Summe
          </caption>
          <thead>
            <tr>
              <th>Monat</th>
              <th className="n">Regulär / kombiniert</th>
              <th className="n">Sonderzahlung · Bonus</th>
              <th className="n">Summe</th>
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .reverse()
              .filter((r) => r.recorded)
              .map((r) => (
                <tr key={r.month}>
                  <th scope="row">{shortMonth(r.month)}</th>
                  <td className="n">
                    {r.runningCents !== null ? eur(r.runningCents) : '—'}
                    {r.containsSpecial && (
                      <small data-testid="payroll-contains-special">
                        {' '}
                        inkl. Sonderzahlung
                        {r.specialGrossCents !== null
                          ? ` (brutto ${eur(r.specialGrossCents)})`
                          : ''}
                      </small>
                    )}
                  </td>
                  <td className="n">{r.specialCents ? eur(r.specialCents) : '—'}</td>
                  <td className="n">{eur(r.totalCents ?? 0)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
