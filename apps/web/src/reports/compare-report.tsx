import { ChartValue, Button, useMediaQuery } from '@budget/ui';
import {
  useAmountPrivacy,
  maskMoneyText,
  ClassSwatch,
  DimensionChain,
  Segmented,
} from '@budget/ui';
import {
  COMPARE_MODES,
  cents,
  type CompareMode,
  type CompareRow,
  type PeriodComparison,
} from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { eur } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { ReportFrame as PageFrame } from './report-frame';
import { periodComparisonQuery } from './overview-api';
import { bpText, monthLong, monthShortYear } from './overview-format';
import './overview-reports.css';
import './compare-report.css';
import './period-report-summary.css';
import './table-print.css';

const MODE_OPTIONS = COMPARE_MODES.map((m) => ({ value: m.id, label: m.label }));

const periodName = (months: string[]) =>
  months.length === 1
    ? monthLong(months[0] as string)
    : `${monthShortYear(months[0] as string)} bis ${monthShortYear(months[months.length - 1] as string)}`;

/** Relative change in basis points; `null` without a basis. */
const changeBp = (now: number, before: number) =>
  before > 0 ? Math.round(((now - before) * 10_000) / before) : null;

export function CompareReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const [mode, setMode] = useState<CompareMode>('vj');
  const [detailOpen, setDetailOpen] = useState(false);
  const printMedia = useMediaQuery('print');
  const printing = REDESIGN_ENABLED && printMedia;
  const query = useQuery(periodComparisonQuery(mode));
  const data = query.data;
  const comparison = data?.comparison;
  const comparisonControl = REDESIGN_ENABLED ? (
    <label>
      <span className="sr-only">Vergleich</span>
      <select value={mode} onChange={(event) => setMode(event.target.value as CompareMode)}>
        {MODE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ) : (
    <Segmented label="Vergleich" options={MODE_OPTIONS} value={mode} onChange={setMode} />
  );
  return (
    <PageFrame
      sourceReportId={report.id}
      sourceDate={data?.today}
      {...(REDESIGN_ENABLED
        ? { extraFields: [{ label: 'Vergleich', value: comparisonControl }] }
        : {})}
      calculation={
        comparison && comparison.current.length > 0 && !query.isFetching && !query.isError
          ? {
              label: 'Berechnung Zeitraumvergleich',
              signed: true,
              terms: [
                { label: 'Konsum jetzt', value: cents(comparison.chain.currentCents) },
                { op: '-', label: 'Konsum vorher', value: cents(comparison.chain.previousCents) },
              ],
              result: {
                label: 'Konsum · Veränderung',
                value: comparison.chain.currentCents - comparison.chain.previousCents,
                unit: 'money',
              },
            }
          : undefined
      }
      verdict={
        data && comparison && !query.isFetching && !query.isError
          ? {
              reportId: report.id,
              unavailable: REDESIGN_ENABLED && comparison.current.length === 0,
              period: `${comparison.current[0]}..${comparison.current.at(-1)}`,
              metric: {
                label: 'Konsum',
                value: comparison.currentTotals.consumptionCents,
                unit: 'money',
              },
              comparisons: [
                {
                  reference: 'Vergleichszeitraum',
                  value: comparison.previousTotals.consumptionCents,
                },
              ],
            }
          : undefined
      }
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        query.isError
          ? 'nicht verfügbar'
          : data
            ? data.firstMonth
              ? `volle Monate bis ${monthLong(data.ref)}`
              : 'noch keine Buchungen'
            : 'wird geladen'
      }
    >
      <div
        className={`kview ov compare-report${REDESIGN_ENABLED ? ' period-comparison report-table-print' : ''}`}
      >
        {query.isPending && <LoadingNote what="Zeitraumvergleich" />}
        {query.isError && (
          <ErrorNote
            what="Zeitraumvergleich"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {data && comparison && (
          <>
            {REDESIGN_ENABLED && comparison.current.length > 0 ? (
              <>
                <Rows
                  rows={comparison.rows}
                  date={periodName(comparison.current)}
                  comparison={comparison}
                  printing={printing}
                />
                <details
                  className="period-comparison-detail"
                  open={detailOpen || printing}
                  onToggle={(event) => {
                    if (!printing) setDetailOpen(event.currentTarget.open);
                  }}
                >
                  <summary>Kennzahlen und vollständige Berechnung</summary>
                  <section className="card ov-card" aria-labelledby="vg-title">
                    <div className="tbd-head">
                      <h2 id="vg-title">
                        {comparison.current.length === 0
                          ? 'Zeitraumvergleich'
                          : `${periodName(comparison.current)} gegen ${periodName(comparison.previous)}`}
                      </h2>
                      {!REDESIGN_ENABLED && comparisonControl}
                    </div>
                    {data.firstMonth === null ? (
                      <p className="ov-empty" role="status">
                        Es gibt noch keine Buchungen auf Budgetkonten, die sich vergleichen ließen.
                      </p>
                    ) : comparison.current.length === 0 ? (
                      <p className="ov-empty" role="status">
                        Dieser Vergleich braucht Buchungen in beiden Zeiträumen, das Hauptbuch
                        beginnt aber erst im {monthLong(data.firstMonth)}. Wähle einen kürzeren
                        Vergleich.
                      </p>
                    ) : (
                      <Body comparison={comparison} fetching={query.isFetching} />
                    )}
                  </section>
                </details>
              </>
            ) : (
              <>
                <section className="card ov-card" aria-labelledby="vg-title">
                  <div className="tbd-head">
                    <h2 id="vg-title">
                      {comparison.current.length === 0
                        ? 'Zeitraumvergleich'
                        : `${periodName(comparison.current)} gegen ${periodName(comparison.previous)}`}
                    </h2>
                    {!REDESIGN_ENABLED && comparisonControl}
                  </div>
                  {data.firstMonth === null ? (
                    <p className="ov-empty" role="status">
                      Es gibt noch keine Buchungen auf Budgetkonten, die sich vergleichen ließen.
                    </p>
                  ) : comparison.current.length === 0 ? (
                    <p className="ov-empty" role="status">
                      Dieser Vergleich braucht Buchungen in beiden Zeiträumen, das Hauptbuch beginnt
                      aber erst im {monthLong(data.firstMonth)}. Wähle einen kürzeren Vergleich.
                    </p>
                  ) : (
                    <Body comparison={comparison} fetching={query.isFetching} />
                  )}
                </section>
                {comparison.current.length > 0 && (
                  <Rows
                    rows={comparison.rows}
                    date={periodName(comparison.current)}
                    comparison={comparison}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </PageFrame>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  useAmountPrivacy();
  const bp = changeBp(now, before);
  return (
    <small>
      {eur(now - before, { sign: true, cents: false })}
      {bp !== null ? ` · ${bpText(bp, { sign: true })}` : ''}
    </small>
  );
}

function Body({ comparison, fetching }: { comparison: PeriodComparison; fetching: boolean }) {
  useAmountPrivacy();
  const { currentTotals: a, previousTotals: b, chain } = comparison;
  const partial = comparison.current.length < comparison.requestedMonths;
  return (
    <div aria-busy={fetching}>
      <div className="ov-figs">
        <div>
          <span className="tech">Konsum</span>
          <strong data-testid="vg-consumption">{eur(a.consumptionCents, { cents: false })}</strong>
          <Delta now={a.consumptionCents} before={b.consumptionCents} />
        </div>
        <div>
          <span className="tech">Einkommen</span>
          <strong data-testid="vg-income">{eur(a.incomeCents, { cents: false })}</strong>
          <Delta now={a.incomeCents} before={b.incomeCents} />
        </div>
        <div>
          <span className="tech">Sparquote</span>
          <strong data-testid="vg-rate">{bpText(a.savingsRateBp)}</strong>
          <small>vorher {bpText(b.savingsRateBp)}</small>
        </div>
        <div>
          <span className="tech">Kapitalerträge</span>
          <strong data-testid="vg-capital">{eur(a.capitalCents, { cents: false })}</strong>
          <small>vorher {eur(b.capitalCents, { cents: false })}</small>
        </div>
      </div>
      <DimensionChain
        label="Maßkette Zeitraumvergleich"
        terms={[
          { label: 'Konsum vorher', value: cents(chain.previousCents) },
          { label: 'mehr', value: cents(chain.moreCents), op: '+' },
          { label: 'weniger', value: cents(chain.lessCents), op: '-' },
          { label: 'Konsum jetzt', value: cents(chain.currentCents), op: '=', result: true },
        ]}
      />
      {partial && (
        <p className="ov-note" role="note">
          Verglichen werden {comparison.current.length} von {comparison.requestedMonths} Monaten:
          für die übrigen reicht das Hauptbuch nicht zurück.
        </p>
      )}
      <p className="ov-note">
        Einkommen ohne Kapitalerträge und Erstattungen; Kapitalerträge stehen für sich und zählen
        weder zum Einkommen noch zur Sparquote.
      </p>
    </div>
  );
}

function Rows({
  rows,
  date,
  comparison,
  printing = false,
}: {
  rows: CompareRow[];
  date: string;
  comparison: PeriodComparison;
  printing?: boolean;
}) {
  useAmountPrivacy();
  const [expanded, setExpanded] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const visibleRows = REDESIGN_ENABLED && !expanded && !printing ? rows.slice(0, 4) : rows;
  const maxDelta = Math.max(1, ...rows.map((r) => Math.abs(r.deltaCents)));
  return (
    <section
      className="card ov-card"
      aria-labelledby="vg-rows"
      data-table-open={REDESIGN_ENABLED ? String(tableOpen) : undefined}
    >
      <div className="tbd-head">
        <h2 id="vg-rows">
          {REDESIGN_ENABLED ? 'Differenz je Kategorie' : 'Veränderung je Kategorie'}
        </h2>
        <span className="tbd-state">
          <span className="ink">
            {REDESIGN_ENABLED
              ? `${periodName(comparison.current)} · ${periodName(comparison.previous)}`
              : 'sortiert nach Ausschlag'}
          </span>
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="ov-empty">
          In beiden Zeiträumen gibt es keine Ausgaben in Bedarf und Wunsch.
        </p>
      ) : (
        <>
          <div className="dv-head" aria-hidden="true">
            <span />
            <span className="dv-head-mid tech">
              <span>weniger</span>
              <span>mehr</span>
            </span>
            <span />
          </div>
          <ul
            className="dv"
            id={REDESIGN_ENABLED ? 'vg-list' : undefined}
            aria-label="Veränderung je Kategorie"
          >
            {visibleRows.map((row) => (
              <li key={row.categoryId}>
                <span className="dv-name">
                  <ClassSwatch kind={row.class} />
                  {REDESIGN_ENABLED ? maskMoneyText(row.name) : row.name}
                </span>
                <ChartValue
                  label="Zeitraumvergleich"
                  date={date}
                  series={[
                    { name: 'Veränderung', value: eur(row.deltaCents), color: 'var(--line)' },
                    { name: 'Vorher', value: eur(row.previousCents), color: 'var(--ink-3)' },
                    { name: 'Aktuell', value: eur(row.currentCents), color: 'var(--line)' },
                  ]}
                >
                  <span className="dv-track" aria-hidden="true">
                    <i
                      className={row.deltaCents < 0 ? 'is-less' : 'is-more'}
                      style={{ width: `${(Math.abs(row.deltaCents) / maxDelta) * 50}%` }}
                    />
                  </span>
                </ChartValue>
                <span className="dv-val">
                  <strong>{eur(row.deltaCents, { cents: false, sign: true })}</strong>
                  <small>
                    {eur(row.previousCents, { cents: false })} →{' '}
                    {eur(row.currentCents, { cents: false })}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {REDESIGN_ENABLED && (
        <div className="period-comparison-actions">
          {rows.length > 4 && (
            <Button
              variant="ghost"
              aria-expanded={expanded}
              aria-controls="vg-list vg-table"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded
                ? 'Nur größte Änderungen zeigen'
                : `Alle ${rows.length} Kategorien anzeigen`}
            </Button>
          )}
          <Button
            className="period-mobile-table"
            variant="ghost"
            aria-expanded={tableOpen}
            aria-controls="vg-table"
            onClick={() => setTableOpen(!tableOpen)}
          >
            {tableOpen ? 'Tabelle ausblenden' : 'Werte als Tabelle'}
          </Button>
        </div>
      )}
      {REDESIGN_ENABLED && !expanded && !printing && rows.length > 4 && (
        <p className="period-summary-note">
          Größte 4 von {rows.length} Änderungen. Die Summe umfasst alle Kategorien.
        </p>
      )}
      {REDESIGN_ENABLED && (
        <div
          className="period-comparison-table"
          id="vg-table"
          role="region"
          aria-label="Zeitraumvergleich als Tabelle, horizontal verschiebbar"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The complete table needs a keyboard scrolling alternative.
          tabIndex={0}
        >
          <table className="period-summary-table">
            <caption>
              {periodName(comparison.current)} gegen {periodName(comparison.previous)}
            </caption>
            <thead>
              <tr>
                <th>Kategorie</th>
                <th>Jetzt</th>
                <th>Vorher</th>
                <th>Differenz</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.categoryId}>
                  <th scope="row">{maskMoneyText(row.name)}</th>
                  <td>{eur(row.currentCents)}</td>
                  <td>{eur(row.previousCents)}</td>
                  <td>{eur(row.deltaCents, { sign: true })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Summe Konsum · alle Kategorien</th>
                <td>{eur(comparison.chain.currentCents)}</td>
                <td>{eur(comparison.chain.previousCents)}</td>
                <td>
                  {eur(comparison.chain.currentCents - comparison.chain.previousCents, {
                    sign: true,
                  })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="ov-note">
        Balken um die Mittellinie: rechts mehr ausgegeben, links weniger; die Zahl bleibt das
        Signal. Zukunft (ETF, Notgroschen) ist nicht enthalten.
      </p>
    </section>
  );
}
