import { Button, privateAmount, useAmountPrivacy } from '@budget/ui';
import type { RefObject } from 'react';
import type { Period } from '@budget/domain';
import { AppLink } from '../shell/app-link';
import { longDay } from '../ledger/format';
import { LoadingNote, ErrorNote } from '../ledger/states';
import { useElementWidth } from '../charts/use-element-width';
import type { PortfolioPosition, SecurityRecord } from './portfolio-api';
import { INSTRUMENT_KIND } from './instrument-form';
import { basisReason, moneyText, quoteStand, quoteText, unitsText } from './portfolio-format';
import {
  InstrumentHistoryDrawing,
  PriceHistory,
  type InstrumentHistoryController,
} from './price-history';
import { TradeHistory } from './trade-history';

/** Presentation only: the same history snapshot, editor callbacks and actual-trade list. */
export function InstrumentV3({
  security,
  position,
  state,
  history,
  asOf,
  period,
  heading,
  saving,
  canQuote,
  onEdit,
  onQuote,
  onTrade,
  onRetry,
}: {
  security: SecurityRecord;
  position: PortfolioPosition | undefined;
  state: 'loading' | 'unavailable' | 'ready';
  history: InstrumentHistoryController;
  asOf: string | undefined;
  period: Period;
  heading: RefObject<HTMLHeadingElement | null>;
  saving: boolean;
  canQuote: boolean;
  onEdit: () => void;
  onQuote: () => void;
  onTrade: (id: string) => void;
  onRetry: () => void;
}) {
  useAmountPrivacy();
  const [frame, width] = useElementWidth<HTMLDivElement>();
  const snapshot = history.query.isError ? undefined : history.query.data?.history;
  return (
    <section className="instrument-detail wealth-instrument-v3" aria-label={security.name}>
      <div className="wealth-instrument-head">
        <h2 tabIndex={-1} ref={heading}>
          {security.name}
        </h2>
        <span className="wealth-pill">{INSTRUMENT_KIND[security.kind]}</span>
        <span className="wealth-toolbar-spacer" />
        <Button variant="ghost" disabled={saving} onClick={() => onTrade('neu')}>
          Handel erfassen
        </Button>
        {canQuote && (
          <Button variant="ghost" disabled={saving} onClick={onQuote}>
            Kurs eintragen
          </Button>
        )}
      </div>
      <dl className="wealth-instrument-strip">
        <div>
          <dt>Kurs</dt>
          <dd className="instrument-quote">
            {quoteText(position?.quote ?? null)}
            <small>{quoteStand(position?.quote ?? null)}</small>
          </dd>
        </div>
        <div>
          <dt>Position · EUR</dt>
          <dd>
            {position
              ? moneyText(position.valueCents)
              : state === 'ready'
                ? 'Kein Bestand'
                : 'Nicht verfügbar'}
            {position && <small>Wertzuwachs {moneyText(position.gainCents)}</small>}
          </dd>
        </div>
        <div>
          <dt>Einstand · EUR</dt>
          <dd>{position ? moneyText(position.costCents) : '—'}</dd>
        </div>
        <div>
          <dt>Stück</dt>
          <dd>{position ? privateAmount(unitsText(position.unitsE8)) : '—'}</dd>
        </div>
        <div>
          <dt>Quelle</dt>
          <dd>
            {position?.accounts.map((row) => row.name).join(' · ') || 'Kein Bestand'}
            <small>
              Stichtag {snapshot ? longDay(snapshot.to) : asOf ? longDay(asOf) : 'nicht verfügbar'}
            </small>
          </dd>
        </div>
      </dl>
      {state === 'loading' && <LoadingNote what="Bestände" />}
      {state === 'unavailable' && (
        <ErrorNote what="Bestände" error={history.query.error} onRetry={onRetry} />
      )}
      {state === 'ready' && !position && (
        <p className="vnote">
          {snapshot?.to && snapshot.to !== asOf
            ? 'Dieses Instrument hat am gewählten Stichtag keinen Bestand.'
            : 'Dieses Instrument hat keinen aktuellen Bestand.'}
        </p>
      )}
      {position?.costCents === null && <p className="vnote">{basisReason(position.accounts)}</p>}
      {history.query.isPaused && (
        <p className="vnote" role="status">
          Offline · letzter verfügbarer Stand
        </p>
      )}
      <div className="wealth-instrument-columns">
        <div>
          <section
            className="wealth-sheet wealth-instrument-value"
            aria-labelledby="instrument-v3-value-title"
          >
            <div className="wealth-section-head">
              <h3 id="instrument-v3-value-title">Wert und Einstand</h3>
              <AppLink to="/reports/prendite" search={{ zeitraum: period }}>
                Performance → Vermögensreport
              </AppLink>
            </div>
            <div ref={frame}>
              {snapshot && !snapshot.unavailable && snapshot.points.length > 0 && width > 100 ? (
                <InstrumentHistoryDrawing
                  mode="value"
                  width={width}
                  prices={[]}
                  history={snapshot}
                  from={snapshot.from}
                  to={snapshot.to}
                  compact
                />
              ) : (
                <p className="vnote">
                  {history.query.isPending
                    ? 'Wertverlauf wird geladen.'
                    : 'Wertverlauf nicht verfügbar. Fehlende Bewertungen bleiben Lücken.'}
                </p>
              )}
            </div>
            <p className="vnote">
              — Wert aller Kontobestände in EUR, ohne Kassa · gestrichelt: dokumentierter
              Stichtag-Einstand · ○ Kauf / Verkauf
            </p>
          </section>
          <details className="wealth-details">
            <summary>Zeitraum, gespeicherte Kurse und Bewertungsquellen</summary>
            <PriceHistory securityId={security.id} controller={history} chartSuffix="-expanded" />
          </details>
          <details className="wealth-details wealth-instrument-holdings">
            <summary>Bestand je Konto</summary>
            {position ? (
              <>
                <table className="instrument-accounts wealth-table">
                  <caption className="sr-only">
                    Bestand des Instruments je Konto und Plattform
                  </caption>
                  <thead>
                    <tr>
                      <th>Konto / Plattform</th>
                      <th className="num">Stück / Wert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {position.accounts.map((row) => (
                      <tr key={row.accountId}>
                        <th scope="row">
                          <AppLink to={`/konten/${encodeURIComponent(row.accountId)}`}>
                            {row.name}
                          </AppLink>
                          <small>{row.institution ?? 'Kein Institut zugeordnet'}</small>
                        </th>
                        <td className="num">
                          {privateAmount(unitsText(row.unitsE8))}
                          <small>
                            {row.valueCents === null
                              ? row.valueStatus === 'missing_price'
                                ? 'Kurs fehlt'
                                : 'Wechselkurs fehlt'
                              : `${moneyText(row.valueCents)}${row.valueStatus === 'estimated' ? ' · geschätzt' : ''}`}
                          </small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="vnote">
                  Dieselbe Bewertung wie im Wertverlauf. Einstand {moneyText(position.costCents)} ·
                  Wertzuwachs {moneyText(position.gainCents)}
                </p>
              </>
            ) : (
              <p className="vnote">Kein bewerteter Bestand zum Stichtag verfügbar.</p>
            )}
          </details>
        </div>
        <div className="wealth-instrument-aside">
          <div className="wealth-sheet">
            <TradeHistory securityId={security.id} onEdit={onTrade} disabled={saving} compact />
          </div>
          <section className="wealth-sheet" aria-labelledby="instrument-v3-metadata">
            <div className="wealth-section-head">
              <h3 id="instrument-v3-metadata">Stammdaten</h3>
              <Button variant="ghost" disabled={saving} onClick={onEdit}>
                Stammdaten bearbeiten
              </Button>
            </div>
            <dl className="wealth-instrument-master">
              {[
                ['ISIN', security.isin ?? '—'],
                ['Art', INSTRUMENT_KIND[security.kind]],
                ['Währung', security.currency],
                ['Symbol', security.symbol ?? '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </section>
  );
}
