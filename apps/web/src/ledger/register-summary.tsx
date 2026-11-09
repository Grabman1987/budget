import { registerPeriod, type RegisterMonth, type RegisterMonthsKind } from '@budget/domain';
import { ChartSvg, Segmented, maskMoneyText, useAmountPrivacy, useIsPhone } from '@budget/ui';
import { useId, useState } from 'react';
import { eur } from './format';

const ranges = [
  { value: '3', label: '3 M' },
  { value: '6', label: '6 M' },
  { value: '12', label: '12 M' },
  { value: 'all', label: 'Alle' },
] as const;
/** Callers subscribe through useAmountPrivacy(); the mask is applied to every shown figure. */
export const registerAmount = (value: number | null | undefined) =>
  value == null ? 'nicht verfügbar' : maskMoneyText(eur(value));

/** "Kategorie netto ..." line; the amount honours the privacy mask. */
export const categoryNetLabel = (group: boolean, cents: number) =>
  `${group ? 'Gruppe' : 'Kategorie'} netto ${maskMoneyText(eur(cents))}`;

export const registerScopeLabel = (kind: RegisterMonthsKind | undefined) =>
  kind === 'balance'
    ? 'Kontobewegung inkl. Umbuchungen'
    : kind === 'filtered'
      ? 'gefiltert, ohne Saldo'
      : 'angezeigte Buchungen, ohne Saldo';

/** The chart and KPIs share the complete-filter months used by the headings. */
export function RegisterSummary({
  months,
  kind,
  today,
  pending,
}: {
  months: readonly RegisterMonth[] | undefined;
  kind?: RegisterMonthsKind | undefined;
  today: string;
  pending: boolean;
}) {
  const hidden = useAmountPrivacy();
  const phone = useIsPhone();
  const [expanded, setExpanded] = useState(false);
  const [range, setRange] = useState<'3' | '6' | '12' | 'all'>('6');
  const id = useId();
  const period = registerPeriod(months ?? [], range, today);
  const available = !!months && !pending;
  const values = period.months.map((row) => row.cents ?? 0);
  const low = Math.min(0, ...values),
    high = Math.max(0, ...values);
  // Ratios are SVG geometry only; all financial values remain integer cents.
  const y = (value: number) => 20 + ((high - value) / (high - low || 1)) * 100;
  const step = 300 / (values.length || 1);
  const content = (
    <div id={id} className="register-summary-content" hidden={phone && !expanded}>
      <Segmented
        label="Zeitraum der Auswertung"
        options={ranges}
        value={range}
        onChange={setRange}
      />
      {!available ? (
        <p role="status">
          {pending ? 'Auswertung wird aktualisiert …' : 'Auswertung nicht verfügbar.'}
        </p>
      ) : (
        <>
          <dl className="register-summary-kpis">
            <div>
              <dt>Summe</dt>
              <dd>{registerAmount(period.cents)}</dd>
            </div>
            <div>
              <dt>Ø pro Monat</dt>
              <dd>{registerAmount(period.averageCents)}</dd>
            </div>
            <div>
              <dt>Buchungen</dt>
              <dd>{period.count}</dd>
            </div>
          </dl>
          {period.months.length === 0 ? (
            <p>Keine Monatssummen für diese Filter.</p>
          ) : (
            <>
              <p className="kmeta">
                {period.months[0]?.month} – {period.months.at(-1)?.month} ·{' '}
                {registerScopeLabel(kind)}· bis heute, ohne Geplantes · EUR je Buchungstag
              </p>
              {hidden ? (
                <p>Beträge ausgeblendet</p>
              ) : (
                <ChartSvg
                  width={340}
                  height={156}
                  label={`Monatliche Buchungssummen (${registerScopeLabel(kind)}): Einnahmen positiv, Ausgaben negativ. Gestrichelt: Durchschnitt ${registerAmount(period.averageCents)}. Exakte Beträge in der Monatstabelle.`}
                  points={period.months.map((row, index) => ({
                    x: 30 + (index + 0.5) * step,
                    date: row.month,
                    series: [{ name: 'Summe', value: registerAmount(row.cents) }],
                  }))}
                >
                  <line x1="30" x2="330" y1={y(0)} y2={y(0)} stroke="var(--rule-strong)" />
                  <text x="24" y={y(0) + 4} textAnchor="end">
                    0
                  </text>
                  {period.months.map((row, index) => {
                    const x = 30 + index * step;
                    return (
                      <g key={row.month}>
                        <title>
                          {row.month}: {registerAmount(row.cents)}
                        </title>
                        {row.cents !== null && (
                          <rect
                            x={x + step * 0.15}
                            y={Math.min(y(0), y(row.cents))}
                            width={step * 0.7}
                            height={Math.abs(y(row.cents) - y(0))}
                            fill="var(--ink-2)"
                          />
                        )}
                        {(values.length <= 6 || index === 0 || index === values.length - 1) && (
                          <text x={x + step / 2} y="148" textAnchor="middle">
                            {row.month.slice(5)}.{row.month.slice(2, 4)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  {period.averageCents !== null && (
                    <line
                      x1="30"
                      x2="330"
                      y1={y(period.averageCents)}
                      y2={y(period.averageCents)}
                      stroke="var(--line)"
                      strokeDasharray="7 5"
                      strokeWidth="2"
                    />
                  )}
                </ChartSvg>
              )}
              <details className="register-summary-table">
                <summary>Monatswerte · gestrichelt: Ø pro Monat</summary>
                <table>
                  <caption className="sr-only">Monatliche Buchungssummen in Euro</caption>
                  <thead>
                    <tr>
                      <th scope="col">Monat</th>
                      <th scope="col">Summe</th>
                      {kind === 'balance' && <th scope="col">Saldo Monatsende</th>}
                      <th scope="col">Buchungen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {period.months.map((row) => (
                      <tr key={row.month}>
                        <th scope="row">{row.month}</th>
                        <td>{registerAmount(row.cents)}</td>
                        {kind === 'balance' && <td>{registerAmount(row.cumulativeCents)}</td>}
                        <td>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </>
      )}
    </div>
  );
  return (
    <section className="register-summary" aria-label="Auswertung des aktuellen Filters">
      {phone ? (
        <button
          type="button"
          className="register-summary-toggle"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          Auswertung des Filters <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>
      ) : (
        <h2>Auswertung des Filters</h2>
      )}
      {content}
    </section>
  );
}
