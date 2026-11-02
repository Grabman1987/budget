import { DimensionChain, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { VERMOEGEN_NETTO_META } from '../nav/pages';
import { AppLink } from '../shell/app-link';
import { ErrorNote, LoadingNote, EmptyNote } from '../ledger/states';
import { eur, longDay } from '../ledger/format';
import { ValuationHint } from '../ledger/valuation-hint';
import { ppText, percentText } from '../pages/portfolio-report-shared';
import { netWorthQuery } from './api';
import { freedomQuery } from './freedom-api';
import { savingsProposalsQuery } from './savings-api';
import { portfolioContributionsQuery, portfolioPerformanceQuery } from './portfolio-api';
import { AssetComposition } from './asset-composition';
import { chainTerms } from './networth-model';
import { OverviewChart } from './overview-chart';
import { ZeitraumSwitch } from './frame';
import { useZeitraum } from './zeitraum';
import { WealthFrame, WealthReadStatus } from './redesign-frame';

export function WealthOverview() {
  useAmountPrivacy();
  const [period] = useZeitraum();
  const net = useQuery(netWorthQuery(period));
  const freedom = useQuery(freedomQuery());
  const proposals = useQuery(savingsProposalsQuery());
  const chart = useQuery(portfolioContributionsQuery(period));
  const ytd = useQuery(portfolioPerformanceQuery('YTD'));
  const view = net.data;
  const history = chart.data?.portfolio.contributionHistory;
  // Compare only the explicitly persisted world-equity selection, never another/default product.
  const world = ytd.data?.portfolio.benchmarks.find(
    (benchmark) => benchmark.id === 'benchmark-ftse',
  );
  const portfolioReturn = ytd.data?.portfolio.performance?.ttwror;
  const comparison =
    portfolioReturn == null || world?.benchmarkReturn == null
      ? null
      : portfolioReturn - world.benchmarkReturn;
  const sources = [
    { query: net, what: 'Nettovermögen' },
    { query: freedom, what: 'Anlagebasis und Freiheit' },
    { query: proposals, what: 'Sparplanausführungen' },
  ];
  return (
    <WealthFrame meta={VERMOEGEN_NETTO_META} page="overview">
      <div className="wealth-overview">
        {sources.map(({ query, what }) => (
          <div key={what}>
            {query.isPending && <LoadingNote what={what} />}
            {query.isError && (
              <ErrorNote what={what} error={query.error} onRetry={() => void query.refetch()} />
            )}
          </div>
        ))}
        <WealthReadStatus
          fetching={net.isFetching}
          paused={net.isPaused}
          date={view ? longDay(view.to) : undefined}
        />
        {view && (
          <>
            <section className="wealth-lead" aria-labelledby="wealth-net-title">
              <h2 id="wealth-net-title">Nettovermögen</h2>
              <div className="wealth-figure" data-testid="wealth-net-value">
                {eur(view.chain.nowCents)}
              </div>
              <ValuationHint incomplete={view.incomplete} />
              {view.assetComposition && !view.assetComposition.complete && (
                <p className="vnote">
                  Gesamtwert nach bestehender Bewertungsbasis; Zusammensetzung unvollständig oder
                  vorläufig.
                </p>
              )}
              <DimensionChain
                terms={chainTerms(view.chain, view.from)}
                label="Maßkette Nettovermögen im Zeitraum"
              />
              <p className="vnote">
                Alle Vermögenswerte abzüglich sämtlicher Verbindlichkeiten.{' '}
                <AppLink to="/vermoegen/nettovermoegen" search={{ zeitraum: period }}>
                  Nettovermögen und Verlauf im Detail
                </AppLink>
              </p>
            </section>
            {view.composition.assets.length === 0 && view.composition.debts.length === 0 && (
              <EmptyNote>
                Noch keine Konten. <AppLink to="/konten">Konto anlegen</AppLink>
              </EmptyNote>
            )}
          </>
        )}
        <div className="wealth-overview-work">
          <section className="wealth-sheet" aria-labelledby="wealth-next-title">
            <h2 id="wealth-next-title">Als Nächstes</h2>
            <ul className="wealth-action-list">
              {proposals.data && (
                <li>
                  <span>
                    {proposals.data.proposals.length
                      ? `${proposals.data.proposals.length} Sparplanausführungen prüfen`
                      : 'Keine offenen Sparplanausführungen'}
                  </span>
                  <AppLink to="/konten/pruefen">Prüfen</AppLink>
                </li>
              )}
              {!!view?.incomplete?.length && (
                <li>
                  <span>Bewertungen prüfen · {view.incomplete.length} Instrumente</span>
                  <AppLink to="/vermoegen/portfolio/positionen">Positionen öffnen</AppLink>
                </li>
              )}
              <li>
                <span>Sparraten und nächste Ausführungen</span>
                <AppLink to="/vermoegen/portfolio/sparplaene">Sparpläne</AppLink>
              </li>
              <li>
                <span>Zielabweichungen prüfen</span>
                <AppLink to="/vermoegen/portfolio/allokation">Allokation</AppLink>
              </li>
            </ul>
            {freedom.data && (
              <p className="wealth-basis">
                Investiert · ausgewählte Anlagebasis{' '}
                <strong data-testid="wealth-invested">
                  {freedom.data.investedCents === null
                    ? 'Nicht verfügbar'
                    : eur(freedom.data.investedCents)}
                </strong>
                <br />
                <span className="vnote">
                  Stand {longDay(freedom.data.asOf)} · einschließlich ausgewählter negativer
                  Verrechnungskassa.{' '}
                  <AppLink to="/vermoegen/freiheit" hash="freedom-account-title">
                    Quellkonten
                  </AppLink>
                </span>
              </p>
            )}
          </section>
          <section className="wealth-sheet" aria-labelledby="wealth-course-title">
            <div className="wealth-section-head">
              <h2 id="wealth-course-title">Verlauf</h2>
              <ZeitraumSwitch />
            </div>
            {chart.isPending && <LoadingNote what="Wert und Einzahlungen" />}
            {chart.isError && (
              <ErrorNote
                what="Wert und Einzahlungen"
                error={chart.error}
                onRetry={() => void chart.refetch()}
              />
            )}
            <ValuationHint incomplete={chart.data?.incomplete} />
            {history?.daily.length ? (
              <OverviewChart history={history} />
            ) : (
              chart.isSuccess && (
                <EmptyNote>
                  Noch keine vollständige Wertpapierhistorie für diesen Zeitraum.
                </EmptyNote>
              )
            )}
            <AppLink to="/reports/peinzahlungen" search={{ zeitraum: period }}>
              Ganze Auswertung →
            </AppLink>
          </section>
        </div>
        <section className="wealth-benchmark wealth-sheet" aria-label="Weltaktienvergleich YTD">
          {ytd.isPending && <LoadingNote what="YTD-Vergleich" />}
          {ytd.isError && (
            <ErrorNote what="YTD-Vergleich" error={ytd.error} onRetry={() => void ytd.refetch()} />
          )}
          {ytd.data && (
            <p>
              Wertpapiere YTD {percentText(portfolioReturn)} · Weltaktien{' '}
              {world ? `${world.name} ${percentText(world.benchmarkReturn)}` : 'nicht ausgewählt'} ·
              Differenz{' '}
              <strong>{comparison === null ? 'Nicht verfügbar' : ppText(comparison)}</strong> ·
              Stand {longDay(ytd.data.portfolio.performance?.to ?? ytd.data.portfolio.asOf)}.{' '}
              <AppLink to="/reports/prendite" search={{ zeitraum: 'YTD' }}>
                Vergleich öffnen →
              </AppLink>
              {!world && (
                <>
                  {' '}
                  ·{' '}
                  <AppLink to="/einstellungen/depots" hash="benchmark-settings-title">
                    Benchmark auswählen
                  </AppLink>
                </>
              )}
            </p>
          )}
        </section>
        {view?.assetComposition && <AssetComposition point={view.assetComposition} />}
        <p className="vnote">
          Finanzielle Freiheit ≈{' '}
          {freedom.data?.progressBp == null
            ? 'nicht verfügbar'
            : `${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(freedom.data.progressBp / 100)} %`}{' '}
          · Annahme: {freedom.data?.multiple ?? '—'} Jahresausgaben.{' '}
          <AppLink to="/vermoegen/freiheit">Ausgabenbasis und Annahmen öffnen →</AppLink>
        </p>
        <p className="vnote">
          <AppLink to="/vermoegen/portfolio/kennzahlen" search={{ zeitraum: period }}>
            Bestehende Portfolio-Kennzahlen
          </AppLink>{' '}
          · <AppLink to="/reports/vermoegen-schulden">Vermögensreport</AppLink>
        </p>
      </div>
    </WealthFrame>
  );
}
