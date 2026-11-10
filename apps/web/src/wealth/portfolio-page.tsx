import { useAmountPrivacy, Button, DimensionChain, privateAmount } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { periodWindow, ratioBp, type Period } from '@budget/domain';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { VERMOEGEN_PORTFOLIO_META } from '../nav/pages';
import { WealthFrame, useAssetType, WealthReadStatus } from './redesign-frame';
import { matchesAsset } from './redesign-filters';
import { WealthActivities, InvestmentAccounts } from './redesign-positions';
import { ErrorNote, LoadingNote, EmptyNote } from '../ledger/states';
import { ValuationHint } from '../ledger/valuation-hint';
import { eurParts, eurWhole, longDay } from '../ledger/format';
import {
  portfolioPositionsQuery,
  portfolioPerformanceQuery,
  instrumentsQuery,
  type PortfolioPosition,
  type PortfolioPositionsView,
} from './portfolio-api';
import {
  basisReason,
  moneyText,
  percentText,
  quoteText,
  quoteStand,
  unitsText,
} from './portfolio-format';
import { InstrumentPanel } from './portfolio-panel';
import { INSTRUMENT_KIND } from './instrument-form';
import { SavingsSection } from './savings-section';
import { TradePanel } from './trade-panel';
import './portfolio.css';
import { PortfolioAllocation } from './allocation-section';
import { PortfolioOverview } from './portfolio-overview';
import { PortfolioRiskContext } from './portfolio-risk-context';
import { PortfolioClassHistories } from './portfolio-class-histories';
import { PortfolioMetrics } from './portfolio-metrics';
import {
  PortfolioRegisters,
  portfolioRegisterPath,
  type PortfolioRegister,
} from './portfolio-registers';
import { useZeitraum } from './zeitraum';
import { ZeitraumSwitch } from './frame';
import { PositionsV3 } from './positions-v3';
import { WealthOverview } from './redesign-overview';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';

export function PortfolioPositionsPage() {
  return <PortfolioPage register="positions" />;
}
export function PortfolioAllocationPage() {
  return <PortfolioPage register="allocation" />;
}
export function PortfolioSavingsPage() {
  return <PortfolioPage register="savings" />;
}
export function PortfolioMetricsPage() {
  return <PortfolioPage register="metrics" />;
}

export function PortfolioPage({ register = 'overview' }: { register?: PortfolioRegister }) {
  const search = useSearch({ strict: false }) as { ansicht?: string };
  return REDESIGN_ENABLED && register === 'overview' && search.ansicht !== 'analyse' ? (
    <WealthOverview />
  ) : (
    <PortfolioBody register={register} />
  );
}

function PortfolioBody({ register }: { register: PortfolioRegister }) {
  useAmountPrivacy();
  const [period] = useZeitraum();
  const search = useSearch({ strict: false }) as {
    produkt?: string;
    handel?: string;
    sparplan?: string;
    zeitraum?: Period;
    anlageart?: string;
    ansicht?: string;
  };
  const art = useAssetType();
  const datedPositions = register === 'overview' || register === 'positions';
  const performance = useQuery({ ...portfolioPerformanceQuery(period), enabled: datedPositions });
  // Keep the existing current-position read usable if only historical performance is unavailable.
  // A successful period read selects the identical historical endpoint for the lead and table.
  const selectedEnd = performance.data
    ? (performance.data.portfolio.performance?.to ??
      periodWindow(period, performance.data.portfolio.asOf).to)
    : undefined;
  const query = useQuery({
    ...portfolioPositionsQuery(selectedEnd),
    enabled: datedPositions || search.produkt === 'neu' || !!search.handel,
  });
  const path = portfolioRegisterPath(register);
  const instruments = useQuery({
    ...instrumentsQuery(),
    enabled: register === 'positions' || search.produkt === 'neu' || !!search.handel,
  });
  const navigate = useNavigate();
  const select = (produkt?: string, replace = false) =>
    void navigate(
      produkt && produkt !== 'neu'
        ? {
            to: '/vermoegen/portfolio/instrument/$id',
            params: { id: produkt },
            search: {
              zeitraum: search.zeitraum,
              ...(REDESIGN_ENABLED ? { anlageart: search.anlageart, ansicht: search.ansicht } : {}),
            },
            state: { wealthDetailOpenedInApp: true },
            replace,
          }
        : {
            to: path,
            search: {
              zeitraum: search.zeitraum,
              produkt,
              ...(REDESIGN_ENABLED ? { anlageart: search.anlageart, ansicht: search.ansicht } : {}),
            },
          },
    );
  const trade = (handel?: string, produkt = search.produkt) =>
    void navigate({
      to: path,
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        produkt,
        handel,
        fokus: handel ? prev['fokus'] : undefined,
        allokation: undefined,
        sparplan: undefined,
      })) as never,
    });
  const view = datedPositions && performance.isPending ? undefined : query.data;
  const held = new Set(view?.classes.flatMap((group) => group.positions.map((p) => p.securityId)));
  const visibleSecurity = (id: string) => {
    if (!REDESIGN_ENABLED || art === 'alle') return true;
    const security = instruments.data?.securities.find((row) => row.id === id);
    return !!security && matchesAsset(security.kind, art);
  };
  const groups = view?.classes
    .map((group) => ({
      ...group,
      positions: group.positions.filter((position) => visibleSecurity(position.securityId)),
    }))
    .filter((group) => group.positions.length);
  const unheld = instruments.data?.securities.filter(
    (security) => !held.has(security.id) && visibleSecurity(security.id),
  );
  return (
    <WealthFrame
      legacy={register === 'overview' || register === 'metrics'}
      meta={VERMOEGEN_PORTFOLIO_META}
      date={datedPositions ? view?.asOf : undefined}
      controls={
        REDESIGN_ENABLED && register === 'positions' ? (
          <>
            <div
              className="wealth-position-mode wealth-position-mode-desktop"
              role="group"
              aria-label="Positionen anzeigen"
            >
              <Button
                variant="ghost"
                aria-pressed={search.ansicht !== 'aktivitaeten'}
                onClick={() =>
                  void navigate({
                    to: '.',
                    search: ((prev: Record<string, unknown>) => ({
                      ...prev,
                      ansicht: undefined,
                    })) as never,
                    replace: true,
                  })
                }
              >
                Positionen
              </Button>
              <Button
                variant="ghost"
                aria-pressed={search.ansicht === 'aktivitaeten'}
                onClick={() =>
                  void navigate({
                    to: '.',
                    search: ((prev: Record<string, unknown>) => ({
                      ...prev,
                      ansicht: 'aktivitaeten',
                    })) as never,
                    replace: true,
                  })
                }
              >
                Aktivitäten
              </Button>
            </div>
            <ZeitraumSwitch />
          </>
        ) : register === 'allocation' && REDESIGN_ENABLED ? (
          <span className="wealth-grouping">
            Gruppieren nach <b>Anlageklasse</b>
          </span>
        ) : undefined
      }
      page={
        register === 'positions'
          ? 'positions'
          : register === 'savings'
            ? 'savings'
            : register === 'allocation'
              ? 'allocation'
              : 'overview'
      }
    >
      {(!REDESIGN_ENABLED || register === 'overview' || register === 'metrics') && (
        <PortfolioRegisters current={register} period={period} />
      )}
      <div className="kview vview portfolio-view">
        {datedPositions && performance.isError && (
          <ErrorNote
            what="Portfoliozeitraum"
            error={performance.error}
            onRetry={() => void performance.refetch()}
          />
        )}
        {datedPositions && performance.isPending && <LoadingNote what="Portfoliozeitraum" />}
        {datedPositions && (
          <>
            {query.isPending && !performance.isPending && <LoadingNote what="Positionen" />}
            {query.isError && (
              <ErrorNote
                what="Positionen"
                error={query.error}
                onRetry={() => void query.refetch()}
              />
            )}
            <ValuationHint incomplete={query.data?.incomplete} />
            {view && (!REDESIGN_ENABLED || register === 'overview') && (
              <PortfolioLead view={view} />
            )}
            {view && performance.isError && (
              <p className="vnote">
                Die Zeitraum-Auswertung ist nicht verfügbar. Der separat bewertete Bestand oben gilt
                für {longDay(view.asOf)}; ein Vergleich mit einem fehlenden Kurvenendpunkt ist nicht
                möglich.
              </p>
            )}
            {register === 'positions' && !REDESIGN_ENABLED && <ZeitraumSwitch />}
          </>
        )}
        {register === 'overview' && (
          <>
            <PortfolioOverview />
            {performance.isSuccess && performance.data.portfolio.performanceHistory && (
              <PortfolioClassHistories history={performance.data.portfolio.performanceHistory} />
            )}
            <div className="instrument-actions">
              <Button variant="ghost" onClick={() => select('neu')}>
                Instrument anlegen
              </Button>
              <Button onClick={() => trade('neu', undefined)}>Handel erfassen</Button>
            </div>
            <PortfolioRiskContext />
          </>
        )}
        {register === 'positions' && REDESIGN_ENABLED && (
          <>
            {instruments.isPending && <LoadingNote what="Instrumente" />}
            {instruments.isError && (
              <ErrorNote
                what="Instrumente"
                error={instruments.error}
                onRetry={() => void instruments.refetch()}
              />
            )}
            {query.isPaused && (
              <p className="vnote" role="status">
                Offline · letzter verfügbarer Stand {view ? longDay(view.asOf) : 'nicht verfügbar'}
              </p>
            )}
          </>
        )}
        {register === 'positions' && REDESIGN_ENABLED && view && (
          <PositionsV3
            view={view}
            securities={instruments.data?.securities ?? []}
            art={art}
            period={period}
            activities={search.ansicht === 'aktivitaeten'}
            onMode={(active) =>
              void navigate({
                to: '.',
                search: ((prev: Record<string, unknown>) => ({
                  ...prev,
                  ansicht: active ? 'aktivitaeten' : undefined,
                })) as never,
                replace: true,
              })
            }
            onSelect={select}
            onTrade={trade}
          />
        )}
        {register === 'positions' && !REDESIGN_ENABLED && (
          <>
            {REDESIGN_ENABLED && (
              <>
                <WealthReadStatus
                  fetching={query.isFetching}
                  paused={query.isPaused}
                  date={view ? longDay(view.asOf) : undefined}
                />
                <p className="vnote">
                  Anlageart filtert die Liste. Portfoliowert, Gewinn und Anteilsbasis beziehen sich
                  weiterhin auf den gesamten bewerteten Instrumentenbestand.
                </p>
                <div className="wealth-position-mode" role="group" aria-label="Positionen anzeigen">
                  <Button
                    variant="ghost"
                    aria-pressed={search.ansicht !== 'aktivitaeten'}
                    onClick={() =>
                      void navigate({
                        to: '.',
                        search: ((prev: Record<string, unknown>) => ({
                          ...prev,
                          ansicht: undefined,
                        })) as never,
                        replace: true,
                      })
                    }
                  >
                    Positionen
                  </Button>
                  <Button
                    variant="ghost"
                    aria-pressed={search.ansicht === 'aktivitaeten'}
                    onClick={() =>
                      void navigate({
                        to: '.',
                        search: ((prev: Record<string, unknown>) => ({
                          ...prev,
                          ansicht: 'aktivitaeten',
                        })) as never,
                        replace: true,
                      })
                    }
                  >
                    Aktivitäten
                  </Button>
                </div>
              </>
            )}
            <div className="instrument-actions">
              <Button variant="ghost" onClick={() => select('neu')}>
                Instrument anlegen
              </Button>
              <Button onClick={() => trade('neu', undefined)}>Handel erfassen</Button>
            </div>

            {REDESIGN_ENABLED && search.ansicht === 'aktivitaeten' ? (
              <WealthActivities
                art={art}
                from={
                  performance.data?.portfolio.performance?.from ??
                  (view ? periodWindow(period, view.asOf).from : undefined)
                }
                to={view?.asOf}
                onEdit={(id, security) => trade(id, security)}
              />
            ) : (
              view && (
                <>
                  {groups?.length === 0 ? (
                    <EmptyNote>Keine Positionen zum {longDay(view.asOf)} vorhanden.</EmptyNote>
                  ) : (
                    <section className="portfolio-positions" aria-labelledby="positions-title">
                      <div className="head">
                        <h2 id="positions-title" tabIndex={-1} ref={focusPositionHeading}>
                          Positionen
                        </h2>
                        <span className="aside">
                          {view.costCents === null
                            ? basisReason(
                                view.classes.flatMap((g) => g.positions.flatMap((p) => p.accounts)),
                              )
                            : `Einstand ${eurWhole(view.costCents)}`}
                        </span>
                      </div>
                      <table className="ktable vtable portfolio-table">
                        <caption className="sr-only">Positionen nach Anlageklasse</caption>
                        <thead>
                          <tr>
                            <th scope="col" className="tech">
                              Pos.
                            </th>
                            <th scope="col" className="tech">
                              Position
                            </th>
                            <th scope="col" className="tech">
                              Plattform
                            </th>
                            <th scope="col" className="num tech">
                              Stück
                            </th>
                            <th scope="col" className="num tech">
                              Kurs
                            </th>
                            <th scope="col" className="num tech">
                              Wert
                            </th>
                            <th scope="col" className="num tech">
                              Anteil · Marktwert
                            </th>
                            <th scope="col" className="num tech">
                              seit Kauf
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {groups?.map((group, gi) => (
                            <GroupRows
                              key={group.id ?? 'none'}
                              group={group}
                              gi={gi}
                              onSelect={select}
                            />
                          ))}
                        </tbody>
                      </table>
                      <p className="vnote">
                        Anteil = Klassen- oder Positionswert / Marktwert aller gehaltenen
                        Wertpapiere ({moneyText(view.valueCents)}), ohne Kassa. Die Aufteilung
                        Soll/Ist verwendet dagegen das ausgewählte Netto-Allokationsuniversum
                        einschließlich Anlage-Kassa.
                      </p>
                      <p className="vnote">
                        Werte in EUR, Kurse in der gespeicherten Kurswährung. „seit Kauf“ zeigt den
                        Wertzuwachs auf den dokumentierten Einstand (
                        {view.costMethod === 'fifo' ? 'FIFO' : 'gleitender Durchschnitt'}).
                      </p>
                    </section>
                  )}
                </>
              )
            )}

            {REDESIGN_ENABLED && <InvestmentAccounts art={art} />}
            {instruments.isPending && <LoadingNote what="Instrumente" />}
            {instruments.isError && (
              <ErrorNote
                what="Instrumente"
                error={instruments.error}
                onRetry={() => void instruments.refetch()}
              />
            )}
            {view && unheld && unheld.length > 0 && (
              <details className="instrument-catalog">
                <summary>Instrumente ohne Bestand ({unheld.length})</summary>
                <table className="ktable">
                  <caption className="sr-only">Instrumente ohne aktuellen Bestand</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="tech">
                        Instrument
                      </th>
                      <th scope="col" className="tech">
                        Art
                      </th>
                      <th scope="col" className="tech">
                        Währung
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {unheld.map((security) => (
                      <tr key={security.id}>
                        <td>
                          <button
                            type="button"
                            className="portfolio-product"
                            data-portfolio-security={security.id}
                            onClick={() => select(security.id)}
                          >
                            {security.name}
                          </button>
                        </td>
                        <td>{INSTRUMENT_KIND[security.kind]}</td>
                        <td>{security.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </>
        )}
        {register === 'allocation' && <PortfolioAllocation />}
        {register === 'savings' && (
          <SavingsSection
            navigationPath="/vermoegen/portfolio/sparplaene"
            art={REDESIGN_ENABLED ? art : 'alle'}
          />
        )}
        {register === 'metrics' && <PortfolioMetrics />}
      </div>
      {search.sparplan ? null : search.handel ? (
        <TradePanel
          key={search.handel}
          id={search.handel}
          securityId={search.produkt === 'neu' ? undefined : search.produkt}
          onClose={() => trade()}
          onSaved={(id) => trade(undefined, id)}
        />
      ) : search.produkt === 'neu' ? (
        <InstrumentPanel
          id="neu"
          initialKind={REDESIGN_ENABLED && art === 'krypto' ? 'crypto' : undefined}
          position={(view?.positions ?? view?.classes.flatMap((g) => g.positions) ?? []).find(
            (p) => p.securityId === search.produkt,
          )}
          asOf={view?.asOf}
          onClose={() => select()}
          onSelect={select}
          positionState={query.isError ? 'unavailable' : query.isPending ? 'loading' : 'ready'}
          onRetryPositions={() => void query.refetch()}
          onTrade={trade}
        />
      ) : null}
    </WealthFrame>
  );
}
function PortfolioLead({ view }: { view: PortfolioPositionsView }) {
  useAmountPrivacy();
  const parts = view.valueCents === null ? null : eurParts(view.valueCents);
  return (
    <section className="vnw portfolio-lead" aria-labelledby="portfolio-title">
      <div className="tbd-head">
        <h2 id="portfolio-title">Portfolio</h2>
        <span className="tbd-state">{longDay(view.asOf)}</span>
      </div>
      <div className="tbd-fig" data-testid="portfolio-value">
        {parts ? (
          <>
            {parts.whole}
            <span className="cents">,{parts.fraction} €</span>
          </>
        ) : (
          <span className="portfolio-unavailable">Bewertung unvollständig</span>
        )}
      </div>
      <p className="vnote portfolio-scope">Wertpapiere ohne Depot-Bargeld</p>
      <p className="portfolio-lead-gain" data-testid="portfolio-gain">
        Gewinn seit Kauf {moneyText(view.gainCents)} ·{' '}
        {percentText(
          view.gainCents !== null && view.costCents !== null && view.costCents > 0
            ? ratioBp(view.gainCents, view.costCents)
            : null,
          true,
        )}
      </p>
      {view.chain ? (
        <DimensionChain terms={view.chain} label="Maßkette Portfoliowert" />
      ) : (
        <p className="vnote portfolio-basis">
          {view.valueCents === null
            ? 'Mindestens ein Kurs oder Wechselkurs fehlt. Der Gesamtwert und die Anteile sind nicht berechenbar.'
            : `${basisReason(view.classes.flatMap((g) => g.positions.flatMap((p) => p.accounts)))}. Der gesamte Wertzuwachs ist nicht berechenbar.`}
        </p>
      )}
    </section>
  );
}
function GroupRows({
  group,
  gi,
  onSelect,
}: {
  group: PortfolioPositionsView['classes'][number];
  gi: number;
  onSelect: (id: string) => void;
}) {
  useAmountPrivacy();
  return (
    <>
      <tr className="kgroup">
        <td className="kc-pos">
          <span className="grp-no">{gi + 1}</span>
        </td>
        <th scope="rowgroup" colSpan={4}>
          {group.name}
        </th>
        <td className="num">{moneyText(group.valueCents)}</td>
        <td className="num">{percentText(group.shareBp)}</td>
        <td />
      </tr>
      {group.positions.map((p, i) => (
        <PositionRow
          key={p.securityId}
          position={p}
          number={`${gi + 1}.${i + 1}`}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
function PositionRow({
  position: p,
  number,
  onSelect,
}: {
  position: PortfolioPosition;
  number: string;
  onSelect: (id: string) => void;
}) {
  useAmountPrivacy();
  const unavailable = p.accounts.some((a) => a.valueStatus === 'missing_price')
    ? 'Kurs fehlt'
    : 'Wechselkurs fehlt';
  const basis = basisReason(p.accounts);
  const gainReason =
    p.valueCents === null ? unavailable : p.costCents === null ? basis : 'Kein positiver Einstand';
  return (
    <tr>
      <td className="kc-pos">
        <span className="pos">{number}</span>
      </td>
      <th scope="row">
        <button
          type="button"
          className="portfolio-product"
          data-portfolio-security={p.securityId}
          onClick={() => onSelect(p.securityId)}
        >
          {p.name}
        </button>
        {REDESIGN_ENABLED && (
          <small className="wealth-phone-position">
            {privateAmount(unitsText(p.unitsE8))} Stück · Kurs {quoteText(p.quote)} ·{' '}
            {quoteStand(p.quote)}
            <br />
            Einstand {moneyText(p.costCents)} · Gewinn {moneyText(p.gainCents)}
            <br />
            {[...new Set(p.accounts.map((a) => a.institution ?? a.name))].join(' · ')}
          </small>
        )}
        {p.exposureWeightBp !== undefined && p.exposureWeightBp < 10000 && (
          <small className="portfolio-status">
            {percentText(p.exposureWeightBp)} Klassengewicht · Stück und Kurs: gesamtes Instrument
          </small>
        )}
        <small className="portfolio-status">
          {p.valueCents === null
            ? unavailable
            : p.accounts.some((a) => a.valueStatus === 'estimated')
              ? 'Wert geschätzt, kein Kurs'
              : p.costCents === null
                ? basis
                : ''}
        </small>
      </th>
      <td className="portfolio-platform">
        {[...new Set(p.accounts.map((a) => a.institution ?? a.name))].join(' · ')}
      </td>
      <td className="num portfolio-units">{unitsText(p.unitsE8)}</td>
      <td className="num portfolio-quote" title={quoteStand(p.quote)}>
        {quoteText(p.quote)}
      </td>
      <td className="num portfolio-value">{moneyText(p.valueCents)}</td>
      <td className="num portfolio-share">{percentText(p.shareBp)}</td>
      <td className="num portfolio-gain" title={p.gainBp === null ? gainReason : undefined}>
        {percentText(p.gainBp, true)}
      </td>
    </tr>
  );
}

/** Focus an explicit allocation drilldown after the asynchronous positions body mounts. */
function focusPositionHeading(element: HTMLHeadingElement | null) {
  if (REDESIGN_ENABLED && element && window.location.hash === '#positions-title') {
    element.scrollIntoView({ block: 'start' });
    element.focus({ preventScroll: true });
  }
}
