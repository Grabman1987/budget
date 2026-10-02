import { useAmountPrivacy, DimensionChain, Segmented } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { ApiError } from '../api/http';
import { eur, eurParts, eurWhole, longDay } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { chainTerms, periodText } from '../wealth/networth-model';
import { useZeitraum, ZEITRAUM_VALUES } from '../wealth/zeitraum';
import { netWorthHistoryQuery, type NetWorthHistory } from './wealth-history-api';
import { toneOf, WealthHistoryChart } from './wealth-history-chart';
import './reports-future.css';

const PERIOD_OPTIONS = ZEITRAUM_VALUES.map((value) => ({ value, label: value }));
const percent = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Report 3.3 Vermögensverläufe: the net worth of the chosen Zeitraum with its Maßkette (the same
 * series and chain as Vermögen › Nettovermögen) and how it is made up by account type over time.
 */
export function WealthHistoryReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const [period, setPeriod] = useZeitraum();
  const query = useQuery(netWorthHistoryQuery(period));
  const history = query.isSuccess ? query.data : undefined;
  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        history
          ? `${longDay(history.from)} bis ${longDay(history.to)}`
          : query.isError
            ? 'nicht verfügbar'
            : 'wird geladen'
      }
      extraFields={[
        {
          label: 'Zeitraum',
          value: (
            <Segmented
              label="Zeitraum"
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              className="seg-period"
            />
          ),
        },
      ]}
    >
      <div className="kview rf-report wealth-history-report">
        {query.isPending && <LoadingNote what="Vermögensverläufe" />}
        {query.isError &&
          (query.error instanceof ApiError && query.error.code === 'valuation_unavailable' ? (
            <p className="rf-wide" role="alert">
              <strong>Bewertung nicht verfügbar.</strong>{' '}
              {query.error.detail ?? 'Für den Zeitraum fehlt ein Kurs oder Wechselkurs.'}
            </p>
          ) : (
            <ErrorNote
              what="Vermögensverläufe"
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ))}
        {history && history.rows.length === 0 && (
          <EmptyNote>Noch keine Konten. Lege unter Konten ein Konto an.</EmptyNote>
        )}
        {history && history.rows.length > 0 && <Body history={history} />}
      </div>
    </PageFrame>
  );
}

function Body({ history }: { history: NetWorthHistory }) {
  useAmountPrivacy();
  const { chain, groups } = history;
  const text = periodText(history.period, history.from);
  const { whole, fraction } = eurParts(chain.nowCents);
  const rising = chain.deltaCents >= 0;
  const Arrow = rising ? ArrowUp : ArrowDown;
  const assetGroups = groups.filter((g) => !g.liability);
  return (
    <>
      <section className="card rf-card rf-wide" aria-labelledby="wh-title">
        <div className="tbd-head">
          <h2 id="wh-title">Nettovermögen · {text}</h2>
          <span className="tbd-state">
            <span className={rising ? 'ok' : 'ink'} data-testid="wh-state">
              <Arrow className="icon icon-sm" size={16} strokeWidth={1.75} aria-hidden="true" />
              {eurWhole(chain.deltaCents, true)}
            </span>
          </span>
        </div>
        <div className="rf-figure" data-testid="wh-figure">
          {whole}
          <span className="cents">,{fraction} €</span>
        </div>
        <DimensionChain
          terms={chainTerms(chain, history.from)}
          label="Maßkette Nettovermögen im Zeitraum"
        />
        <WealthHistoryChart history={history} />
        <ul className="rf-legend" aria-label="Legende">
          {assetGroups.map((g) => (
            <li key={g.key}>
              <i
                className="rf-sq"
                style={{ background: toneOf(groups.indexOf(g), groups.length) }}
                aria-hidden="true"
              />
              {g.label}
            </li>
          ))}
          {groups.some((g) => g.liability) && (
            <li>
              <i className="rf-sq rf-sq-debt" aria-hidden="true" />
              Schulden, gestrichelt unter Null
            </li>
          )}
          <li>
            <svg viewBox="0 0 26 8" aria-hidden="true">
              <path className="l-actual" d="M0 4h26" />
            </svg>
            Nettovermögen, täglich
          </li>
        </ul>
        <p className="vnote">
          Eigenleistung = Einnahmen minus Konsum plus reguläre Tilgung. Markt = Kursveränderung der
          Anlagen. Die Flächen zeigen den Stand zum Beginn und zu jedem{' '}
          {history.unit === 'week' ? 'Wochen' : 'Monats'}ende, die Linie das tägliche Nettovermögen;
          dieselbe Reihe wie unter Vermögen.
        </p>
      </section>
      <section className="card rf-card rf-wide" aria-labelledby="wh-structure">
        <div className="tbd-head">
          <h2 id="wh-structure">Struktur</h2>
        </div>
        <div
          className="rf-scroll"
          role="region"
          aria-label="Struktur nach Kontotyp, bei Bedarf horizontal verschiebbar"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the table on narrow viewports.
          tabIndex={0}
        >
          <table className="rf-table" data-testid="wh-structure">
            <thead>
              <tr>
                <th className="tech">Kontotyp</th>
                <th className="tech n">Anfang {longDay(history.from)}</th>
                <th className="tech n">heute</th>
                <th className="tech n">Veränderung</th>
                <th className="tech n">Anteil heute</th>
              </tr>
            </thead>
            <tbody>
              {history.rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <i
                      className={`rf-sw${r.liability ? ' rf-sq-debt' : ''}`}
                      style={
                        r.liability
                          ? undefined
                          : {
                              background: toneOf(
                                groups.findIndex((g) => g.key === r.key),
                                groups.length,
                              ),
                            }
                      }
                      aria-hidden="true"
                    />
                    {r.label}
                  </td>
                  <td className="n">{eur(r.startCents)}</td>
                  <td className="n">
                    <strong>{eur(r.nowCents)}</strong>
                  </td>
                  <td className="n">{eur(r.deltaCents, { sign: true })}</td>
                  <td className="n">
                    {r.shareBp === null ? (
                      <span className="muted">Schuld</span>
                    ) : (
                      `${percent.format(r.shareBp / 100)} %`
                    )}
                  </td>
                </tr>
              ))}
              <tr className="is-total">
                <td>Nettovermögen</td>
                <td className="n">{eur(chain.startCents)}</td>
                <td className="n">{eur(chain.nowCents)}</td>
                <td className="n">{eur(chain.deltaCents, { sign: true })}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
