import { useAmountPrivacy, ClassSwatch, DimensionChain, Segmented } from '@budget/ui';
import {
  COMPARE_MODES,
  cents,
  type CompareMode,
  type CompareRow,
  type PeriodComparison,
} from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { eur } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { periodComparisonQuery } from './overview-api';
import { bpText, monthLong, monthShortYear } from './overview-format';
import './overview-reports.css';
import './compare-report.css';

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
  const query = useQuery(periodComparisonQuery(mode));
  const data = query.data;
  const comparison = data?.comparison;
  return (
    <PageFrame
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
      <div className="kview ov compare-report">
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
            <section className="card ov-card" aria-labelledby="vg-title">
              <div className="tbd-head">
                <h2 id="vg-title">
                  {comparison.current.length === 0
                    ? 'Zeitraumvergleich'
                    : `${periodName(comparison.current)} gegen ${periodName(comparison.previous)}`}
                </h2>
                <Segmented
                  label="Vergleich"
                  options={MODE_OPTIONS}
                  value={mode}
                  onChange={setMode}
                />
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
            {comparison.current.length > 0 && <Rows rows={comparison.rows} />}
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

function Rows({ rows }: { rows: CompareRow[] }) {
  useAmountPrivacy();
  const maxDelta = Math.max(1, ...rows.map((r) => Math.abs(r.deltaCents)));
  return (
    <section className="card ov-card" aria-labelledby="vg-rows">
      <div className="tbd-head">
        <h2 id="vg-rows">Veränderung je Kategorie</h2>
        <span className="tbd-state">
          <span className="ink">sortiert nach Ausschlag</span>
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
          <ul className="dv" aria-label="Veränderung je Kategorie">
            {rows.map((row) => (
              <li key={row.categoryId}>
                <span className="dv-name">
                  <ClassSwatch kind={row.class} />
                  {row.name}
                </span>
                <span className="dv-track" aria-hidden="true">
                  <i
                    className={row.deltaCents < 0 ? 'is-less' : 'is-more'}
                    style={{ width: `${(Math.abs(row.deltaCents) / maxDelta) * 50}%` }}
                  />
                </span>
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
      <p className="ov-note">
        Balken um die Mittellinie: rechts mehr ausgegeben, links weniger; die Zahl bleibt das
        Signal. Zukunft (ETF, Notgroschen) ist nicht enthalten.
      </p>
    </section>
  );
}
