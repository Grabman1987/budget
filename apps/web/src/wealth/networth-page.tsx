import { DimensionChain } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { VERMOEGEN_NETTO_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { eurParts, eurWhole } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { netWorthQuery, type CompositionRow, type NetWorthView } from './api';
import { NetWorthChart } from './networth-chart';
import { chainTerms, periodText } from './networth-model';
import { useZeitraum } from './zeitraum';

/** Vermögen › Nettovermögen: the figure with its Maßkette, the daily course and what it consists of. */
export function NetWorthPage() {
  const [zeitraum] = useZeitraum();
  const query = useQuery(netWorthQuery(zeitraum));
  const view = query.data;
  const empty =
    view &&
    view.composition.assets.length === 0 &&
    view.composition.debts.length === 0 &&
    view.chain.nowCents === 0;

  return (
    <PageFrame meta={VERMOEGEN_NETTO_META}>
      <div className="kview vview">
        {query.isPending && <LoadingNote what="Vermögenswerte" />}
        {query.isError && (
          <ErrorNote
            what="Vermögenswerte"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {empty && <EmptyNote>Noch keine Konten. Lege unter Konten ein Konto an.</EmptyNote>}
        {view && !empty && (
          <>
            <Course view={view} />
            <Composition view={view} />
          </>
        )}
      </div>
    </PageFrame>
  );
}

function Course({ view }: { view: NetWorthView }) {
  const { chain } = view;
  const text = periodText(view.period, view.from);
  const { whole, fraction } = eurParts(chain.nowCents);
  const up = chain.deltaCents >= 0;
  const Arrow = up ? ArrowUp : ArrowDown;

  return (
    <section className="vnw vnw-wide" aria-labelledby="nw-title">
      <div className="tbd-head">
        <h2 id="nw-title">Nettovermögen</h2>
        <span className="tbd-state">
          <span className={up ? 'ok' : 'ink'} data-testid="nw-state">
            <Arrow className="icon icon-sm" size={16} strokeWidth={1.75} aria-hidden="true" />
            {eurWhole(chain.deltaCents, true)} · {text}
          </span>
        </span>
      </div>
      <div className="tbd-fig" data-testid="nw-figure">
        {whole}
        <span className="cents">,{fraction} €</span>
      </div>
      <NetWorthChart view={view} periodLabel={text} />
      <div className="legend" aria-hidden="true">
        <span>
          <svg viewBox="0 0 26 8">
            <path className="l-actual" d="M0 4h26" />
          </svg>
          Nettovermögen, täglich
        </span>
        <span>
          <i className="lg-sq lg-own" />
          Eigenleistung
        </span>
        <span>
          <i className="lg-sq lg-mkt" />
          Markt
        </span>
      </div>
      <DimensionChain
        terms={chainTerms(chain, view.from)}
        label="Maßkette Nettovermögen im Zeitraum"
      />
      <p className="vnote">
        Eigenleistung = was du eingezahlt hast (Einnahmen minus Ausgaben). Markt = alles andere:
        Kurse, Zinsen, Bewertungen.
      </p>
    </section>
  );
}

function Composition({ view }: { view: NetWorthView }) {
  const { assets, debts } = view.composition;
  const max = Math.max(...assets.map((a) => a.valueCents), ...debts.map((d) => -d.valueCents), 1);
  const row = (r: CompositionRow, debt: boolean) => (
    <li key={r.accountId} className={debt ? 'is-debt' : undefined}>
      <span className="vb-name">{r.name}</span>
      <span className="vb-bar">
        <i style={{ width: `${(Math.abs(r.valueCents) / max) * 100}%` }} />
      </span>
      <span className="vb-val">{eurWhole(r.valueCents)}</span>
    </li>
  );
  return (
    <section className="vcomp" aria-labelledby="comp-title">
      <div className="tbd-head">
        <h2 id="comp-title">Woraus es besteht</h2>
      </div>
      <ul className="vbars">
        {assets.map((r) => row(r, false))}
        {debts.map((r) => row(r, true))}
      </ul>
      {debts.length > 0 && <p className="vnote">Gestrichelt: Schulden, werden abgezogen.</p>}
    </section>
  );
}
