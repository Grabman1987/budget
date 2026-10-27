import { useAmountPrivacy, Button, DimensionChain } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { periodWindow, ratioBp, type Period } from '@budget/domain';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { VERMOEGEN_PORTFOLIO_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
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
import { AppLink } from '../shell/app-link';
import {
  PortfolioRegisters,
  portfolioRegisterPath,
  type PortfolioRegister,
} from './portfolio-registers';
import { useZeitraum } from './zeitraum';
import { ZeitraumSwitch } from './frame';

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
  useAmountPrivacy();
  const [period] = useZeitraum();
  const search = useSearch({ strict: false }) as {
    produkt?: string;
    handel?: string;
    sparplan?: string;
    zeitraum?: Period;
  };
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
            search: { zeitraum: search.zeitraum },
            state: { wealthDetailOpenedInApp: true },
            replace,
          }
        : {
            to: path,
            search: { zeitraum: search.zeitraum, produkt },
          },
    );
  const trade = (handel?: string, produkt = search.produkt) =>
    void navigate({
      to: path,
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        produkt,
        handel,
        allokation: undefined,
        sparplan: undefined,
      })) as never,
    });
  const view = datedPositions && performance.isPending ? undefined : query.data;
  const held = new Set(view?.classes.flatMap((group) => group.positions.map((p) => p.securityId)));
  const unheld = instruments.data?.securities.filter((security) => !held.has(security.id));
  return (
    <PageFrame meta={VERMOEGEN_PORTFOLIO_META}>
      <PortfolioRegisters current={register} period={period} />
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
            {view && <PortfolioLead view={view} />}
            {view && performance.isError && (
              <p className="vnote">
                Die Zeitraum-Auswertung ist nicht verfügbar. Der separat bewertete Bestand oben gilt
                für {longDay(view.asOf)}; ein Vergleich mit einem fehlenden Kurvenendpunkt ist nicht
                möglich.
              </p>
            )}
            {register === 'positions' && <ZeitraumSwitch />}
          </>
        )}
        {register === 'overview' && (
          <>
            <PortfolioOverview />
            <div className="instrument-actions">
              <Button variant="ghost" onClick={() => select('neu')}>
                Instrument anlegen
              </Button>
              <Button onClick={() => trade('neu', undefined)}>Handel erfassen</Button>
            </div>
          </>
        )}
        {register === 'positions' && (
          <>
            <div className="instrument-actions">
              <Button variant="ghost" onClick={() => select('neu')}>
                Instrument anlegen
              </Button>
              <Button onClick={() => trade('neu', undefined)}>Handel erfassen</Button>
            </div>

            {view && (
              <>
                {view.classes.length === 0 ? (
                  <EmptyNote>Keine Positionen zum {longDay(view.asOf)} vorhanden.</EmptyNote>
                ) : (
                  <section className="portfolio-positions" aria-labelledby="positions-title">
                    <div className="head">
                      <h2 id="positions-title">Positionen</h2>
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
                        {view.classes.map((group, gi) => (
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
                      Anteil = Klassen- oder Positionswert / Marktwert aller gehaltenen Wertpapiere
                      ({moneyText(view.valueCents)}), ohne Kassa. Die Aufteilung Soll/Ist verwendet
                      dagegen das ausgewählte Netto-Allokationsuniversum einschließlich
                      Anlage-Kassa.
                    </p>
                    <p className="vnote">
                      Werte in EUR, Kurse in der gespeicherten Kurswährung. „seit Kauf“ zeigt den
                      Wertzuwachs auf den dokumentierten Einstand (
                      {view.costMethod === 'fifo' ? 'FIFO' : 'gleitender Durchschnitt'}).
                    </p>
                  </section>
                )}
              </>
            )}

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
          <SavingsSection navigationPath="/vermoegen/portfolio/sparplaene" />
        )}
        {register === 'metrics' && (
          <section aria-labelledby="portfolio-metrics-title">
            <h2 id="portfolio-metrics-title">Kennzahlen</h2>
            <AppLink className="vlook" to="/reports/prendite" search={{ zeitraum: period }}>
              Portfolio-Auswertung öffnen
            </AppLink>
          </section>
        )}
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
    </PageFrame>
  );
}
function PortfolioLead({ view }: { view: PortfolioPositionsView }) {
  useAmountPrivacy();
  const parts = view.valueCents === null ? null : eurParts(view.valueCents);
  return (
    <section className="vnw" aria-labelledby="portfolio-title">
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
      <p className="vnote">Wertpapiere ohne Depot-Bargeld</p>
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
        <p className="vnote">
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
