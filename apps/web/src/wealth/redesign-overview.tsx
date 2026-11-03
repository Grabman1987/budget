import { Button, useAmountPrivacy, privateAmount } from '@budget/ui';
import { accountsQuery } from '../ledger/queries';
import { freedomSumCents } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Info, Scale, Flag } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { VERMOEGEN_NETTO_META } from '../nav/pages';
import { AppLink } from '../shell/app-link';
import { ErrorNote, LoadingNote, EmptyNote } from '../ledger/states';
import { eur, longDay } from '../ledger/format';
import { ValuationHint } from '../ledger/valuation-hint';
import { ppText, percentText } from '../pages/portfolio-report-shared';
import { netWorthQuery } from './api';
import { freedomQuery } from './freedom-api';
import { savingsProposalsQuery, type SavingsExecutionProposal } from './savings-api';
import { portfolioContributionsQuery, portfolioPerformanceQuery } from './portfolio-api';
import { allocationQuery, type PortfolioAllocationView } from './allocation-api';
import { OverviewChart } from './overview-chart';
import { useZeitraum, ZEITRAUM_VALUES } from './zeitraum';
import { WealthFrame, WealthReadStatus } from './redesign-frame';
import { TradePanel } from './trade-panel';
import { percentText as rawShareText } from './portfolio-format';

export function WealthOverview() {
  useAmountPrivacy();
  const [period, setPeriod] = useZeitraum('1J');
  // The lead always compares the current month; chart period is independent.
  const accounts = useQuery(accountsQuery());
  const monthRange = accounts.data
    ? (`${accounts.data.asOf.slice(0, 7)}..${accounts.data.asOf.slice(0, 7)}` as const)
    : null;
  const net = useQuery({ ...netWorthQuery(monthRange ?? '1M'), enabled: !!monthRange });
  const freedom = useQuery(freedomQuery());
  const proposals = useQuery(savingsProposalsQuery());
  const allocation = useQuery(allocationQuery());
  const chart = useQuery(portfolioContributionsQuery(period));
  const ytd = useQuery(portfolioPerformanceQuery('YTD'));
  const [allActions, setAllActions] = useState(false);
  const [proposal, setProposal] = useState<SavingsExecutionProposal | null>(null);
  const view = net.data;
  const history = chart.data?.portfolio.contributionHistory;
  const world = ytd.data?.portfolio.benchmarks.find((row) => row.id === 'benchmark-ftse');
  const portfolioReturn = ytd.data?.portfolio.performance?.ttwror;
  const comparison =
    portfolioReturn == null || world?.benchmarkReturn == null
      ? null
      : portfolioReturn - world.benchmarkReturn;
  const actions: { id: string; icon: ReactNode; text: ReactNode; action: ReactNode }[] = [
    ...(proposals.data?.proposals ?? []).map((row) => ({
      id: row.id,
      icon: <CircleAlert size={17} />,
      text: (
        <>
          Sparplan {row.securityName}: Ausführung vom {longDay(row.date)} fehlt
        </>
      ),
      action: (
        <Button variant="ghost" onClick={() => setProposal(row)}>
          Prüfen
        </Button>
      ),
    })),
    ...(view?.incomplete ?? [])
      .filter((row) => row.unitsE8 === undefined || row.unitsE8 > 0)
      .map((row) => ({
        id: `quote:${row.securityId}`,
        icon: <Info size={17} />,
        text: (
          <>
            {row.name ?? 'Instrument'}: Kurs fehlt
            {row.quality === 'estimated' ? ', Einstand wird verwendet' : ''}
          </>
        ),
        action: (
          <AppLink
            className="wealth-action"
            to={`/vermoegen/portfolio/instrument/${encodeURIComponent(row.securityId)}`}
            search={{ zeitraum: period }}
          >
            Kurs eintragen
          </AppLink>
        ),
      })),
    ...(!allocation.data || allocation.data.quality.confidence === 'provisional'
      ? []
      : (allocation.data.risk?.allocation.rows
          .filter((row) => row.side === 'under' && row.targetBp !== null)
          .map((row) => ({
            id: `target:${row.assetClass}`,
            icon: <Scale size={17} />,
            text: (
              <>
                {allocation.data.classes.find((cls) => cls.id === row.assetClass)?.name ??
                  'Anlageklasse'}{' '}
                {eur(Math.abs(row.gapCents))} unter Ziel laut deiner Zielallokation
              </>
            ),
            action: (
              <AppLink
                className="wealth-action"
                to="/vermoegen/portfolio/sparplaene"
                hash="funding-plan-title"
                aria-label="Nächste Einzahlung vormerken"
                title="Nächste Einzahlung vormerken"
              >
                Vormerken
              </AppLink>
            ),
          })) ?? [])),
  ];
  const assets = view
    ? freedomSumCents(view.composition.assets.map((row) => row.valueCents))
    : null;
  const debts = view
    ? freedomSumCents(view.composition.debts.map((row) => Math.abs(row.valueCents)))
    : null;
  const point = view?.assetComposition;
  const cash = point?.groups.filter((row) => row.key === 'cash' || row.key === 'depot_cash');
  const groups = point
    ? [
        ...(cash?.some((row) => row.accounts.length)
          ? [
              {
                ...cash[0]!,
                key: 'cash' as const,
                label: 'Konten & Bargeld',
                valueCents: cash.some((row) => row.valueCents === null)
                  ? null
                  : freedomSumCents(cash.map((row) => row.valueCents!)),
                shareBp: cash.every((row) => row.shareBp !== null)
                  ? cash.reduce((sum, row) => sum + row.shareBp!, 0)
                  : null,
              },
            ]
          : []),
        ...point.groups.filter(
          (row) => row.key !== 'cash' && row.key !== 'depot_cash' && row.accounts.length > 0,
        ),
      ]
    : [];
  const month = view
    ? new Intl.DateTimeFormat('de-AT', { month: 'long', timeZone: 'UTC' }).format(new Date(view.to))
    : '';
  return (
    <WealthFrame meta={VERMOEGEN_NETTO_META} page="overview" date={view?.to}>
      <div className="wealth-overview">
        {accounts.isError && (
          <ErrorNote
            what="Datenstand"
            error={accounts.error}
            onRetry={() => void accounts.refetch()}
          />
        )}
        {net.isPending && !accounts.isError && <LoadingNote what="Nettovermögen" />}
        {net.isError && (
          <ErrorNote what="Nettovermögen" error={net.error} onRetry={() => void net.refetch()} />
        )}
        {view && (
          <>
            <section className="wealth-lead" aria-labelledby="wealth-net-title">
              <div>
                <h2 id="wealth-net-title">Nettovermögen</h2>
                <div className="wealth-figure" data-testid="wealth-net-value">
                  {eur(view.chain.nowCents)}
                </div>
                <p className="wealth-month">
                  {month}{' '}
                  <strong>
                    {view.chain.deltaCents == null
                      ? '—'
                      : `${view.chain.deltaCents > 0 ? '+ ' : ''}${eur(view.chain.deltaCents)}`}
                  </strong>
                </p>
              </div>
              <div className="wealth-net-chain" aria-label="Zusammensetzung Nettovermögen">
                <div>
                  <span>
                    Vermögen <b>{assets === null ? '—' : eur(assets)}</b>
                  </span>
                  <span>
                    − Schulden <b>{debts === null ? '—' : eur(debts)}</b>
                  </span>
                  <span>
                    = Netto <b>{eur(view.chain.nowCents)}</b>
                  </span>
                </div>
                {assets !== null && debts !== null && assets > 0 && view.chain.nowCents >= 0 && (
                  <div className="wealth-thin-chain" aria-hidden="true">
                    <i style={{ flex: view.chain.nowCents }} />
                    <i className="wealth-hatched" style={{ flex: debts }} />
                  </div>
                )}
              </div>
            </section>
            <ValuationHint incomplete={view.incomplete} />
            {view.composition.assets.length === 0 && view.composition.debts.length === 0 && (
              <EmptyNote>
                Noch keine Konten. <AppLink to="/konten">Konto anlegen</AppLink>
              </EmptyNote>
            )}
          </>
        )}
        <div className="wealth-overview-work">
          <section className="wealth-sheet wealth-next" aria-labelledby="wealth-next-title">
            <div className="wealth-section-head">
              <h2 id="wealth-next-title">Als Nächstes</h2>
              <span className="vnote">
                {proposals.isSuccess && allocation.isSuccess
                  ? `${actions.length} offen`
                  : 'Wird geprüft …'}
              </span>
            </div>
            {proposals.isPending && <LoadingNote what="Sparplanausführungen" />}
            {proposals.isError && (
              <ErrorNote
                what="Sparplanausführungen"
                error={proposals.error}
                onRetry={() => void proposals.refetch()}
              />
            )}
            {allocation.isError && (
              <ErrorNote
                what="Zielallokation"
                error={allocation.error}
                onRetry={() => void allocation.refetch()}
              />
            )}
            <ul className="wealth-action-list">
              {(allActions ? actions : actions.slice(0, 4)).map((row) => (
                <li key={row.id}>
                  <span className="wealth-next-icon">{row.icon}</span>
                  <span className="wealth-next-text">{row.text}</span>
                  {row.action}
                </li>
              ))}
            </ul>
            {!actions.length && proposals.isSuccess && allocation.isSuccess && (
              <p className="wealth-all-done">
                <CircleCheck size={18} />
                Alles erledigt
              </p>
            )}
            {actions.length > 4 && (
              <div className="wealth-next-more">
                {actions.length - 4} weitere …{' '}
                <button type="button" onClick={() => setAllActions(!allActions)}>
                  {allActions ? 'Weniger anzeigen' : 'Alle anzeigen'}
                </button>
              </div>
            )}
          </section>
          <section className="wealth-sheet wealth-course" aria-labelledby="wealth-course-title">
            <div className="wealth-section-head">
              <h2 id="wealth-course-title">Investiert: Wert vs. eingezahlt</h2>
              <label>
                <span className="sr-only">Zeitraum</span>
                <select
                  aria-label="Zeitraum"
                  value={period}
                  onChange={(event) => setPeriod(event.target.value as typeof period)}
                >
                  {ZEITRAUM_VALUES.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <AppLink to="/reports/peinzahlungen" search={{ zeitraum: period }}>
                Ganze Auswertung →
              </AppLink>
            </div>
            {chart.isPending && <LoadingNote what="Wert und Einzahlungen" />}
            {chart.isError && (
              <ErrorNote
                what="Wert und Einzahlungen"
                error={chart.error}
                onRetry={() => void chart.refetch()}
              />
            )}
            {history?.daily.length ? (
              <OverviewChart history={history} />
            ) : (
              chart.isSuccess && (
                <EmptyNote>
                  Noch keine vollständige Wertpapierhistorie für diesen Zeitraum.
                </EmptyNote>
              )
            )}
            <div className="wealth-benchmark" role="region" aria-label="Weltaktienvergleich YTD">
              {ytd.isPending && <LoadingNote what="YTD-Vergleich" />}
              {ytd.isError && (
                <ErrorNote
                  what="YTD-Vergleich"
                  error={ytd.error}
                  onRetry={() => void ytd.refetch()}
                />
              )}
              {ytd.data && (
                <>
                  <span>Rendite YTD {privateAmount(percentText(portfolioReturn))} · </span>
                  {world ? (
                    <span>Weltaktien {privateAmount(percentText(world.benchmarkReturn))}</span>
                  ) : (
                    <AppLink to="/einstellungen/depots" hash="benchmark-settings-title">
                      Weltaktien auswählen
                    </AppLink>
                  )}
                  <AppLink to="/reports/prendite" search={{ zeitraum: 'YTD' }}>
                    → Vermögensreport
                  </AppLink>
                  <span className="sr-only">
                    Differenz{' '}
                    {comparison === null ? 'Nicht verfügbar' : privateAmount(ppText(comparison))}
                  </span>
                </>
              )}
            </div>
          </section>
        </div>
        <section
          className="wealth-sheet wealth-composition"
          aria-labelledby="wealth-composition-title"
        >
          <div className="wealth-section-head">
            <h2 id="wealth-composition-title">Zusammensetzung nach Anlageart</h2>
            <span>
              <AppLink to="/reports/vermoegen-schulden">Vermögensreport →</AppLink>
              <AppLink to="/reports/psteuern">Kosten, Steuern, Erträge →</AppLink>
            </span>
          </div>
          <table className="wealth-table">
            <thead>
              <tr>
                <th>Anlageart</th>
                <th className="num">Wert</th>
                <th className="num">Anteil</th>
                <th>Ist vs. Ziel</th>
                <th>
                  <span className="sr-only">Öffnen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((row) => {
                const to =
                  row.key === 'debt'
                    ? '/vermoegen/schulden'
                    : ['cash', 'depot_cash', 'unclassified'].includes(row.key)
                      ? '/konten'
                      : '/vermoegen/portfolio/positionen';
                const deviation = assetTypeDeviation(allocation.data, row.key);
                return (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    <td className="num">
                      {row.valueCents === null ? 'Nicht verfügbar' : eur(row.valueCents)}
                    </td>
                    <td className="num">{shareText(row.shareBp)}</td>
                    <td>
                      {deviation === null ? (
                        <span title="Keine vergleichbare Zielquote für diese Anlageart im ausgewählten Anlageuniversum">
                          —
                        </span>
                      ) : (
                        <AppLink
                          className="wealth-pill"
                          to="/vermoegen/portfolio/allokation"
                          title="Abweichung im ausgewählten Anlageuniversum, einschließlich Anlage-Kassa"
                        >
                          {shareText(deviation, true).replace('%', 'Pp')} zum Ziel
                        </AppLink>
                      )}
                    </td>
                    <td>
                      <AppLink
                        to={to}
                        search={
                          row.key === 'crypto'
                            ? { anlageart: 'krypto' }
                            : row.key === 'securities'
                              ? { anlageart: 'wertpapiere' }
                              : {}
                        }
                      >
                        {to === '/konten'
                          ? 'Konten'
                          : row.key === 'debt'
                            ? 'Schulden'
                            : 'Positionen'}{' '}
                        →
                      </AppLink>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {view && (
              <tfoot>
                <tr>
                  <th>Nettovermögen</th>
                  <td className="num">{eur(view.chain.nowCents)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
          {!groups.length && net.isSuccess && (
            <EmptyNote>Zusammensetzung noch nicht verfügbar.</EmptyNote>
          )}
          <p className="vnote">
            Anteil am Nettovermögen; bei unvollständiger Bewertung nicht verfügbar. Ziele gelten für
            das ausgewählte Anlageuniversum.{' '}
            <AppLink to="/vermoegen/portfolio/allokation">Ist und Ziel vergleichen →</AppLink>
          </p>
        </section>
        <p className="wealth-freedom">
          <Flag size={15} />
          Finanzielle Freiheit{' '}
          {freedom.data?.progressBp == null
            ? 'nicht verfügbar'
            : privateAmount(
                `${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(freedom.data.progressBp / 100)} %`,
              )}{' '}
          · Investiert{' '}
          <strong data-testid="wealth-invested">
            {freedom.data?.investedCents == null
              ? 'Nicht verfügbar'
              : eur(freedom.data.investedCents)}
          </strong>
          <AppLink to="/vermoegen/freiheit">Report →</AppLink>
        </p>
        {freedom.isError && (
          <ErrorNote
            what="Anlagebasis"
            error={freedom.error}
            onRetry={() => void freedom.refetch()}
          />
        )}
        <details className="wealth-details">
          <summary>Datenbasis und bestehende Auswertungen</summary>
          <p className="vnote">
            Investiert: ausgewählte Anlagebasis einschließlich negativer Verrechnungskassa.{' '}
            <AppLink to="/vermoegen/freiheit" hash="freedom-account-title">
              Quellkonten
            </AppLink>
            . Die Chartlinie „Eingezahlt“ zeigt den Anfangswert plus Nettozuflüsse im gewählten
            Zeitraum, keine historischen Anschaffungskosten. Wertpapiere ohne Depot-Bargeld; Kurse
            können fortgeschrieben sein.
          </p>
          <WealthReadStatus
            fetching={net.isFetching}
            paused={net.isPaused}
            date={view ? longDay(view.to) : undefined}
          />
          <AppLink to="/vermoegen/nettovermoegen" search={{ ansicht: 'analyse', zeitraum: period }}>
            Nettovermögen und Verlauf im Detail
          </AppLink>{' '}
          ·{' '}
          <AppLink to="/vermoegen/portfolio" search={{ ansicht: 'analyse', zeitraum: period }}>
            Bestehende Portfolioanalyse
          </AppLink>{' '}
          ·{' '}
          <AppLink to="/vermoegen/portfolio/kennzahlen" search={{ zeitraum: period }}>
            Bestehende Portfolio-Kennzahlen
          </AppLink>
        </details>
      </div>
      {proposal && (
        <TradePanel
          id="neu"
          proposal={proposal}
          onClose={() => setProposal(null)}
          onSaved={() => setProposal(null)}
        />
      )}
    </WealthFrame>
  );
}

/** Project only whole, unambiguously assigned policy classes; mixed classes have no type target. */
export function assetTypeDeviation(
  view: PortfolioAllocationView | undefined,
  type: string,
): number | null {
  if (
    !view?.risk ||
    view.valueCents === null ||
    view.valueCents <= 0 ||
    view.quality.confidence === 'provisional'
  )
    return null;
  const matches = (kind: string) =>
    type === 'crypto'
      ? kind === 'crypto'
      : type === 'other'
        ? ['p2p', 'other'].includes(kind)
        : type === 'securities'
          ? ['etf', 'stock', 'fund', 'bond', 'commodity'].includes(kind)
          : false;
  const classes = view.classes.filter((row) =>
    row.assignedSecurities.some((security) => matches(security.kind)),
  );
  if (
    !classes.length ||
    classes.some((row) => !row.assignedSecurities.every((security) => matches(security.kind)))
  )
    return null;
  const deviations = classes.map(
    (cls) => view.risk!.allocation.rows.find((row) => row.assetClass === cls.id)?.deviationBp,
  );
  return deviations.some((value) => value == null)
    ? null
    : deviations.reduce<number>((sum, value) => sum + value!, 0);
}

const shareText = (...args: Parameters<typeof rawShareText>) =>
  privateAmount(rawShareText(...args));
