import { Button, privateAmount, useAmountPrivacy } from '@budget/ui';
import { mulDivRound, ratioBp, periodWindow, type Period } from '@budget/domain';
import { AppLink } from '../shell/app-link';
import { EmptyNote } from '../ledger/states';
import { eur, nativeCurrency, longDay } from '../ledger/format';
import type { PortfolioPositionsView, SecurityRecord } from './portfolio-api';
import {
  basisReason,
  moneyText,
  percentText as rawPercentText,
  quoteText,
  quoteStand,
} from './portfolio-format';
import { WealthActivities, InvestmentAccounts } from './redesign-positions';
import { matchesAsset, type AssetType } from './redesign-filters';
import { INSTRUMENT_KIND } from './instrument-form';

export function PositionsV3({
  view,
  securities,
  art,
  period,
  activities,
  onMode,
  onSelect,
  onTrade,
}: {
  view: PortfolioPositionsView;
  securities: SecurityRecord[];
  art: AssetType;
  period: Period;
  activities: boolean;
  onMode: (activities: boolean) => void;
  onSelect: (id: string) => void;
  onTrade: (id: string, security?: string) => void;
}) {
  useAmountPrivacy();
  // A security may contribute to several allocation classes. List the whole position once.
  const positions = view.positions ?? [
    ...new Map(
      view.classes.flatMap((group) => group.positions).map((row) => [row.securityId, row]),
    ).values(),
  ];
  const visible = positions.filter((row) => {
    const security = securities.find((item) => item.id === row.securityId);
    return art === 'alle' || (!!security && matchesAsset(security.kind, art));
  });
  const held = new Set(positions.map((row) => row.securityId));
  const unheld = securities.filter((row) => !held.has(row.id) && matchesAsset(row.kind, art));
  const groups = art === 'alle' ? (['wertpapiere', 'krypto', 'p2p', 'unbekannt'] as const) : [art];
  return (
    <section className="wealth-positions-v3" aria-labelledby="positions-title">
      <h2
        id="positions-title"
        className="sr-only"
        tabIndex={-1}
        ref={(element) => {
          if (element && window.location.hash === '#positions-title') {
            element.scrollIntoView({ block: 'start' });
            element.focus({ preventScroll: true });
          }
        }}
      >
        Positionen
      </h2>
      <div className="wealth-position-strip">
        <span>
          Wert{' '}
          <strong data-testid="portfolio-value">
            {view.valueCents === null ? 'Bewertung unvollständig' : moneyText(view.valueCents)}
          </strong>
        </span>
        <span>
          Gewinn seit Kauf{' '}
          <b data-testid="portfolio-gain">
            {moneyText(view.gainCents)} ·{' '}
            {percentText(
              view.costCents && view.gainCents !== null
                ? ratioBp(view.gainCents, view.costCents)
                : null,
              true,
            )}
          </b>
        </span>
        <AppLink to="/reports/prendite" search={{ zeitraum: period }}>
          Auswertung → Vermögensreport
        </AppLink>
      </div>
      {view.costCents === null && (
        <p className="vnote" role="status">
          {basisReason(positions.flatMap((row) => row.accounts))}
        </p>
      )}
      <div className="wealth-position-controls">
        <div className="wealth-position-mode" role="group" aria-label="Positionen anzeigen">
          <Button variant="ghost" aria-pressed={!activities} onClick={() => onMode(false)}>
            Positionen
          </Button>
          <Button variant="ghost" aria-pressed={activities} onClick={() => onMode(true)}>
            Aktivitäten
          </Button>
        </div>
      </div>
      {activities ? (
        <WealthActivities
          art={art}
          from={periodWindow(period, view.asOf).from}
          to={view.asOf}
          onEdit={onTrade}
        />
      ) : (
        <>
          {visible.length === 0 ? (
            <EmptyNote>Keine Positionen zum {longDay(view.asOf)} vorhanden.</EmptyNote>
          ) : (
            <div className="wealth-position-table-wrap">
              <table className="wealth-table wealth-position-table">
                <caption className="sr-only">Positionen nach Anlageart</caption>
                <thead>
                  <tr>
                    {[
                      'Name',
                      'Klasse',
                      'Stück',
                      'Einstandskurs',
                      'Aktueller Kurs',
                      'Kursdatum',
                      'Marktwert',
                      'Einstand',
                      'Gewinn €',
                      'Gewinn %',
                      'Anteil',
                      '',
                    ].map((label) => (
                      <th key={label} scope="col">
                        {label || <span className="sr-only">Öffnen</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((kind) => {
                    const rows = visible.filter((row) => {
                      const security = securities.find((item) => item.id === row.securityId);
                      return kind === 'unbekannt'
                        ? !security
                        : !!security && matchesAsset(security.kind, kind);
                    });
                    return rows.length ? (
                      <Rows
                        key={kind}
                        label={
                          art === 'alle'
                            ? kind === 'wertpapiere'
                              ? 'Wertpapiere'
                              : kind === 'krypto'
                                ? 'Krypto'
                                : kind === 'p2p'
                                  ? 'P2P'
                                  : 'Art nicht verfügbar'
                            : undefined
                        }
                        rows={rows}
                        securities={securities}
                        classes={view.classes}
                        onSelect={onSelect}
                      />
                    ) : null;
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Summe · gesamter Bestand</th>
                    <td colSpan={5} />
                    <td className="num">{moneyText(view.valueCents)}</td>
                    <td className="num">{moneyText(view.costCents)}</td>
                    <td className="num">{moneyText(view.gainCents)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <details className="wealth-details">
            <summary>Krypto- und P2P-Konten · Kontowerte und Bewertung</summary>
            <InvestmentAccounts art={art} />
          </details>
          {!!unheld.length && (
            <details className="wealth-details instrument-catalog">
              <summary>Instrumente ohne Bestand ({unheld.length})</summary>
              <ul className="wealth-catalog">
                {unheld.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="portfolio-product"
                      data-portfolio-security={row.id}
                      onClick={() => onSelect(row.id)}
                    >
                      {row.name}
                    </button>
                    <span>
                      {INSTRUMENT_KIND[row.kind]} · {row.currency}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <details className="wealth-details">
        <summary>Datenbasis und Spalten</summary>
        <p className="vnote">
          Stand {longDay(view.asOf)}. Anlageart filtert die Liste. Wert, Gewinn und Anteilsbasis
          behalten den gesamten bewerteten Instrumentenbestand ohne Kassa. Einstand in EUR nach{' '}
          {view.costMethod === 'fifo' ? 'FIFO' : 'gleitendem Durchschnitt'}; kein separat
          gespeicherter Einstandskurs. Kurse in der gespeicherten Kurswährung; Kontenzuordnung und
          Bewertungsquelle stehen im Instrument.
        </p>
      </details>
    </section>
  );
}
function Rows({
  label,
  rows,
  securities,
  classes,
  onSelect,
}: {
  label?: string | undefined;
  rows: PortfolioPositionsView['positions'];
  securities: SecurityRecord[];
  classes: PortfolioPositionsView['classes'];
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {label && (
        <tr className="wealth-position-group">
          <th scope="rowgroup" colSpan={12}>
            {label}
          </th>
        </tr>
      )}
      {rows.map((row) => (
        <tr key={row.securityId}>
          <th scope="row">
            <button
              type="button"
              className="portfolio-product"
              data-portfolio-security={row.securityId}
              onClick={() => onSelect(row.securityId)}
            >
              {row.name}
            </button>
            <span className="wealth-phone-position">
              {privateAmount(
                new Intl.NumberFormat('de-AT', { maximumFractionDigits: 4 }).format(
                  row.unitsE8 / 1e8,
                ),
              )}{' '}
              Stk. · {percentText(row.gainBp, true)}
              <br />
              EK {basisPerUnit(row.costCents, row.unitsE8)} · Kurs{' '}
              {row.quote
                ? nativeCurrency(Math.round(row.quote.priceMicro / 10000), row.quote.currency)
                : 'Kurs fehlt'}
              <br />
              {quoteStand(row.quote)}
            </span>
          </th>
          <td>
            {classes
              .filter((group) => group.positions.some((item) => item.securityId === row.securityId))
              .map((group) => group.name)
              .join(' · ') ||
              INSTRUMENT_KIND[
                securities.find((item) => item.id === row.securityId)?.kind ?? 'other'
              ]}
          </td>
          <td className="num">
            {privateAmount(
              new Intl.NumberFormat('de-AT', { maximumFractionDigits: 4 }).format(
                row.unitsE8 / 1e8,
              ),
            )}
          </td>
          <td
            className="num"
            title="Dokumentierter Einstand in EUR je Stück, einschließlich Einstandskosten"
          >
            {basisPerUnit(row.costCents, row.unitsE8)}
          </td>
          <td className="num" title={quoteText(row.quote)}>
            {row.quote
              ? nativeCurrency(Math.round(row.quote.priceMicro / 10000), row.quote.currency)
              : 'Kurs fehlt'}
          </td>
          <td>{row.quote ? longDay(row.quote.date) : 'Kurs fehlt'}</td>
          <td className="num wealth-mobile-value">{moneyText(row.valueCents)}</td>
          <td
            className="num"
            title={row.costCents === null ? basisReason(row.accounts) : undefined}
          >
            {moneyText(row.costCents)}
          </td>
          <td className="num">{moneyText(row.gainCents)}</td>
          <td className="num">{percentText(row.gainBp, true)}</td>
          <td className="num">{percentText(row.shareBp)}</td>
          <td>
            <button
              className="wealth-chevron"
              type="button"
              aria-label={`${row.name} öffnen`}
              onClick={() => onSelect(row.securityId)}
            >
              ›
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}

function basisPerUnit(cost: number | null, unitsE8: number) {
  if (cost === null || unitsE8 <= 0) return '—';
  const rounded = mulDivRound(cost, 100000000, unitsE8);
  return Number.isSafeInteger(rounded) ? eur(rounded) : '—';
}

const percentText = (...args: Parameters<typeof rawPercentText>) =>
  privateAmount(rawPercentText(...args));
