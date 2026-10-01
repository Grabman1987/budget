import { DimensionChain } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ChartNoAxesCombined, ChevronRight } from 'lucide-react';
import { VERMOEGEN_PORTFOLIO_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { ErrorNote, LoadingNote, EmptyNote } from '../ledger/states';
import { eurParts, eurWhole, longDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import {
  portfolioPositionsQuery,
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
import './portfolio.css';

export function PortfolioPage() {
  const query = useQuery(portfolioPositionsQuery());
  const search = useSearch({ strict: false }) as { produkt?: string };
  const navigate = useNavigate();
  const select = (produkt?: string) =>
    void navigate({
      to: '/vermoegen/portfolio',
      search: ((prev: Record<string, unknown>) => ({ ...prev, produkt })) as never,
    });
  const view = query.data;
  return (
    <PageFrame meta={VERMOEGEN_PORTFOLIO_META}>
      <div className="kview vview portfolio-view">
        {query.isPending && <LoadingNote what="Positionen" />}
        {query.isError && (
          <ErrorNote what="Positionen" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {view && (
          <>
            <PortfolioLead view={view} />
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
                        Anteil
                      </th>
                      <th scope="col" className="num tech">
                        seit Kauf
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.classes.map((group, gi) => (
                      <GroupRows key={group.id ?? 'none'} group={group} gi={gi} onSelect={select} />
                    ))}
                  </tbody>
                </table>
                <p className="vnote">
                  Werte in EUR, Kurse in der gespeicherten Kurswährung. „seit Kauf“ zeigt den
                  Wertzuwachs auf den dokumentierten Einstand (
                  {view.costMethod === 'fifo' ? 'FIFO' : 'gleitender Durchschnitt'}).
                </p>
              </section>
            )}
          </>
        )}
      </div>
      <InstrumentPanel
        id={search.produkt ?? ''}
        position={view?.classes
          .flatMap((g) => g.positions)
          .find((p) => p.securityId === search.produkt)}
        asOf={view?.asOf}
        onClose={() => select()}
      />
    </PageFrame>
  );
}
function PortfolioLead({ view }: { view: PortfolioPositionsView }) {
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
      {view.chain ? (
        <DimensionChain terms={view.chain} label="Maßkette Portfoliowert" />
      ) : (
        <p className="vnote">
          {view.valueCents === null
            ? 'Mindestens ein Kurs oder Wechselkurs fehlt. Der Gesamtwert und die Anteile sind nicht berechenbar.'
            : `${basisReason(view.classes.flatMap((g) => g.positions.flatMap((p) => p.accounts)))}. Der gesamte Wertzuwachs ist nicht berechenbar.`}
        </p>
      )}
      <AppLink className="vlook" to="/reports/gruppe/portfolio">
        <ChartNoAxesCombined size={18} strokeWidth={1.75} aria-hidden="true" />
        <span>
          <strong>Reportkatalog Portfolio öffnen</strong>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </AppLink>
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
        <button type="button" className="portfolio-product" onClick={() => onSelect(p.securityId)}>
          {p.name}
        </button>
        <small className="portfolio-status">
          {p.valueCents === null ? unavailable : p.costCents === null ? basis : ''}
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
