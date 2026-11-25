import { useQuery } from '@tanstack/react-query';
import { pickTradePrice } from '@budget/domain';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useAmountPrivacy } from '@budget/ui';
import { portfolioPositionsQuery } from '../wealth/portfolio-api';
import { moneyText, percentText, quoteText, unitsText } from '../wealth/portfolio-format';
import { TRADE_LABELS } from '../wealth/trade-draft';
import { sourceMoney } from '../wealth/trade-api';
import { accountsQuery } from './queries';
import { AccountRegister } from './account-register';
import { AccountReview } from './account-review';
import { AccountFreshness } from './account-freshness';
import { depotHoldings } from './depot-model';
import { depotTradesQuery } from './depot-queries';
import { longDay, nativeCurrency } from './format';
import { EmptyNote, ErrorNote, LoadingNote } from './states';
import type { AccountRow } from './types';
import './depot.css';
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { BankBalance } from './bank-balance';
import { List } from 'lucide-react';
import { DepotHistory } from './depot-history';

const TABS = { bestaende: 'Bestände', trades: 'Trades', verrechnung: 'Verrechnung' } as const;
type DepotTab = keyof typeof TABS;

export function DepotBody({
  account,
  bankReview,
}: {
  account: AccountRow;
  bankReview?: ReactNode;
}) {
  useAmountPrivacy();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [account.id]);
  // Raw location retains this page-local parameter without extending the shared route schema.
  const requested = useLocation({
    select: (location) => location.search as { depot?: string },
  }).depot;
  const tab: DepotTab =
    requested === 'trades' || requested === 'verrechnung' ? requested : 'bestaende';
  const navigate = useNavigate();
  const positions = useQuery(portfolioPositionsQuery());
  const accounts = useQuery(accountsQuery());
  const settlement = accounts.data?.accounts.find((a) => a.id === account.referenceAccountId);
  const depot = positions.data && depotHoldings(positions.data, account.id);
  return (
    <div className={`depot${REDESIGN_ENABLED ? ' depot-v1' : ''}`} data-testid="depot-page">
      {REDESIGN_ENABLED ? (
        <div className="depot-v1-head">
          <h2 className="depot-name" ref={heading} tabIndex={-1}>
            {account.name}
          </h2>
          <div className="depot-v1-actions">
            {' '}
            {REDESIGN_ENABLED && (
              <Link
                className="btn btn-ghost depot-register-jump"
                to="/konten/$id"
                params={{ id: account.id }}
                search={
                  ((previous: Record<string, unknown>) => ({
                    ...previous,
                    depot: 'verrechnung',
                  })) as never
                }
              >
                <List size={16} aria-hidden="true" />
                <span className="sr-only">Verrechnung und Buchungen</span>
              </Link>
            )}
            <AccountReview account={account} />
          </div>
        </div>
      ) : (
        <h2 className="depot-name" ref={heading} tabIndex={-1}>
          {account.name}
        </h2>
      )}

      {positions.isPending && <LoadingNote what="Depotwert" />}
      {positions.isError && (
        <ErrorNote
          what="Depotwert"
          error={positions.error}
          onRetry={() => void positions.refetch()}
        />
      )}
      <div className="kfigs depot-headline">
        <div className="fig">
          <small>Depotwert</small>
          <strong
            data-testid="depot-value"
            title={depot ? `Bewertung zum ${longDay(depot.asOf)}` : undefined}
          >
            {depot?.incomplete ? '≈ ' : ''}
            {depot
              ? depot.valueCents === null
                ? 'Unvollständig'
                : moneyText(depot.valueCents)
              : '—'}
          </strong>
          {account.balanceCents !== 0 && (
            <p className="depot-cash" data-testid="depot-cash">
              Bargeld im Depotkonto: {nativeCurrency(account.balanceCents, account.currency)}
            </p>
          )}
        </div>
        {settlement && (
          <Link
            className="depot-settlement-fig"
            data-testid="depot-settlement"
            to="/konten/$id"
            params={{ id: settlement.id }}
          >
            <small>Verrechnungskonto</small>
            <span className="sr-only">{settlement.name}</span>
            <strong>{nativeCurrency(settlement.balanceCents, settlement.currency)}</strong>
          </Link>
        )}
        {!REDESIGN_ENABLED && (
          <AccountFreshness
            lastReconciledOn={account.lastReconciledOn}
            bankBalance={account.closedAt ? undefined : account.bankBalance}
          />
        )}
        {!REDESIGN_ENABLED && (
          <div className="kacct-actions">
            <AccountReview account={account} />
          </div>
        )}
      </div>
      {REDESIGN_ENABLED && (
        <details className="kacct-source">
          <summary>Datenstand und Bankstand</summary>
          <AccountFreshness
            lastReconciledOn={account.lastReconciledOn}
            bankBalance={account.closedAt ? undefined : account.bankBalance}
          />
          <BankBalance account={account} />
        </details>
      )}
      <DepotHistory accountId={account.id} />
      {!REDESIGN_ENABLED && bankReview}
      <DepotTabs
        tab={tab}
        onSelect={(key) =>
          void navigate({
            to: '/konten/$id',
            params: { id: account.id },
            search: ((previous: Record<string, unknown>) => ({
              ...previous,
              depot: key,
            })) as never,
          })
        }
      />
      <div role="tabpanel" id={`depot-panel-${tab}`} aria-labelledby={`depot-tab-${tab}`}>
        {tab === 'bestaende' && (
          <section aria-label="Bestände">
            <div className="depot-panel-actions">
              <Link className="depot-link" to="/vermoegen/portfolio">
                Rendite im Portfolio
              </Link>
            </div>
            {depot?.rows.length === 0 && (
              <EmptyNote>Noch keine Bestände auf diesem Depot.</EmptyNote>
            )}
            {depot && depot.rows.length > 0 && (
              <table className="depot-table">
                <caption className="sr-only">
                  Bestände zum {longDay(depot.asOf)} · Werte in EUR
                </caption>
                <thead>
                  <tr>
                    {['Name', 'Stück', 'Kurs', 'Wert', 'Anteil'].map((label) => (
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {depot.rows.map((row) => (
                    <tr key={row.securityId}>
                      <th scope="row" data-label="Name">
                        <Link
                          className="depot-link"
                          to="/vermoegen/portfolio/instrument/$id"
                          params={{ id: row.securityId }}
                        >
                          {row.securityName}
                        </Link>
                      </th>
                      <td data-label="Stück">{unitsText(row.unitsE8)}</td>
                      <td data-label="Kurs">
                        {quoteText(row.quote)}
                        {row.quote && <small>{longDay(row.quote.date)}</small>}
                      </td>
                      <td data-label="Wert">
                        {row.valueStatus === 'estimated' ? '≈ ' : ''}
                        {row.valueCents === null
                          ? row.valueStatus === 'missing_fx'
                            ? 'Wechselkurs fehlt'
                            : 'Kurs fehlt'
                          : moneyText(row.valueCents)}
                        {row.valueStatus === 'estimated' && <small>Einstand · Kurs fehlt</small>}
                      </td>
                      <td data-label="Anteil">
                        {depot.incomplete ? '—' : percentText(row.shareBp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
        {tab === 'trades' && (
          <DepotTrades
            account={account}
            onEdit={(securityId, tradeId) =>
              void navigate({
                to: '/vermoegen/portfolio/instrument/$id',
                params: { id: securityId },
                search: { handel: tradeId },
              } as never)
            }
          />
        )}
        {tab === 'verrechnung' && (
          <>
            {!settlement && <p className="kmeta">Kein separates Verrechnungskonto verknüpft.</p>}
            <AccountRegister account={settlement ?? account} showTodayBalance={false} />
          </>
        )}
      </div>
      {REDESIGN_ENABLED && (
        <details className="account-bank-queue">
          <summary>Bankumsätze prüfen</summary>
          {bankReview}
        </details>
      )}
    </div>
  );
}

function DepotTabs({ tab, onSelect }: { tab: DepotTab; onSelect: (tab: DepotTab) => void }) {
  const keys = Object.keys(TABS) as DepotTab[];
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (event: KeyboardEvent, from: number) => {
    const target =
      event.key === 'ArrowRight'
        ? (from + 1) % keys.length
        : event.key === 'ArrowLeft'
          ? (from + keys.length - 1) % keys.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? keys.length - 1
              : -1;
    if (target < 0) return;
    event.preventDefault();
    onSelect(keys[target]!);
    refs.current[keys[target]!]?.focus();
  };
  return (
    <div className="depot-tabs" role="tablist" aria-label="Depotansicht">
      {keys.map((key, i) => (
        <button
          key={key}
          ref={(node) => {
            refs.current[key] = node;
          }}
          type="button"
          role="tab"
          id={`depot-tab-${key}`}
          aria-selected={tab === key}
          aria-controls={`depot-panel-${key}`}
          tabIndex={tab === key ? 0 : -1}
          onClick={() => onSelect(key)}
          onKeyDown={(event) => move(event, i)}
        >
          {TABS[key]}
        </button>
      ))}
    </div>
  );
}

function DepotTrades({
  account,
  onEdit,
}: {
  account: AccountRow;
  onEdit: (securityId: string, tradeId: string) => void;
}) {
  const query = useQuery(depotTradesQuery(account.id));
  return (
    <section aria-label="Trades">
      {query.isPending && <LoadingNote what="Trades" />}
      {query.isError && (
        <ErrorNote what="Trades" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.data?.trades.length === 0 && (
        <EmptyNote>Noch keine Trades auf diesem Depot.</EmptyNote>
      )}
      {query.data && query.data.trades.length > 0 && (
        <table className="depot-table depot-trades">
          <caption className="sr-only">Trades · Gebühren und Steuern in den Details</caption>
          <thead>
            <tr>
              {['Datum', 'Art', 'Stück', 'Kurs', 'Betrag'].map((label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {query.data.trades
              .slice()
              .reverse()
              .map((trade) => {
                const quote = pickTradePrice([trade], trade.date, account.currency)?.price;
                return (
                  <tr
                    key={trade.id}
                    onClick={(event) => {
                      if (!(event.target as HTMLElement).closest('button, summary, details'))
                        onEdit(trade.securityId, trade.id);
                    }}
                  >
                    <td data-label="Datum">{longDay(trade.date)}</td>
                    <th scope="row" data-label="Art">
                      <button
                        className="depot-link"
                        type="button"
                        onClick={() => onEdit(trade.securityId, trade.id)}
                      >
                        {TRADE_LABELS[trade.kind]} bearbeiten
                      </button>
                    </th>
                    <td data-label="Stück">
                      {unitsText(
                        trade.kind === 'buy' || trade.kind === 'sell'
                          ? Math.abs(trade.unitsE8)
                          : trade.unitsE8,
                      )}
                    </td>
                    <td data-label="Kurs">
                      {quote ? quoteText({ ...quote, source: 'trade' }) : '—'}
                    </td>
                    <td data-label="Betrag">
                      {sourceMoney(trade.amountCents, account.currency)}
                      <details>
                        <summary>Details</summary>Gebühren:{' '}
                        {sourceMoney(trade.feeCents, account.currency)}
                        <br />
                        Steuern: {sourceMoney(trade.taxCents, account.currency)}
                        {trade.note && <p>{trade.note}</p>}
                      </details>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      )}
    </section>
  );
}
