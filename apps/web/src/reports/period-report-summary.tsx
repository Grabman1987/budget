import {
  useAmountPrivacy,
  maskMoneyText,
  ChartSvg,
  Graticule,
  Line,
  StepLine,
  LineLegend,
  type Point,
} from '@budget/ui';
import { monthResult, type YearMonthRow } from '@budget/domain';
import type { ReactNode } from 'react';
import { useElementWidth } from '../charts/use-element-width';
import { chartPoints } from '../charts/tooltip-data';
import { eur, longDay } from '../ledger/format';
import { monthLabel } from '../nav/month';
import type { OnePagerData } from './month-api';
import type { YearReportRead } from './overview-api';
import { bpText, monthShort } from './overview-format';
import { PeriodPresentation } from './period-presentation';
import './period-report-summary.css';

function Kpis({ rows }: { rows: readonly [string, ReactNode][] }) {
  return (
    <div className="period-kpis">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
function Paper({
  title,
  period,
  source,
  page,
  pages,
  children,
}: {
  title: string;
  period: string;
  source: string;
  page: number;
  pages: number;
  children: ReactNode;
}) {
  return (
    <article
      className="period-paper"
      aria-label={`${title} · Zusammenfassung ${page} von ${pages}`}
    >
      <header className="period-paper-heading">
        <span>{title}</span>
        <h2>{period}</h2>
      </header>
      {children}
      <footer className="period-paper-footer">
        <div>
          <span>Bericht</span>
          <b>{title}</b>
        </div>
        <div>
          <span>Zeitraum</span>
          <b>{period}</b>
        </div>
        <div>
          <span>Stand</span>
          <b>{longDay(source)}</b>
        </div>
        <div>
          <span>Blatt</span>
          <b>
            {page} / {pages}
          </b>
        </div>
      </footer>
    </article>
  );
}
function PrintSettings({ pages, monthly = false }: { pages: number; monthly?: boolean }) {
  return (
    <aside className="period-print-settings" aria-label="Druckeinstellungen">
      <h2>Druckeinstellungen</h2>
      <dl>
        {[
          ['Format', 'A4 Hochformat'],
          ['Diagramme', 'mit Diagrammen'],
          ['Seitenzahl', `${pages} ${pages === 1 ? 'Blatt' : 'Blätter'}`],
          ['Als PDF speichern', 'über Drucken'],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <PeriodPresentation monthly={monthly} linkOnly />
    </aside>
  );
}

/** Geometry only: the complete dated plan and actual series come from the existing pace reader. */
export function SummaryPace({ data }: { data: OnePagerData }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const m = data.pace;
  const height = 170,
    left = 40,
    right = 12,
    bottom = 142;
  const low = Math.min(0, ...m.actual, ...m.expected);
  const high = Math.max(1, ...m.actual, ...m.expected);
  const span = high - low || 1;
  const x = (i: number) => left + (i / Math.max(1, m.daysInMonth)) * (width - left - right);
  const y = (v: number) => bottom - ((v - low) / span) * (bottom - 18);
  const points = (values: number[]): Point[] => values.map((v, i) => [x(i), y(v)]);
  return (
    <div ref={ref} className="period-summary-chart">
      {width > 0 && (
        <ChartSvg
          width={width}
          height={height}
          testId="r5-month-pace"
          label="Konsum und Plan im Monatsverlauf"
          points={chartPoints(
            m.expected.map((_, i) =>
              i === 0 ? `Beginn ${m.month}` : `${m.month}-${String(i).padStart(2, '0')}`,
            ),
            x,
            [
              {
                name: 'Konsum',
                values: m.expected.map((_, i) => m.actual[i] ?? null),
                color: 'var(--ink)',
              },
              { name: 'Plan', values: m.expected, color: 'var(--primary)' },
            ],
          )}
        >
          <Graticule
            x1={left}
            x2={width - right}
            lines={[low, high].map((v) => ({ y: y(v), label: eur(v, { cents: false }) }))}
          />
          <Line points={points(m.expected)} kind="plan" />
          <StepLine points={points(m.actual)} kind="actual" draw={false} />
          {[1, Math.ceil(m.daysInMonth / 2), m.daysInMonth].map((d) => (
            <text key={d} x={x(d)} y={height - 6} textAnchor="middle" className="svg-label">
              {d}.
            </text>
          ))}
        </ChartSvg>
      )}
      <LineLegend
        items={[
          { kind: 'actual', label: 'Konsum' },
          { kind: 'plan', label: 'Plan' },
        ]}
      />
    </div>
  );
}

export function SummaryYearBars({ year, rows }: { year: number; rows: YearMonthRow[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const height = 170,
    left = 42,
    right = 10,
    bottom = 142;
  const low = Math.min(0, ...rows.flatMap((r) => [r.incomeCents, r.consumptionCents]));
  const high = Math.max(1, ...rows.flatMap((r) => [r.incomeCents, r.consumptionCents]));
  const y = (v: number) => bottom - ((v - low) / (high - low || 1)) * (bottom - 16);
  const slot = (width - left - right) / 12;
  const x = (i: number) => left + (Number(rows[i]!.month.slice(5, 7)) - 0.5) * slot;
  return (
    <div ref={ref} className="period-summary-chart">
      {width > 0 && (
        <ChartSvg
          width={width}
          height={height}
          testId="r5-year-bars"
          label={`Einnahmen und Konsum je Monat ${year}`}
          points={chartPoints(
            rows.map((r) => r.month),
            x,
            [
              {
                name: 'Einnahmen',
                values: rows.map((r) => r.incomeCents),
                color: 'var(--primary)',
              },
              {
                name: 'Konsum',
                values: rows.map((r) => r.consumptionCents),
                color: 'var(--ink-3)',
              },
            ],
          )}
        >
          <Graticule
            x1={left}
            x2={width - right}
            lines={[low, high].map((v) => ({ y: y(v), label: eur(v, { cents: false }) }))}
          />
          {rows.map((r, i) => {
            const w = Math.min(slot * 0.28, 16);
            return (
              <g key={r.month}>
                <rect
                  x={x(i) - w}
                  y={Math.min(y(r.incomeCents), y(0))}
                  width={w}
                  height={Math.abs(y(r.incomeCents) - y(0))}
                  fill="var(--primary)"
                />
                <rect
                  x={x(i) + 2}
                  y={Math.min(y(r.consumptionCents), y(0))}
                  width={w}
                  height={Math.abs(y(r.consumptionCents) - y(0))}
                  fill="var(--primary)"
                  opacity="0.38"
                />
              </g>
            );
          })}
          {Array.from({ length: 12 }, (_, i) => (
            <text
              key={i}
              x={left + (i + 0.5) * slot}
              y={height - 6}
              textAnchor="middle"
              className="svg-label"
            >
              {monthShort(`${year}-${String(i + 1).padStart(2, '0')}`)}
            </text>
          ))}
        </ChartSvg>
      )}
    </div>
  );
}
function SummaryNetWorth({ data }: { data: YearReportRead }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const net = data.report.netWorth;
  if (!net) return null;
  const values = [net.startCents, ...net.months.map((m) => m.endCents)];
  const low = Math.min(...values),
    high = Math.max(...values),
    height = 150,
    left = 12,
    right = 12;
  const x = (i: number) => left + (i / Math.max(1, values.length - 1)) * (width - left - right);
  const y = (v: number) => height - 24 - ((v - low) / (high - low || 1)) * (height - 44);
  return (
    <div ref={ref} className="period-summary-chart">
      {width > 0 && (
        <ChartSvg
          width={width}
          height={height}
          testId="r5-year-networth"
          label="Nettovermögen im Berichtsjahr"
          points={chartPoints(['Anfang', ...net.months.map((m) => m.month)], x, [
            { name: 'Nettovermögen', values, color: 'var(--primary)' },
          ])}
        >
          <Line points={values.map((v, i): Point => [x(i), y(v)])} kind="actual" />
          <text x={left} y={height - 4} className="svg-label">
            Anfang
          </text>
          <text x={width - right} y={height - 4} textAnchor="end" className="svg-label">
            {monthShort(data.report.months.at(-1)!)}
          </text>
        </ChartSvg>
      )}
    </div>
  );
}

export function MonthSummary({ data }: { data: OnePagerData }) {
  useAmountPrivacy();
  const r = data.result;
  return (
    <div className="period-summary period-month-summary" data-testid="r5-month-summary">
      <Paper
        title="Monatsbericht"
        period={monthLabel(data.month)}
        source={data.asOf}
        page={1}
        pages={1}
      >
        <div className="period-paper-lead">
          Konsum: {eur(data.pace.figures.spentCents)} · Plan bis heute:{' '}
          {eur(data.pace.figures.planToDateCents)}
        </div>
        <Kpis
          rows={[
            ['Einnahmen', <span data-testid="r5-month-income">{eur(r.earnedCents)}</span>],
            ['Konsum', eur(r.consumptionCents)],
            ['Gespart', <span data-testid="r5-month-saved">{eur(r.savedCents)}</span>],
            ['Sparquote', data.partial ? 'Nach Monatsende' : bpText(r.savingsRateBp)],
          ]}
        />
        <div>
          <h3 className="period-summary-label">Ausgaben im Monatsverlauf</h3>
          <SummaryPace data={data} />
        </div>
        <div>
          <h3 className="period-summary-label">
            Größte Ausgaben · gegenüber {monthLabel(data.previousMonth)}
          </h3>
          <table className="period-summary-table">
            <caption className="sr-only">Größte Konsumausgaben und Vormonat</caption>
            <thead>
              <tr>
                <th>Kategorie</th>
                <th>Ist</th>
                <th>Vormonat</th>
                <th>Differenz</th>
              </tr>
            </thead>
            <tbody>
              {data.top.slice(0, 4).map((row) => (
                <tr key={row.id}>
                  <th scope="row">{maskMoneyText(row.name)}</th>
                  <td>{eur(row.cents)}</td>
                  <td>{eur(row.previousCents)}</td>
                  <td>{eur(row.deltaCents, { sign: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.top.length === 0 && <p>Keine Konsumausgaben in diesem Monat.</p>}
        </div>
        <div className="period-wealth-line">
          Nettovermögen{' '}
          <b>
            {'unavailable' in data.netWorth
              ? '—'
              : `${data.incomplete?.length ? '≈ ' : ''}${eur(data.netWorth.cents)}`}
          </b>
          {!('unavailable' in data.netWorth) && (
            <>
              {' '}
              · Veränderung <b>{eur(data.netWorth.deltaCents, { sign: true })}</b>
            </>
          )}
        </div>
      </Paper>
      <PrintSettings pages={1} monthly />
    </div>
  );
}
export function YearSummary({ data }: { data: YearReportRead }) {
  useAmountPrivacy();
  const r = data.report,
    t = r.totals,
    n = r.netWorth;
  const result = monthResult({
    earnedCents: t.incomeCents,
    consumptionCents: t.consumptionCents,
    futureCents: t.futureCents,
  });
  const period = `${r.year}${r.partial ? ` · bis ${monthShort(r.months.at(-1)!)}` : ''}`;
  return (
    <div className="period-summary period-year-summary" data-testid="r5-year-summary">
      <Paper title="Jahresbericht" period={period} source={data.today} page={1} pages={2}>
        <div className="period-paper-lead">
          Einnahmen: {eur(t.incomeCents)} · Konsum: {eur(t.consumptionCents)} · Gespart:{' '}
          {eur(result.savedCents)}
        </div>
        <Kpis
          rows={[
            ['Einnahmen', <span data-testid="r5-year-income">{eur(t.incomeCents)}</span>],
            ['Konsum', eur(t.consumptionCents)],
            ['Gespart', eur(result.savedCents)],
            ['Sparquote', bpText(t.savingsRateBp)],
          ]}
        />
        <div>
          <h3 className="period-summary-label">Einnahmen und Konsum je Monat</h3>
          <SummaryYearBars year={r.year} rows={r.rows} />
        </div>
        <div className="period-desktop-months">
          <h3 className="period-summary-label">Monate</h3>
          <table className="period-summary-table">
            <caption className="sr-only">Monatliche Einnahmen, Konsum und Sparbetrag</caption>
            <thead>
              <tr>
                <th>Monat</th>
                <th>Einnahmen</th>
                <th>Konsum</th>
                <th>Gespart</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row) => (
                <tr key={row.month}>
                  <th scope="row">{monthShort(row.month)}</th>
                  <td>{eur(row.incomeCents)}</td>
                  <td>{eur(row.consumptionCents)}</td>
                  <td>
                    {eur(
                      monthResult({
                        earnedCents: row.incomeCents,
                        consumptionCents: row.consumptionCents,
                        futureCents: row.futureCents,
                      }).savedCents,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Summe</th>
                <td>{eur(t.incomeCents)}</td>
                <td>{eur(t.consumptionCents)}</td>
                <td>{eur(result.savedCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Paper>
      <Paper
        title="Vermögensreport im Jahresbericht"
        period={period}
        source={data.today}
        page={2}
        pages={2}
      >
        <div className="period-paper-lead">Nettovermögen: {n ? eur(n.endCents) : '—'}</div>
        <div className="period-desktop-wealth">
          <Kpis
            rows={[
              ['Anfang', n ? eur(n.startCents) : '—'],
              ['Eigenleistung', n ? eur(n.ownCents) : '—'],
              ['Markt', n ? eur(n.marketCents) : '—'],
              ['Jetzt', n ? eur(n.endCents) : '—'],
            ]}
          />
          <SummaryNetWorth data={data} />
        </div>
        <h3 className="period-summary-label">Vermögensreport</h3>
        <dl className="period-wealth-rows">
          {[
            ['Nettovermögen', n ? eur(n.endCents) : '—'],
            ['Eigenleistung', n ? eur(n.ownCents) : '—'],
            ['Markteffekt', n ? eur(n.marketCents) : '—'],
            ['Kapitalerträge · separat', eur(t.capitalCents)],
            [
              'Finanz-Check',
              data.rules
                ? `${data.rules.okCount} von ${data.rules.total} erfüllt`
                : 'Nicht verfügbar',
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {n && Boolean(data.incomplete?.length) && (
          <p className="period-summary-note" role="status">
            ≈ Bewertung teilweise geschätzt
          </p>
        )}
        {!n && (
          <p className="period-summary-note">
            {data.netWorthUnavailable ?? 'Bewertung nicht verfügbar.'}
          </p>
        )}
        <p className="period-summary-note">
          Eigenleistung enthält auch Tilgungen. Kapitalerträge zählen nicht zu den Einnahmen oder
          zur Sparquote.
        </p>
      </Paper>
      <PrintSettings pages={2} />
    </div>
  );
}
