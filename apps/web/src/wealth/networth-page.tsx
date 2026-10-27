import { ChartValue } from '@budget/ui';
import { useAmountPrivacy, DimensionChain } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { VERMOEGEN_NETTO_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { eur, eurParts, eurWhole } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { ValuationHint } from '../ledger/valuation-hint';
import { netWorthQuery, type CompositionRow, type NetWorthView } from './api';
import { NetWorthChart } from './networth-chart';
import { AssetComposition } from './asset-composition';
import { AssetCompositionChart } from './asset-composition-chart';
import {
  chainTerms,
  compositionGeometry,
  compositionWidthPercent,
  periodText,
} from './networth-model';
import { useZeitraum } from './zeitraum';
import { ZeitraumSwitch } from './frame';

/** Vermögen › Nettovermögen: the figure with its Maßkette, the daily course and what it consists of. */
export function NetWorthPage() {
  useAmountPrivacy();
  const [zeitraum] = useZeitraum();
  const query = useQuery(netWorthQuery(zeitraum));
  const view = query.data;
  const empty =
    view &&
    (view.assetComposition
      ? view.assetComposition.accounts.length === 0
      : view.composition.assets.length === 0 &&
        view.composition.debts.length === 0 &&
        view.chain.nowCents === 0);

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
            <ValuationHint incomplete={view.incomplete} />
            <Course view={view} />
            {view.assetComposition ? (
              <AssetComposition point={view.assetComposition} />
            ) : (
              <Composition view={view} />
            )}
          </>
        )}
      </div>
    </PageFrame>
  );
}

function Course({ view }: { view: NetWorthView }) {
  useAmountPrivacy();
  const { chain } = view;
  const [historyMode, setHistoryMode] = useState<'total' | 'composition'>('total');
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
      <ZeitraumSwitch />
      {view.assetCompositionHistory && (
        <div className="composition-switch" role="group" aria-label="Verlauf anzeigen">
          <button
            type="button"
            aria-pressed={historyMode === 'total'}
            onClick={() => setHistoryMode('total')}
          >
            Gesamt
          </button>
          <button
            type="button"
            aria-pressed={historyMode === 'composition'}
            onClick={() => setHistoryMode('composition')}
          >
            Zusammensetzung
          </button>
        </div>
      )}
      {historyMode === 'composition' && view.assetCompositionHistory ? (
        <AssetCompositionChart points={view.assetCompositionHistory} />
      ) : (
        <NetWorthChart view={view} periodLabel={text} />
      )}
      {historyMode === 'total' && (
        <div className="legend" aria-hidden="true">
          <span>
            <svg viewBox="0 0 26 8">
              <path className="l-actual" d="M0 4h26" />
            </svg>
            Nettovermögen, täglich
          </span>
          <span>
            <i className="lg-sq lg-own" />
            Gespart
          </span>
          <span>
            <i className="lg-sq lg-mkt" />
            Markt
          </span>
        </div>
      )}
      {view.assetComposition && !view.assetComposition.complete && (
        <p className="vnote">
          Die Gesamtzahl verwendet die bestehende Bewertungsbasis. Fehlende, geschätzte oder nicht
          aktuelle Einzelwerte sind in der Zusammensetzung gekennzeichnet.
        </p>
      )}
      <DimensionChain
        terms={chainTerms(chain, view.from)}
        label="Maßkette Nettovermögen im Zeitraum"
      />
      <p className="vnote">
        Gespart = was du eingezahlt hast (Einnahmen minus Ausgaben). Markt = alles andere: Kurse,
        Zinsen, Bewertungen.
      </p>
    </section>
  );
}

function Composition({ view }: { view: NetWorthView }) {
  useAmountPrivacy();
  const { assets, debts } = view.composition;
  const geometry = compositionGeometry(
    assets.map((row) => row.valueCents),
    debts.map((row) => row.valueCents),
  );
  const width = (valueCents: number) => compositionWidthPercent(valueCents, geometry.spanCents);
  const row = (r: CompositionRow, debt: boolean) => (
    <li key={r.accountId} className={debt ? 'is-debt' : undefined}>
      <span className="vb-name">{r.name}</span>
      <ChartValue
        label="Vermögenszusammensetzung"
        date={view.to}
        series={[{ name: 'Konto', value: eur(r.valueCents), color: 'var(--line)' }]}
      >
        <span
          className="vb-bar"
          data-zero-percent={geometry.zeroPercent}
          data-width-percent={width(r.valueCents)}
          style={{ '--zero': `${geometry.zeroPercent}%` } as CSSProperties}
        >
          <i
            style={{
              left:
                r.valueCents < 0
                  ? `${geometry.zeroPercent - width(r.valueCents)}%`
                  : `${geometry.zeroPercent}%`,
              width: `${width(r.valueCents)}%`,
            }}
          />
        </span>
      </ChartValue>
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
